/** Ações de mídia que sobrevivem ao corte da tela Mídias: apagar de vez + colocar no ar. */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@antenna/database";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";
import { worker } from "../lib/worker";

export const mediaRoutes = Router();
mediaRoutes.use(auth);

// DELETE /media/:id — apagar de vez ( usado pelo 🗑 do grid do gênero )
mediaRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    try {
      await prisma.media.delete({ where: { id: req.params.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new HttpError(404, "mídia não encontrada");
      throw e;
    }
    res.json({ ok: true });
  })
);

// POST /media/:id/play — manda pro ar agora
mediaRoutes.post(
  "/:id/play",
  wrap(async (req, res) => {
    const media = await prisma.media.findUnique({ where: { id: req.params.id } });
    if (!media) throw new HttpError(404, "mídia não encontrada");
    res.json(await worker.post("/cmd/play-now", { mediaId: media.id }, 60000));
  })
);

// GET /categories
mediaRoutes.get(
  "/categories/all",
  wrap(async (_req, res) => {
    const cats = await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { medias: true } } } });
    res.json(cats);
  })
);
