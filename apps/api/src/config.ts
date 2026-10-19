import path from "node:path";
import dotenv from "dotenv";

// .env da raiz do monorepo (apps/api/src -> root = 3 níveis)
dotenv.config({ path: path.resolve(__dirname, "../../..", ".env") });

function num(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  apiPort: num("API_PORT", 3001),
  channel: process.env.CHANNEL || "antenna",
  rtspPort: num("RTSP_PORT", 8554),
  playoutUrl: (process.env.PLAYOUT_URL || "http://localhost:3100").replace(/\/+$/, ""),
  mtxApiUrl: (process.env.MTX_API_URL || "http://localhost:9997").replace(/\/+$/, ""),
  adminToken: process.env.ADMIN_TOKEN || "",
  logLevel: process.env.LOG_LEVEL || "info",
};
