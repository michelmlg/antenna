/**
 * Playout: estado (lido da tabela publicada pelo worker), comandos via proxy
 * e histórico de exibição.
 */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { fallbackSchema, playNowSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { wrap } from "../lib/http";
import { worker } from "../lib/worker";
import { readState } from "./playout.state";

export const playoutRoutes = Router();
playoutRoutes.use(auth);

const STALE_MS = 15000; // worker publica a cada 5s

// GET /playout/state — última publicação do worker (+ flags stale/workerOnline)
playoutRoutes.get(
  "/state",
  wrap(async (_req, res) => {
    const payload = await readState();
    if (!payload) {
      res.json({ running: false, channel: "", current: null, next: null, stale: true, workerOnline: false });
      return;
    }
    const row = await prisma.playoutState.findUnique({ where: { id: 1 }, select: { updatedAt: true } });
    const age = row ? Date.now() - row.updatedAt.getTime() : Infinity;
    const online = await worker.get("/health").then(() => true).catch(() => false);
    res.json({ ...payload, stale: age > STALE_MS, workerOnline: online });
  })
);

playoutRoutes.post(
  "/start",
  wrap(async (_req, res) => {
    res.json(await worker.post("/cmd/start"));
  })
);

playoutRoutes.post(
  "/stop",
  wrap(async (_req, res) => {
    res.json(await worker.post("/cmd/stop"));
  })
);

playoutRoutes.post(
  "/play-now",
  wrap(async (req, res) => {
    const { mediaId } = playNowSchema.parse(req.body);
    res.json(await worker.post("/cmd/play-now", { mediaId }, 60000));
  })
);

playoutRoutes.get(
  "/queue",
  wrap(async (req, res) => {
    const count = Math.min(Math.max(Number(req.query.count) || 5, 1), 20);
    res.json(await worker.get(`/queue?count=${count}`));
  })
);

playoutRoutes.put(
  "/fallback",
  wrap(async (req, res) => {
    const { mediaId } = fallbackSchema.parse(req.body);
    res.json(await worker.post("/cmd/fallback", { mediaId }));
  })
);

// GET /playout/history?take=100 — histórico de exibição
playoutRoutes.get(
  "/history",
  wrap(async (req, res) => {
    const take = Math.min(Math.max(Number(req.query.take) || 100, 1), 500);
    const rows = await prisma.playbackHistory.findMany({
      orderBy: { startedAt: "desc" },
      take,
      include: { media: { select: { id: true, title: true, source: true, thumbnailUrl: true } } },
    });
    res.json(rows);
  })
);
