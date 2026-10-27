import path from "node:path";
import { dataDir } from "@antenna/database";
import dotenv from "dotenv";

// .env da raiz do monorepo (apps/playout/src -> root = 3 níveis)
dotenv.config({ path: path.resolve(__dirname, "../../..", ".env") });

function num(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  channel: process.env.CHANNEL || "antenna",
  mediaMtxUrl: (process.env.MEDIA_MTX_URL || "rtsp://localhost:8554").replace(/\/+$/, ""),
  playoutPort: num("PLAYOUT_PORT", 3100),
  tickMs: num("TICK_MS", 5000),
  autoplay: process.env.AUTOPLAY !== "false",
  fallbackMediaId: process.env.FALLBACK_MEDIA_ID || null,
  syncHours: num("CONTENT_SYNC_HOURS", 6),
  prewarmMin: num("CONTENT_SYNC_PREWARM_MIN", 15),
  adminToken: process.env.ADMIN_TOKEN || "",
  // logo da personalização (data/ é montado igual no api e no playout)
  brandingDir: process.env.BRANDING_DIR || path.join(dataDir(), "branding"),
};
