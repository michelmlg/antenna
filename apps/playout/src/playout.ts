/**
 * Máquina de estados do playout (port do engine.js do v1).
 * Tick a cada 5s: bloco agendado? duração acabou? FFmpeg caiu?
 * Prioridade de escolha: gênero da grade (mistura viva) → seleção automática → fallback.
 */
import { prisma } from "@antenna/database";
import { FAILURE_INFO, type Failure, type FailureKind, type PlayoutStatePayload, type QueueItem } from "@antenna/shared";
import { composeCycle, fallbackMedia, selectAuto } from "@antenna/core";
import { currentBlock } from "@antenna/core";
import {
  backoffMs,
  blamesMedia,
  classifyFfmpegLine,
  clearMediaFailure,
  errorResult,
  isQuarantined,
  pruneQuarantine,
  recordMediaFailure,
  sinkStatus,
  type FailureRecord,
} from "@antenna/core";
import { config } from "./config";
import {
  isFfmpegError,
  isYoutube,
  killProc,
  preflightInputs,
  probeSink,
  probeVideoCodec,
  resolveInput,
  sinkHost,
  spawnFFmpeg,
} from "./engine";
import { writeState } from "./state";
import { loadLogoOverlay } from "./branding";

type Picked = {
  media: { id: string; title: string; url: string; source: string; duration: number };
  program: { id: string; name: string } | null;
  isFallback?: boolean;
};

const QUEUE_BATCH = 10; // itens gerados por vez
const QUEUE_MIN = 2; // repõe o lote quando resta <= MIN
const MAX_ATTEMPTS = 3; // resolve+pré-checagem do MESMO vídeo antes de desistir dele
const STABLE_AFTER_S = 15; // ffmpeg vivo por tanto tempo = publicação estável (zera contadores)

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
  // --- falhas (ver packages/core/failures) ---
  pending: null as Picked | null, // item a repetir: o destino caiu, não é culpa do vídeo
  procFailure: null as FailureKind | null, // 1ª falha classificada do ffmpeg ATUAL
  procStartedAt: 0,
  sinkFailures: 0, // falhas seguidas de publicação (disjuntor do MediaMTX)
  mediaStreak: 0, // vídeos seguidos que falharam (YouTube bloqueando?)
  counts: {} as Record<string, number>,
  lastFailure: null as Failure | null,
  failures: new Map<string, FailureRecord>(),
  failTitles: new Map<string, string>(),
};

/** Registra a falha para o painel: contador, última causa e mensagem legível. */
function noteFailure(kind: FailureKind, detail: string, title: string | null, attempt?: number): void {
  state.counts[kind] = (state.counts[kind] ?? 0) + 1;
  const tries = attempt ? ` (tentativa ${attempt}/${MAX_ATTEMPTS})` : "";
  state.lastFailure = {
    kind,
    message: detail,
    title,
    at: new Date().toISOString(),
    attempt: attempt ?? null,
    maxAttempts: attempt ? MAX_ATTEMPTS : null,
  };
  state.lastError = `${FAILURE_INFO[kind].label}${detail ? ` — ${detail}` : ""}${tries}${title ? ` · ${title}` : ""}`;
  console.log(`[playout] falha ${kind}: ${detail}${tries}${title ? " · " + title : ""}`);
}

/** O vídeo falhou de vez (retries esgotados): conta para a quarentena. */
function registerMediaFailure(media: { id: string; title: string }, kind: FailureKind): void {
  const rec = recordMediaFailure(state.failures, media.id, kind, Date.now());
  state.failTitles.set(media.id, media.title);
  state.mediaStreak += 1;
  if (rec.until) console.log(`[playout] quarentena 24h: ${media.title} (${rec.count} falhas, ${kind})`);
}

/** O destino não aceitou: disjuntor conta e o MESMO item é repetido com backoff. */
function registerSinkFailure(detail: string, title: string | null, retry: Picked | null): void {
  state.sinkFailures += 1;
  noteFailure("sink_unreachable", detail, title);
  if (retry) state.pending = retry;
  state.cooldownUntil = Date.now() + backoffMs(state.sinkFailures);
}

/** Ids fora de rotação por quarentena (elegíveis de novo quando vencem). */
function quarantinedIds(): string[] {
  const now = Date.now();
  pruneQuarantine(state.failures, now);
  return [...state.failures].filter(([, r]) => r.until > now).map(([id]) => id);
}

function onFfmpegLine(line: string): void {
  if (isFfmpegError(line)) {
    // lastError só vira texto legível quando a falha é classificada (feito em
    // tick/registerFailure); a linha crua fica no log
    if (!classifyFfmpegLine(line, { sinkHost: sinkHost() })) state.lastError = line;
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

  const excludeIds = [
    ...new Set([state.current?.media.id, ...state.queue.map((q) => q.mediaId), ...quarantinedIds()].filter(Boolean) as string[]),
  ];
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
  // destino caiu antes: repete o MESMO item (a fila não anda por falha de infra)
  if (state.pending) {
    const p = state.pending;
    state.pending = null;
    if (!isQuarantined(state.failures, p.media.id, Date.now())) return p;
  }

  await ensureQueue(program);

  let head = state.queue.shift();
  // vídeos em quarentena ficam de fora (voltam sozinhos quando vencer)
  while (head && isQuarantined(state.failures, head.mediaId, Date.now())) head = state.queue.shift();
  if (head) {
    return {
      media: { id: head.mediaId, title: head.title, url: head.url, source: head.source, duration: head.duration },
      program: program ? { id: program.id, name: program.name } : null,
    };
  }

  let [auto] = await selectAuto({ recentCount: 10, limit: 1 });
  // (excludeIds substitui o anti-repeat do selectAuto; só entra quando o sorteio caiu em quarentena)
  if (auto && isQuarantined(state.failures, auto.id, Date.now())) {
    [auto] = await selectAuto({ limit: 1, excludeIds: quarantinedIds() });
  }
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

async function startItem(picked: Picked, opts: StartOpts = {}): Promise<boolean> {
  if (state.starting) return false; // serializa: impede dois FFmpeg juntos
  state.starting = true;
  try {
    return await doStartItem(picked, opts);
  } finally {
    state.starting = false;
  }
}

type StartOpts = {
  isFallbackRetry?: boolean;
  /** retomar o item ATUAL do segundo N (troca de logo) — mantém início/histórico */
  resumeAt?: number;
};

/** true = FFmpeg novo no ar. */
async function doStartItem(picked: Picked, opts: StartOpts = {}): Promise<boolean> {
    const resuming = opts.resumeAt != null;
    const old = state.proc; // handover: o novo assume o path ANTES de o velho morrer
    const title = picked.media.title;

    // 1) o destino aceita publicação? Se não, NÃO gasta o vídeo: repete o mesmo item com backoff.
    const sink = await probeSink();
    if (!sink.ok) {
      registerSinkFailure(sink.reason ?? "inacessível", title, resuming ? null : picked);
      return false;
    }

    // 2) resolve + pré-checa as URLs; falha do vídeo é tentada de novo (URL nova a cada vez)
    const maxAttempts = resuming ? 1 : MAX_ATTEMPTS;
    let inputs: string[] | null = null;
    let failKind: FailureKind = "source_unresolvable";
    for (let attempt = 1; attempt <= maxAttempts && !inputs; attempt++) {
      let detail: string;
      try {
        const urls = await resolveInput(picked.media);
        const pf = await preflightInputs(urls);
        if (pf.ok) {
          inputs = urls;
          break;
        }
        failKind = "source_forbidden";
        detail = `HTTP ${pf.status}`;
      } catch (err) {
        failKind = "source_unresolvable";
        detail = err instanceof Error ? err.message : String(err);
      }
      noteFailure(failKind, detail, title, attempt);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, backoffMs(attempt, 2000, 8000)));
    }

    if (!inputs) {
      if (resuming) return false; // retomada falhou: o FFmpeg antigo segue no ar
      // retries esgotados: o vídeo é descartado (e fica registrado no histórico)
      registerMediaFailure(picked.media, failKind);
      state.errors += 1;
      const now = new Date();
      await prisma.playbackHistory
        .create({
          data: {
            mediaId: picked.media.id,
            programId: picked.program ? picked.program.id : null,
            channel: config.channel,
            startedAt: now,
            finishedAt: now,
            duration: 0,
            result: errorResult(failKind),
          },
        })
        .catch((e) => console.error("[playout] history:", e instanceof Error ? e.message : e));
      if (!opts.isFallbackRetry) {
        const fb = await fallbackMedia(state.fallbackMediaId);
        if (fb && fb.id !== picked.media.id) {
          return doStartItem({ media: fb, program: null, isFallback: true }, { isFallbackRetry: true });
        }
      }
      state.cooldownUntil = Date.now() + 2000;
      return false;
    }

    state.inputDead = false; // sinal do proc anterior não contamina o novo
    state.procFailure = null;
    // YouTube: SEMPRE transcodifica; local: copy se h264
    const fromYT = isYoutube(picked.media.url, picked.media.source);
    const logo = await loadLogoOverlay(); // com logo, sempre transcodifica (sem sonda)
    const videoCodec = fromYT || logo ? null : await probeVideoCodec(inputs[0]);
    const proc = spawnFFmpeg(inputs, videoCodec, (line) => {
      onFfmpegLine(line);
      if (state.proc !== proc) return; // linhas de procs antigos caem fora
      const kind = classifyFfmpegLine(line, { sinkHost: sinkHost() });
      if (kind) state.procFailure ??= kind; // a PRIMEIRA falha é a causa; o resto é consequência
      // morte terminal de input no proc ATUAL → o par vídeo/áudio quebrou;
      // o tick corta o item e avança (ver tick).
      if (kind === "input_died") {
        state.inputDead = true;
        console.log("[playout] input morreu — corte no próximo tick");
      }
    }, logo, opts.resumeAt ?? 0);
    state.proc = proc;
    state.procStartedAt = Date.now();
    // MediaMTX troca publicadores no mesmo path de forma atômica (o novo entra,
    // o antigo é chutado) — dá um tempo pro handshake do novo e só então mata
    // o velho: o muxer HLS nunca fica sem publicador (sem vão de 404/EOF).
    await new Promise((r) => setTimeout(r, 1500));
    killProc(old);
    proc.on("exit", (code, signal) => {
      // só o proc ATUAL é falha real de reprodução (o antigo chutado no handover
      // sai com code!=0 por conexão terminada — não conta)
      if (state.proc === proc && state.running && code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
        state.errors += 1;
        state.restarts += 1;
        state.cooldownUntil = Date.now() + 3000;
        console.log(`[playout] ffmpeg encerrou (code=${code}, signal=${signal}) — restart em 3s`);
      }
    });

    if (resuming && state.current) {
      // mesmo item, mesmo relógio: o fim continua calculado pelo startedAt original
      state.current.pid = proc.pid ?? null;
      console.log(`[playout] >>> retomado em ${Math.floor(opts.resumeAt ?? 0)}s (personalização) pid=${proc.pid}`);
      return true;
    }
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
    return true;
}

// ---- tick ----
async function tick(): Promise<void> {
  if (!state.running) return;
  if (state.starting) return;
  if (Date.now() < state.cooldownUntil) {
    // backoff longo (destino fora): segue publicando o estado, senão o painel marca "atrasada"
    await publish().catch((e) => console.error("[playout] publish:", e));
    return;
  }

  try {
    const procAlive = !!(state.proc && state.proc.exitCode === null && !state.proc.killed);
    const program = await scheduledProgram();

    if (!procAlive && state.current) {
      // o ffmpeg morreu: a causa classificada decide quem leva a culpa
      const cur = state.current;
      let kind = state.procFailure ?? "unknown";
      state.procFailure = null;
      // morte sem causa no stderr (ex.: conexão RTSP caiu): se o destino não responde, é ele
      if (kind === "unknown" && !(await probeSink()).ok) kind = "sink_unreachable";
      await finishCurrent(errorResult(kind));
      if (kind === "sink_unreachable") {
        // infra: o vídeo não tem culpa — repete o mesmo item quando o destino voltar
        registerSinkFailure("a publicação no MediaMTX caiu", cur.media.title, {
          media: cur.media,
          program: cur.program,
          isFallback: cur.isFallback,
        });
      } else {
        noteFailure(kind, "o ffmpeg encerrou", cur.media.title);
        if (blamesMedia(kind)) registerMediaFailure(cur.media, kind);
        state.cooldownUntil = Date.now() + 3000;
      }
    }

    if (procAlive && state.current) {
      const alive = (Date.now() - state.procStartedAt) / 1000;
      if (alive >= STABLE_AFTER_S && (state.sinkFailures || state.mediaStreak || state.lastError)) {
        // publicação estável: zera disjuntor/contadores e limpa o erro do painel
        state.sinkFailures = 0;
        state.mediaStreak = 0;
        state.lastError = null;
        state.lastFailure = null;
        clearMediaFailure(state.failures, state.current.media.id);
      }
      const elapsed = (Date.now() - state.current.startedAt.getTime()) / 1000;
      const durationEnded = state.current.media.duration > 0 && elapsed >= state.current.media.duration;
      const programChanged = !!program && state.current.program?.id !== program.id;
      if (durationEnded || programChanged || state.inputDead) {
        // input morto (sem fim natural) → "error": o par vídeo/áudio quebrou no ar
        // (sem killProc aqui: o handover do startItem troca publicadores sem vão)
        const cut = !durationEnded && state.inputDead;
        const cur = state.current;
        await finishCurrent(cut ? errorResult("input_died") : cur.isFallback ? "fallback" : "success");
        if (cut) {
          noteFailure("input_died", "vídeo ou áudio parou no ar", cur.media.title);
          registerMediaFailure(cur.media, "input_died");
        }
      }
    }

    if (!state.current && !state.starting && Date.now() >= state.cooldownUntil) {
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
  // nada está no ar ainda: "playing" que sobrou é de um worker que reiniciou no meio
  await prisma.playbackHistory
    .updateMany({
      where: { channel: config.channel, result: "playing" },
      data: { result: "stopped", finishedAt: new Date() },
    })
    .catch((e) => console.error("[playout] history:", e instanceof Error ? e.message : e));
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
  state.pending = null;
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
  state.cooldownUntil = 0;
  state.pending = null;
  clearMediaFailure(state.failures, media.id); // escolha manual vence a quarentena
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

/** Tira um vídeo (ou todos) da quarentena. */
function releaseQuarantine(mediaId?: string): number {
  if (mediaId) return clearMediaFailure(state.failures, mediaId) ? 1 : 0;
  const n = state.failures.size;
  state.failures.clear();
  return n;
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
    health: healthPayload(),
    quarantine: quarantinePayload(),
  };
}

function healthPayload(): NonNullable<PlayoutStatePayload["health"]> {
  const sink = sinkStatus(state.sinkFailures);
  const now = Date.now();
  return {
    // vários vídeos seguidos falhando (YouTube bloqueando?) também é degradação
    status: sink === "ok" && state.mediaStreak >= 5 ? "degraded" : sink,
    sink: state.sinkFailures > 0 ? "down" : "ok",
    sinkFailures: state.sinkFailures,
    nextRetryAt: state.sinkFailures > 0 && state.cooldownUntil > now ? new Date(state.cooldownUntil).toISOString() : null,
    counts: state.counts,
    lastFailure: state.lastFailure,
  };
}

function quarantinePayload(): NonNullable<PlayoutStatePayload["quarantine"]> {
  const now = Date.now();
  pruneQuarantine(state.failures, now);
  return [...state.failures]
    .map(([id, r]) => ({
      mediaId: id,
      title: state.failTitles.get(id) ?? id,
      kind: r.kind,
      failures: r.count,
      until: r.until > now ? new Date(r.until).toISOString() : null,
    }))
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 30);
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

/**
 * Reaplica a personalização (logo) no item que está no ar: sobe um FFmpeg novo
 * do MESMO vídeo no ponto atual e faz o handover sem vão. Perto do fim, deixa
 * para o próximo item.
 */
async function refreshCurrent(): Promise<{ refreshed: boolean; at?: number }> {
  const cur = state.current;
  if (!state.running || !cur || state.starting) return { refreshed: false };
  const at = (Date.now() - cur.startedAt.getTime()) / 1000;
  if (cur.media.duration > 0 && at > cur.media.duration - 10) return { refreshed: false };
  // YouTube às vezes recusa uma URL nova (bot-check transitório): 2ª tentativa
  for (let attempt = 0; attempt < 2; attempt++) {
    if (state.current !== cur) return { refreshed: false }; // item mudou no meio
    const now = (Date.now() - cur.startedAt.getTime()) / 1000;
    if (await startItem(cur, { resumeAt: now })) return { refreshed: true, at: Math.floor(now) };
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { refreshed: false };
}

export const playout = { releaseQuarantine, refreshCurrent, start, stop, playNow, skipNext, setFallback, getState, planQueue, restoreQueue };
