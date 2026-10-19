/**
 * Máquina de estados do playout (port do engine.js do v1).
 * Tick a cada 5s: bloco agendado? duração acabou? FFmpeg caiu?
 * Prioridade de escolha: gênero da grade (mistura viva) → seleção automática → fallback.
 */
import { prisma } from "@antenna/database";
import type { PlayoutStatePayload, QueueItem } from "@antenna/shared";
import { composeCycle, fallbackMedia, selectAuto } from "@antenna/core";
import { currentBlock } from "@antenna/core";
import { config } from "./config";
import { isFfmpegError, isYoutube, isInputDeath, killProc, probeVideoCodec, resolveInput, spawnFFmpeg } from "./engine";
import { writeState } from "./state";

type Picked = {
  media: { id: string; title: string; url: string; source: string; duration: number };
  program: { id: string; name: string } | null;
  isFallback?: boolean;
};

const QUEUE_BATCH = 10; // itens gerados por vez
const QUEUE_MIN = 2; // repõe o lote quando resta <= MIN

const state = {
  running: false,
  timer: null as ReturnType<typeof setInterval> | null,
  proc: null as ReturnType<typeof spawnFFmpeg> | null,
  current: null as (Picked & { startedAt: Date; historyId: string; pid: number | null }) | null,
  next: null as { title: string; program: string | null } | null,
  queue: [] as QueueItem[],
  queuedProgram: null as { id: string; name: string } | null, // a fila pertence a este programa
  since: null as Date | null,
  cooldownUntil: 0,
  starting: false, // um startItem em andamento (evita dois FFmpeg juntos)
  inputDead: false, // ffmpeg do proc ATUAL perdeu um input de forma terminal (corta no tick)
  errors: 0,
  restarts: 0,
  lastError: null as string | null,
  fallbackMediaId: config.fallbackMediaId,
};

function onFfmpegLine(line: string): void {
  if (isFfmpegError(line)) {
    state.lastError = line;
    console.log("[ffmpeg] ERRO:", line);
  } else {
    console.log("[ffmpeg]", line); // avisos ficam só no log do worker
  }
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

// ---- fila estável: gerada UMA VEZ, consumida em ordem ----
type MediaLike = { id: string; title: string; url: string; source: string; duration: number; resolvedId: string | null; channelTitle: string | null; thumbnailUrl: string | null; originSourceId: string | null };

function toQueueItem(m: MediaLike, genre: QueueItem["genre"]): QueueItem {
  return {
    mediaId: m.id, title: m.title, url: m.url, source: m.source, duration: m.duration || 0,
    resolvedId: m.resolvedId, channelTitle: m.channelTitle, thumbnailUrl: m.thumbnailUrl, genre,
  };
}

/** Gênero de cada mídia gerada (via fonte de origem; links manuais herdam o gênero do bloco). */
async function genreFor(medias: MediaLike[], blockGenre: QueueItem["genre"]): Promise<Map<string, QueueItem["genre"]>> {
  const originIds = [...new Set(medias.map((m) => m.originSourceId).filter(Boolean))] as string[];
  const map = new Map<string, QueueItem["genre"]>();
  if (originIds.length) {
    const sources = await prisma.source.findMany({
      where: { id: { in: originIds } },
      select: { id: true, genre: { select: { name: true, color: true, icon: true } } },
    });
    for (const s of sources) map.set(s.id, s.genre);
  }
  const out = new Map<string, QueueItem["genre"]>();
  for (const m of medias) out.set(m.id, m.originSourceId ? (map.get(m.originSourceId) ?? null) : blockGenre);
  return out;
}

/** Repõe a fila quando ela esvazia (ou pertence a outro programa). */
async function ensureQueue(program: Awaited<ReturnType<typeof scheduledProgram>>): Promise<void> {
  const progRef = program ? { id: program.id, name: program.name } : null;

  // bloco da grade mudou → a fila antiga não serve mais
  // (?? null em AMBOS os lados: undefined !== null sempre seria true)
  if ((state.queuedProgram?.id ?? null) !== (progRef?.id ?? null)) {
    state.queue = [];
    state.queuedProgram = progRef;
  }
  if (state.queue.length > QUEUE_MIN) return;

  const excludeIds = [...new Set([state.current?.media.id, ...state.queue.map((q) => q.mediaId)].filter(Boolean) as string[])];
  let fresh: QueueItem[] = [];

  if (program && program.genreId && program.genreStatus !== "pausado") {
    const blockGenre = await prisma.genre.findUnique({
      where: { id: program.genreId },
      select: { name: true, color: true, icon: true },
    });
    const plan = await composeCycle(program.genreId, QUEUE_BATCH, program.mixOverride, excludeIds);
    const genres = await genreFor(plan.map((p) => p.media), blockGenre);
    fresh = plan.map((p) => toQueueItem(p.media, genres.get(p.media.id) ?? null));
  } else {
    const autos = await selectAuto({ recentCount: 20, limit: QUEUE_BATCH, excludeIds });
    const genres = await genreFor(autos, null);
    fresh = autos.map((m) => toQueueItem(m, genres.get(m.id) ?? null));
  }

  const have = new Set(state.queue.map((q) => q.mediaId));
  for (const item of fresh) {
    if (state.queue.length >= QUEUE_BATCH) break;
    if (!have.has(item.mediaId)) {
      state.queue.push(item);
      have.add(item.mediaId);
    }
  }
}

// ---- próxima mídia: consome a fila → automática única → fallback ----
async function pickNext(program: Awaited<ReturnType<typeof scheduledProgram>>): Promise<Picked | null> {
  await ensureQueue(program);

  const head = state.queue.shift();
  if (head) {
    return {
      media: { id: head.mediaId, title: head.title, url: head.url, source: head.source, duration: head.duration },
      program: program ? { id: program.id, name: program.name } : null,
    };
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
    state.inputDead = false; // sinal do proc anterior não contamina o novo
    // YouTube: SEMPRE transcodifica; local: copy se h264
    const fromYT = isYoutube(picked.media.url, picked.media.source);
    const videoCodec = fromYT ? null : await probeVideoCodec(inputs[0]);
    const proc = spawnFFmpeg(inputs, videoCodec, (line) => {
      onFfmpegLine(line);
      // morte terminal de input no proc ATUAL → o par vídeo/áudio quebrou;
      // o tick corta o item e avança (ver tick). Linhas de procs antigos caem fora.
      if (state.proc === proc && isInputDeath(line)) {
        state.inputDead = true;
        console.log("[playout] input morreu — corte no próximo tick");
      }
    });
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
      if (durationEnded || programChanged || state.inputDead) {
        // input morto (sem fim natural) → "error": o par vídeo/áudio quebrou no ar
        await finishCurrent(!durationEnded && state.inputDead ? "error" : state.current.isFallback ? "fallback" : "success");
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

    // "next" vem da fila persistida — NUNCA consome (pickNext shift de verdade)
    state.next = state.queue[0]
      ? { title: state.queue[0].title, program: state.queuedProgram?.name ?? null }
      : null;
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
  // se a mídia estava na fila, sai dela (senão o shift() a tocaria de novo em seguida)
  state.queue = state.queue.filter((q) => q.mediaId !== media.id);
  const program = await scheduledProgram();
  await startItem({ media, program });
  await publish().catch(() => {});
}

async function setFallback(mediaId: string | null): Promise<void> {
  state.fallbackMediaId = mediaId;
}

/** Pula a mídia atual e avança imediatamente para o próximo da fila. */
async function skipNext(): Promise<void> {
  if (state.starting) return;
  if (!state.running) {
    await start();
    return;
  }
  await finishCurrent("skipped");
  killProc(state.proc);
  state.proc = null;
  state.cooldownUntil = 0;
  const program = await scheduledProgram();
  const picked = await pickNext(program);
  if (picked) {
    await startItem(picked);
  } else {
    state.lastError = "Nenhum conteúdo disponível";
    state.cooldownUntil = Date.now() + 5000;
  }
  await publish().catch(() => {});
}

// ---- fila projetada: lê a fila PERSISTIDA (não recalcula nada) ----
export async function planQueue() {
  return {
    program: state.current?.program?.name ?? state.queuedProgram?.name ?? null,
    approx: false, // a fila é a sequência real; só muda com Pular ou troca de bloco
    window: null,
    items: state.queue,
  };
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
    queue: state.queue,
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

/** Restaura a fila persistida (worker reiniciou sem trocar de bloco). */
function restoreQueue(items: QueueItem[], program: { id: string; name: string } | null): void {
  if (items.length) {
    state.queue = items;
    state.queuedProgram = program;
    console.log(`[playout] fila restaurada: ${items.length} item(ns)`);
  }
}

export const playout = { start, stop, playNow, skipNext, setFallback, getState, planQueue, restoreQueue };
