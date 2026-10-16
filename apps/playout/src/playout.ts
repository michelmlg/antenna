/**
 * Máquina de estados do playout (port do engine.js do v1).
 * Tick a cada 5s: bloco agendado? duração acabou? FFmpeg caiu?
 * Prioridade de escolha: gênero da grade (mistura viva) → seleção automática → fallback.
 */
import { prisma } from "@antenna/database";
import type { PlayoutStatePayload } from "@antenna/shared";
import { composeCycle, fallbackMedia, selectAuto } from "@antenna/core";
import { currentBlock } from "@antenna/core";
import { config } from "./config";
import { isYoutube, killProc, probeVideoCodec, resolveInput, spawnFFmpeg } from "./engine";
import { writeState } from "./state";

type Picked = {
  media: { id: string; title: string; url: string; source: string; duration: number };
  program: { id: string; name: string } | null;
  isFallback?: boolean;
};

const state = {
  running: false,
  timer: null as ReturnType<typeof setInterval> | null,
  proc: null as ReturnType<typeof spawnFFmpeg> | null,
  current: null as (Picked & { startedAt: Date; historyId: string; pid: number | null }) | null,
  next: null as { title: string; program: string | null } | null,
  since: null as Date | null,
  cooldownUntil: 0,
  starting: false, // um startItem em andamento (evita dois FFmpeg juntos)
  errors: 0,
  restarts: 0,
  lastError: null as string | null,
  fallbackMediaId: config.fallbackMediaId,
};

function onFfmpegLine(line: string): void {
  state.lastError = line;
  console.log("[ffmpeg]", line);
}

// ---- bloco agendado agora (grade semanal) ----
async function scheduledProgram(): Promise<{ id: string; name: string; genreId: string | null; genreStatus: string; antiRepeatWindow: number; orderingPadrao: string; mixOverride: string | null } | null> {
  const rows = await prisma.programSchedule.findMany({
    include: { program: { include: { genre: true } } },
  });
  const entry = currentBlock(rows);
  if (!entry) return null;
  const p = entry.program;
  return {
    id: p.id,
    name: p.name,
    genreId: p.genreId,
    genreStatus: p.genre?.status ?? "ativo",
    antiRepeatWindow: p.genre?.antiRepeatWindow ?? 20,
    orderingPadrao: p.genre?.orderingPadrao ?? "menos_reproduzidos",
    mixOverride: p.mixOverride,
  };
}

// ---- próxima mídia: gênero (mistura viva) → automática → fallback ----
async function pickNext(program: Awaited<ReturnType<typeof scheduledProgram>>): Promise<Picked | null> {
  if (program && program.genreId && program.genreStatus !== "pausado") {
    const [item] = await composeCycle(
      program.genreId,
      1,
      program.mixOverride,
      state.current ? [state.current.media.id] : []
    );
    if (item) return { media: item.media, program };
  }

  const [auto] = await selectAuto({ recentCount: 10, limit: 1 });
  if (auto) return { media: auto, program };

  const fb = await fallbackMedia(state.fallbackMediaId);
  if (fb) return { media: fb, program: null, isFallback: true };
  return null;
}

async function finishCurrent(result: string): Promise<void> {
  const cur = state.current;
  if (!cur) return;
  state.current = null;
  try {
    const dur = Math.max(0, Math.round((Date.now() - cur.startedAt.getTime()) / 1000));
    await prisma.playbackHistory.update({
      where: { id: cur.historyId },
      data: { finishedAt: new Date(), duration: dur, result },
    });
  } catch (err) {
    console.error("[playout] history:", err instanceof Error ? err.message : err);
  }
}

async function startItem(picked: Picked, opts: { isFallbackRetry?: boolean } = {}): Promise<void> {
  if (state.starting) return; // serializa: impede dois FFmpeg juntos
  state.starting = true;
  try {
    await doStartItem(picked, opts);
  } finally {
    state.starting = false;
  }
}

async function doStartItem(picked: Picked, opts: { isFallbackRetry?: boolean } = {}): Promise<void> {
    let inputs: string[];
    try {
      inputs = await resolveInput(picked.media);
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      console.error("[playout]", state.lastError);
      if (!opts.isFallbackRetry) {
        const fb = await fallbackMedia(state.fallbackMediaId);
        if (fb && fb.id !== picked.media.id) {
          await doStartItem({ media: fb, program: null, isFallback: true }, { isFallbackRetry: true });
          return;
        }
      }
      state.cooldownUntil = Date.now() + 5000;
      return;
    }

    killProc(state.proc);
    state.proc = null;
    // YouTube: SEMPRE transcodifica; local: copy se h264
    const fromYT = isYoutube(picked.media.url, picked.media.source);
    const videoCodec = fromYT ? null : await probeVideoCodec(inputs[0]);
    const proc = spawnFFmpeg(inputs, videoCodec, onFfmpegLine);
    state.proc = proc;
    proc.on("exit", (code, signal) => {
      if (state.proc === proc) state.proc = null;
      if (state.running && code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
        state.errors += 1;
        state.restarts += 1;
        state.cooldownUntil = Date.now() + 3000;
        console.log(`[playout] ffmpeg encerrou (code=${code}, signal=${signal}) — restart em 3s`);
      }
    });

    const startedAt = new Date();
    const history = await prisma.playbackHistory.create({
      data: {
        mediaId: picked.media.id,
        programId: picked.program ? picked.program.id : null,
        channel: config.channel,
        startedAt,
        duration: 0,
        result: picked.isFallback ? "fallback" : "playing",
      },
    });
    state.current = { ...picked, startedAt, historyId: history.id, pid: proc.pid ?? null };
    console.log(
      `[playout] >>> ${picked.media.title}${picked.program ? " (" + picked.program.name + ")" : ""} pid=${proc.pid}`
    );
}

// ---- tick ----
async function tick(): Promise<void> {
  if (!state.running) return;
  if (state.starting) return;
  if (Date.now() < state.cooldownUntil) {
    return;
  }

  try {
    const procAlive = !!(state.proc && state.proc.exitCode === null && !state.proc.killed);
    const program = await scheduledProgram();

    if (!procAlive && state.current) {
      await finishCurrent("error");
      state.cooldownUntil = Date.now() + 3000;
    }

    if (procAlive && state.current) {
      const elapsed = (Date.now() - state.current.startedAt.getTime()) / 1000;
      const durationEnded = state.current.media.duration > 0 && elapsed >= state.current.media.duration;
      const programChanged = !!program && state.current.program?.id !== program.id;
      if (durationEnded || programChanged) {
        await finishCurrent(state.current.isFallback ? "fallback" : "success");
        killProc(state.proc);
        state.proc = null;
      }
    }

    if (!state.current && !state.starting) {
      const picked = await pickNext(program);
      if (picked) {
        await startItem(picked);
      } else {
        state.lastError = "Nenhum conteúdo disponível";
        state.cooldownUntil = Date.now() + 10000;
      }
    }

    if (state.current) {
      const nextPicked = await pickNext(program);
      state.next = nextPicked
        ? { title: nextPicked.media.title, program: nextPicked.program ? nextPicked.program.name : null }
        : null;
    }
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.error("[playout] tick:", err);
  } finally {
    await publish().catch((e) => console.error("[playout] publish:", e));
  }
}

// ---- controles ----
async function start(): Promise<void> {
  if (state.running) return;
  state.running = true;
  state.since = new Date();
  state.cooldownUntil = 0;
  await tick();
  state.timer = setInterval(() => tick().catch((e) => console.error(e)), config.tickMs);
  console.log("[playout] iniciado");
}

async function stop(): Promise<void> {
  state.running = false;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  await finishCurrent("stopped");
  killProc(state.proc);
  state.proc = null;
  state.next = null;
  await publish().catch(() => {});
  console.log("[playout] parado");
}

/** Reproduz agora uma mídia específica (testes/operação). */
async function playNow(mediaId: string): Promise<void> {
  if (state.starting) return;
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) throw new Error("Mídia não encontrada");
  if (!state.running) await start();
  await finishCurrent("stopped");
  killProc(state.proc);
  state.proc = null;
  state.cooldownUntil = 0;
  const program = await scheduledProgram();
  await startItem({ media, program });
  await publish().catch(() => {});
}

async function setFallback(mediaId: string | null): Promise<void> {
  state.fallbackMediaId = mediaId;
}

// ---- fila projetada ("No Ar") ----
export async function planQueue(count = 5) {
  const n = Math.min(Math.max(Number(count) || 5, 1), 20);
  const program = await scheduledProgram();

  if (program && program.genreId && program.genreStatus !== "pausado") {
    const plan = await composeCycle(
      program.genreId,
      n,
      program.mixOverride,
      state.current ? [state.current.media.id] : []
    );
    return {
      program: program.name,
      approx: program.orderingPadrao === "aleatoria",
      window: program.antiRepeatWindow,
      items: plan.map((it) => ({
        mediaId: it.media.id,
        title: it.media.title,
        source: it.media.source,
        duration: it.media.duration || 0,
        scope: it.scope,
        scopeLabel: it.scopeLabel,
      })),
    };
  }

  // fora da grade: projeção = aleatória com histórico virtual (janela 10)
  const rows = (
    await prisma.playbackHistory.findMany({
      take: 10,
      orderBy: { startedAt: "desc" },
      select: { mediaId: true },
    })
  ).map((r) => r.mediaId);
  const items: { mediaId: string; title: string; source: string; duration: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [m] = await selectAuto({ excludeIds: [...new Set(rows)], limit: 1 });
    if (!m) break;
    items.push({ mediaId: m.id, title: m.title, source: m.source, duration: m.duration || 0 });
    rows.unshift(m.id);
  }
  return { program: null, approx: true, window: 10, items };
}

// ---- publicação de estado ----
function payload(): PlayoutStatePayload {
  return {
    running: state.running,
    channel: config.channel,
    since: state.since ? state.since.toISOString() : null,
    current: state.current
      ? {
          mediaId: state.current.media.id,
          title: state.current.media.title,
          url: state.current.media.url,
          source: state.current.media.source,
          duration: state.current.media.duration,
          programId: state.current.program ? state.current.program.id : null,
          programName: state.current.program ? state.current.program.name : null,
          startedAt: state.current.startedAt.toISOString(),
          pid: state.current.pid,
          isFallback: !!state.current.isFallback,
        }
      : null,
    next: state.next,
    errors: state.errors,
    restarts: state.restarts,
    lastError: state.lastError,
    fallbackMediaId: state.fallbackMediaId,
  };
}

async function publish(): Promise<void> {
  await writeState(payload());
}

function getState() {
  return payload();
}

export const playout = { start, stop, playNow, setFallback, getState, planQueue };
