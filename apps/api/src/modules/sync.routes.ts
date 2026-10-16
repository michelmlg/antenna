/** Histórico de syncs (as execuções em si são operações do worker). */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { auth } from "../lib/auth";
import { wrap } from "../lib/http";

export const syncRoutes = Router();
syncRoutes.use(auth);

syncRoutes.get(
  "/runs",
  wrap(async (req, res) => {
    const take = Math.min(Math.max(Number(req.query.take) || 30, 1), 200);
    const runs = await prisma.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take,
      include: { source: { select: { id: true, type: true, url: true, query: true, genre: { select: { id: true, name: true, color: true, icon: true } } } } },
    });
    res.json(runs);
  })
);
