/**
 * Falhas de reprodução: classificação da causa, backoff e quarentena.
 * Puro (sem I/O) — o playout só orquestra. A regra de ouro: falha de
 * INFRAESTRUTURA (mediamtx) nunca é culpa do vídeo, então não queima fila
 * nem entra em quarentena; falha do VÍDEO é tentada de novo e, se persistir,
 * o vídeo sai de cena por um tempo (nunca é apagado).
 */
import { FAILURE_INFO, type FailureKind } from "@antenna/shared";

export interface ClassifyOpts {
  /** host do MediaMTX (ex.: "mediamtx") — distingue DNS do destino de DNS de input */
  sinkHost?: string;
}

/** Classifica UMA linha de stderr do ffmpeg. null = não é falha terminal conhecida. */
export function classifyFfmpegLine(line: string, opts: ClassifyOpts = {}): FailureKind | null {
  if (line.startsWith("[in#") && line.includes("Error during demuxing")) return "input_died";
  if (/\b(403 Forbidden|Server returned 403|HTTP error 403)\b/i.test(line)) return "source_forbidden";

  const resolve = /Failed to resolve hostname (\S+?):/i.exec(line);
  if (resolve) {
    // DNS do destino = infra; DNS de um googlevideo = problema do input
    const host = resolve[1];
    return !opts.sinkHost || host === opts.sinkHost ? "sink_unreachable" : "source_unresolvable";
  }
  if (/\[out#\d+\/rtsp[^\]]*\].*(Could not write header|Error opening output)/i.test(line)) return "sink_unreachable";
  // consequência da falha de saída (o muxer não aceitou os frames)
  if (/Error sending frames to consumers/i.test(line)) return "sink_unreachable";
  if (/Connection refused/i.test(line) && /rtsp|out#/i.test(line)) return "sink_unreachable";
  return null;
}

/** Mensagem curta e legível para erros do yt-dlp (a crua vai pro log). */
export function describeResolveError(raw: string): string {
  const m = raw.toLowerCase();
  if (/sign in to confirm|not a bot|bot/.test(m)) return "YouTube pediu verificação anti-bot";
  if (/private video/.test(m)) return "vídeo privado";
  if (/video unavailable|unavailable|removed|terminated|deleted/.test(m)) return "vídeo indisponível";
  if (/age|confirm your age/.test(m)) return "vídeo com restrição de idade";
  if (/country|geo|region/.test(m)) return "bloqueado na região";
  if (/etimedout|timed out|killed|sigterm/.test(m)) return "yt-dlp demorou demais";
  if (/não encontrada/.test(m)) return "stream não encontrado";
  return "yt-dlp falhou";
}

/** Espera antes da tentativa N (1-based): base, 2x, 4x... até o teto. */
export function backoffMs(attempt: number, baseMs = 3000, maxMs = 30000): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(maxMs, baseMs * 2 ** (n - 1));
}

/** Resultado gravado no histórico: "error:<kind>". */
export function errorResult(kind: FailureKind): string {
  return `error:${kind}`;
}

/** Só falha que aponta para o vídeo conta para retry/quarentena. */
export function blamesMedia(kind: FailureKind): boolean {
  return FAILURE_INFO[kind].blame === "media";
}

// ---------- quarentena ----------
export interface FailureRecord {
  count: number;
  kind: FailureKind;
  lastAt: number;
  /** 0 = ainda contando; > now = em quarentena */
  until: number;
}

export interface QuarantineOpts {
  /** falhas (já com retries esgotados) até entrar em quarentena */
  threshold?: number;
  ttlMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Registra uma falha do vídeo; devolve o registro (until > now => entrou em quarentena). */
export function recordMediaFailure(
  map: Map<string, FailureRecord>,
  mediaId: string,
  kind: FailureKind,
  now: number,
  opts: QuarantineOpts = {}
): FailureRecord {
  const { threshold = 3, ttlMs = DAY } = opts;
  const prev = map.get(mediaId);
  // contagem velha (passou o TTL sem novas falhas) recomeça do zero
  const fresh = prev && now - prev.lastAt < ttlMs ? prev : null;
  const count = (fresh?.count ?? 0) + 1;
  const rec: FailureRecord = { count, kind, lastAt: now, until: count >= threshold ? now + ttlMs : 0 };
  map.set(mediaId, rec);
  return rec;
}

/** Vídeo tocou bem (ou foi forçado manualmente): zera a contagem. */
export function clearMediaFailure(map: Map<string, FailureRecord>, mediaId: string): boolean {
  return map.delete(mediaId);
}

export function isQuarantined(map: Map<string, FailureRecord>, mediaId: string, now: number): boolean {
  const r = map.get(mediaId);
  return !!r && r.until > now;
}

/** Remove quarentenas vencidas (o vídeo volta a ser elegível). */
export function pruneQuarantine(map: Map<string, FailureRecord>, now: number): void {
  for (const [id, r] of map) if (r.until && r.until <= now) map.delete(id);
}

// ---------- disjuntor do destino (MediaMTX) ----------
export const SINK_BREAKER_THRESHOLD = 3;

/** 1-2 falhas seguidas = degraded; >= limiar = blocked (não gasta mais vídeos). */
export function sinkStatus(consecutiveFailures: number): "ok" | "degraded" | "blocked" {
  if (consecutiveFailures <= 0) return "ok";
  return consecutiveFailures >= SINK_BREAKER_THRESHOLD ? "blocked" : "degraded";
}
