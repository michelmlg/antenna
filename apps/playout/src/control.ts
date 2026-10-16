/**
 * Servidor de controle interno do worker (NÃO publicado no host).
 * A API comanda (start/stop/play-now/fallback/queue) e repassa operações
 * que precisam dos binários (yt-dlp/ffprobe): probe e sync.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "@antenna/database";
import { config } from "./config";
import { playout } from "./playout";
import { probeUrl } from "./probe";
import { syncGenre, syncSource } from "./sync";
import { writeFallback } from "./state";

const app = express();
app.use(express.json());

function auth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) return next();
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${config.adminToken}`) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }
  next();
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

app.get("/health", (_req, res) => {
  res.json({ ok: true, running: playout.getState().running });
});

app.get("/state", (_req, res) => res.json(playout.getState()));

app.post("/cmd/start", auth, wrap(async (_req, res) => {
  await playout.start();
  res.json(playout.getState());
}));

app.post("/cmd/stop", auth, wrap(async (_req, res) => {
  await playout.stop();
  res.json(playout.getState());
}));

app.post("/cmd/play-now", auth, wrap(async (req, res) => {
  const mediaId = String(req.body?.mediaId || "");
  if (!mediaId) return res.status(400).json({ error: "mediaId obrigatório" });
  await playout.playNow(mediaId);
  res.json(playout.getState());
}));

app.post("/cmd/next", auth, wrap(async (_req, res) => {
  await playout.skipNext();
  res.json(playout.getState());
}));

app.post("/cmd/fallback", auth, wrap(async (req, res) => {
  const mediaId = req.body?.mediaId == null ? null : String(req.body.mediaId);
  await playout.setFallback(mediaId);
  await writeFallback(mediaId);
  res.json({ ok: true, fallbackMediaId: mediaId });
}));

app.get("/queue", wrap(async (_req, res) => {
  res.json(await playout.planQueue());
}));

// --- operações que precisam de yt-dlp/ffprobe (mora só aqui) ---

app.post("/probe", auth, wrap(async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!url) return res.status(400).json({ error: "url obrigatória" });
  res.json(await probeUrl(url));
}));

app.post("/sync/genre/:genreId", auth, wrap(async (req, res) => {
  res.json(await syncGenre(req.params.genreId));
}));

app.post("/sync/source/:sourceId", auth, wrap(async (req, res) => {
  const source = await prisma.source.findUnique({ where: { id: req.params.sourceId } });
  if (!source) return res.status(404).json({ error: "fonte não encontrada" });
  res.json(await syncSource(source));
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[control]", err);
  res.status(500).json({ error: err instanceof Error ? err.message : "erro interno" });
});

export function startControl(port: number): void {
  app.listen(port, () => console.log(`[control] ouvindo em :${port} (interno)`));
}
