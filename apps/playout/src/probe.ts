/**
 * Sondas de mídia (port do probe.js do v1): duração via ffprobe (local),
 * duração/data/views do YouTube via yt-dlp --simulate (uma chamada única).
 */
import { execFile } from "node:child_process";

const YT_ID_RE = /(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/;

export function extractYtId(url: string): string | null {
  const m = String(url || "").match(YT_ID_RE);
  return m ? m[1] : null;
}

export function ytUrl(id: string): string {
  return "https://www.youtube.com/watch?v=" + id;
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { timeout: 15000 },
      (err, stdout) => {
        const d = parseFloat(String(stdout));
        resolve(Number.isFinite(d) ? Math.round(d) : 0);
      }
    );
  });
}

/**
 * Duração + data de upload + views numa ÚNICA chamada
 * ("485|20251207|12345"; desconhecidos vêm "NA").
 */
export function probeYouTubeMeta(url: string): Promise<{ duration: number; uploadDate: Date | null; views: number | null }> {
  return new Promise((resolve) => {
    execFile(
      "yt-dlp",
      ["--simulate", "--print", "%(duration)s|%(upload_date)s|%(view_count)s", "--no-playlist", "--", url],
      { timeout: 45000 },
      (err, stdout) => {
        if (err) return resolve({ duration: 0, uploadDate: null, views: null });
        const [dRaw = "", dateRaw = "", viewsRaw = ""] = String(stdout).trim().split("|");
        const d = parseFloat(dRaw);
        let uploadDate: Date | null = null;
        const s = dateRaw.trim();
        if (/^\d{8}$/.test(s)) {
          uploadDate = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
        }
        const v = parseInt(viewsRaw, 10);
        resolve({
          duration: Number.isFinite(d) ? Math.round(d) : 0,
          uploadDate,
          views: Number.isFinite(v) ? v : null,
        });
      }
    );
  });
}

export interface ProbedUrl {
  source: string;
  duration: number;
  resolvedId: string | null;
  uploadDate: Date | null;
  views: number | null;
}

/** Detecta origem, duração, data, views e id do provedor de uma URL qualquer. */
export async function probeUrl(url: string, source?: string): Promise<ProbedUrl> {
  const src = source || (/youtu\.be|youtube\.com/i.test(url) ? "youtube" : "local");
  let duration = 0;
  let resolvedId: string | null = null;
  let uploadDate: Date | null = null;
  let views: number | null = null;
  if (src === "youtube") {
    resolvedId = extractYtId(url);
    const meta = await probeYouTubeMeta(url);
    duration = meta.duration;
    uploadDate = meta.uploadDate;
    views = meta.views;
  } else if (!/^https?:\/\//i.test(url)) {
    duration = await probeDuration(url);
  }
  return { source: src, duration, resolvedId, uploadDate, views };
}
