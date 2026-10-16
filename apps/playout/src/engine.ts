/**
 * Engine de exibição: resolve URLs reais (YouTube via yt-dlp), sonda codecs
 * e sobe o FFmpeg publicando no MediaMTX.
 *   - YouTube: SEMPRE transcodifica (copy do googlevideo tem DTS não-monotônico
 *     e quebra o muxer HLS do MediaMTX — testado no v1: copy morre, x264 sobrevive)
 *   - Local/HTTP: copy se h264; senão transcodifica (ffmpeg não muxa AV1/VP9/HEVC em RTP)
 *   - Áudio sempre -> AAC
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
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
      (err, stdout) => {
        if (err) return reject(new Error("yt-dlp: " + (err.message || "falhou")));
        const lines = String(stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!lines.length) return reject(new Error("yt-dlp: URL de stream não encontrada"));
        resolve(lines.slice(0, 2));
      }
    );
  });
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

export function spawnFFmpeg(inputs: string[], videoCodec: string | null, onErrorLine: (line: string) => void): ChildProcess {
  const target = `${config.mediaMtxUrl}/${config.channel}`;
  const args = ["-hide_banner", "-loglevel", "warning", "-re"];
  for (const u of inputs) args.push("-stream_loop", "-1", "-i", u);
  if (inputs.length > 1) args.push("-map", "0:v:0", "-map", "1:a:0");
  if (videoCodec === "h264") {
    args.push("-c:v", "copy");
  } else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast",
      "-b:v", "5000k", "-maxrate", "5000k", "-bufsize", "10000k",
      "-g", "50", "-pix_fmt", "yuv420p"
    );
  }
  args.push("-c:a", "aac", "-b:a", "128k", "-f", "rtsp", "-rtsp_transport", "tcp", target);
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

export function killProc(proc: ChildProcess | null): void {
  if (!proc) return;
  try {
    proc.kill("SIGKILL");
  } catch {
    /* já morreu */
  }
}
