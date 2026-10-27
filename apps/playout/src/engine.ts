/**
 * Engine de exibição: resolve URLs reais (YouTube via yt-dlp), sonda codecs
 * e sobe o FFmpeg publicando no MediaMTX.
 *   - YouTube: SEMPRE transcodifica (copy do googlevideo tem DTS não-monotônico
 *     e quebra o muxer HLS do MediaMTX — testado no v1: copy morre, x264 sobrevive)
 *   - Local/HTTP: copy se h264; senão transcodifica (ffmpeg não muxa AV1/VP9/HEVC em RTP)
 *   - Áudio sempre -> AAC
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { describeResolveError } from "@antenna/core";
import { config } from "./config";

export function isYoutube(url = "", source = ""): boolean {
  return source === "youtube" || /youtu\.be|youtube\.com/i.test(url);
}

/** Resolve as URLs de reprodução: 1 (arquivo/HTTP) ou 2 (vídeo+áudio YouTube). */
export function resolveInput(media: { url: string; source: string }): Promise<string[]> {
  if (!isYoutube(media.url, media.source)) return Promise.resolve([media.url]);
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        // H264 (avc1) até 1080p: o RTP do ffmpeg 5.1 não muxa AV1/VP9 p/ RTSP
        "-f",
        "bv*[height<=1080][vcodec^=avc1]+ba/b[height<=1080][vcodec^=avc1]/bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
        "-g",
        "--no-playlist",
        "--",
        media.url,
      ],
      { timeout: 45000 },
      (err, stdout, stderr) => {
        if (err) {
          const raw = `${String(stderr).trim().split(/\r?\n/).pop() ?? ""} ${err.message}`;
          console.log("[yt-dlp] falhou:", raw.slice(0, 300)); // linha crua só no log
          return reject(new Error(describeResolveError(raw)));
        }
        const lines = String(stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!lines.length) return reject(new Error(describeResolveError("não encontrada")));
        resolve(lines.slice(0, 2));
      }
    );
  });
}

export type PreflightResult = { ok: true } | { ok: false; status: number };

/**
 * Pré-checagem das URLs resolvidas: GET de 1 byte (Range). 403/401 = URL negada
 * — detecta ANTES de subir o ffmpeg, sem tocar no que está no ar. Erro de rede
 * ou timeout NÃO bloqueia (o ffmpeg decide); só recusa explícita conta.
 */
export async function preflightInputs(urls: string[], timeoutMs = 4000): Promise<PreflightResult> {
  for (const url of urls) {
    if (!/^https?:\/\//i.test(url)) continue; // arquivo local
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-1" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      await res.body?.cancel().catch(() => {});
      if (res.status === 403 || res.status === 401) return { ok: false, status: res.status };
    } catch {
      /* rede/timeout: segue — o ffmpeg tem retry próprio */
    }
  }
  return { ok: true };
}

/** O destino (MediaMTX) aceita conexão TCP? Barato (2s) e evita gastar vídeo à toa. */
export function probeSink(timeoutMs = 2000): Promise<{ ok: boolean; reason?: string }> {
  let host = "localhost";
  let port = 8554;
  try {
    const u = new URL(config.mediaMtxUrl);
    host = u.hostname;
    port = Number(u.port) || 8554;
  } catch {
    /* mantém o padrão */
  }
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok: boolean, reason?: string) => {
      sock.destroy();
      resolve({ ok, reason });
    };
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false, `${host}:${port} não respondeu`));
    sock.once("error", (e: NodeJS.ErrnoException) =>
      done(false, e.code === "ENOTFOUND" || e.code === "EAI_AGAIN" ? `DNS não resolve "${host}"` : `${host}:${port} ${e.code ?? "inacessível"}`)
    );
  });
}

export function sinkHost(): string {
  try {
    return new URL(config.mediaMtxUrl).hostname;
  } catch {
    return "localhost";
  }
}

/** Codec do vídeo (h264 copia; AV1/VP9/HEVC transcodificam). null => transcodifica. */
export function probeVideoCodec(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", url],
      { timeout: 25000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const c = String(stdout)
          .split(/[\r\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        resolve(c || null);
      }
    );
  });
}

/** Logo sobreposto: arquivo local + trecho de -filter_complex (packages/core/branding). */
export interface LogoOverlay {
  path: string;
  /** monta o grafo dado o índice do input do logo */
  filter: (logoInput: number) => string;
}

/** Argumentos do FFmpeg (puro — testável sem subir processo). */
export function buildFfmpegArgs(
  inputs: string[],
  videoCodec: string | null,
  logo?: LogoOverlay | null,
  /** retomar do segundo N (reaplicar personalização sem voltar ao início) */
  seekSec = 0
): string[] {
  const target = `${config.mediaMtxUrl}/${config.channel}`;
  const args = ["-hide_banner", "-loglevel", "warning", "-re"];
  const seek = seekSec > 0 ? ["-ss", String(Math.floor(seekSec))] : [];
  // -ss antes de cada -i: busca no próprio input (vídeo e áudio no mesmo ponto)
  for (const u of inputs) args.push(...seek, "-stream_loop", "-1", "-i", u);
  const audio = inputs.length > 1 ? "1:a:0" : "0:a?";
  if (logo) {
    // imagem parada em loop como input extra; overlay exige transcodificar
    args.push("-loop", "1", "-i", logo.path);
    args.push("-filter_complex", logo.filter(inputs.length), "-map", "[vout]", "-map", audio);
  } else if (inputs.length > 1) {
    args.push("-map", "0:v:0", "-map", "1:a:0");
  }
  if (videoCodec === "h264" && !logo) {
    args.push("-c:v", "copy");
  } else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast",
      "-b:v", "5000k", "-maxrate", "5000k", "-bufsize", "10000k",
      "-g", "50", "-pix_fmt", "yuv420p"
    );
  }
  args.push("-c:a", "aac", "-b:a", "128k", "-f", "rtsp", "-rtsp_transport", "tcp", target);
  return args;
}

export function spawnFFmpeg(
  inputs: string[],
  videoCodec: string | null,
  onErrorLine: (line: string) => void,
  logo?: LogoOverlay | null,
  seekSec = 0
): ChildProcess {
  const args = buildFfmpegArgs(inputs, videoCodec, logo, seekSec);
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

  proc.stderr.on("data", (d) => {
    const line = String(d).trim();
    if (line) onErrorLine(line.slice(0, 400));
  });
  return proc;
}

// stderr do FFmpeg: AVISOS do decodificador (Late SEI etc.) ficam só no log;
// só ERROS reais (falha de rede, 403, conexão recusada) viram lastError do painel.
const FFMPEG_WARNING_RE = /^\[(h264|hevc|av1|vp9|https|tls|tcp|mpegts|aac|flv|mov)\b|^frame= |Last message repeated/i;

export function isFfmpegError(line: string): boolean {
  if (FFMPEG_WARNING_RE.test(line)) return false;
  return /error|failed|refused|forbidden|invalid|could not|no such|unable|timed out|connection lost/i.test(line);
}

/**
 * Morte TERMINAL de input: "Error during demuxing" em qualquer in#N = o demuxer
 * desistiu daquele input. Com -stream_loop o ffmpeg pode reabri-lo do byte 0
 * (áudio salta pro início do vídeo) ou continuar sem ele (vídeo rolando sem
 * áudio) — o par vídeo/áudio fica quebrado NA MESMA publicação. Avisos
 * transitórios (Read error, Stream ends prematurely) NÃO são morte: o retry de
 * Range do http os recupera no mesmo ponto do stream.
 */
export function isInputDeath(line: string): boolean {
  return line.startsWith("[in#") && line.includes("Error during demuxing");
}

export function killProc(proc: ChildProcess | null): void {
  if (!proc) return;
  try {
    proc.kill("SIGKILL");
  } catch {
    /* já morreu */
  }
}
