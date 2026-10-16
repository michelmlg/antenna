/** Biblioteca de mídias + categorias. */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { mediaCreateSchema, mediaUpdateSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";
import { worker } from "../lib/worker";

export const mediaRoutes = Router();
mediaRoutes.use(auth);

// GET /media?q=&category=&status=&take=&skip=
mediaRoutes.get(
  "/",
  wrap(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const take = Math.min(Math.max(Number(req.query.take) || 50, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const where: Record<string, unknown> = {};
    if (q) where.title = { contains: q };
    if (status) where.status = status;
    if (category) where.categories = { some: { name: category } };

    const [items, total] = await Promise.all([
      prisma.media.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: { categories: true },
      }),
      prisma.media.count({ where }),
    ]);
    res.json({ items, total, take, skip });
  })
);

// POST /media — cadastro manual (probe via worker p/ duração/meta)
mediaRoutes.post(
  "/",
  wrap(async (req, res) => {
    const data = mediaCreateSchema.parse(req.body);
    let duration = data.duration ?? 0;
    let source = data.source;
    let resolvedId: string | null = null;
    let uploadDate: Date | null = null;
    let views: number | null = null;

    if (!source) {
      source = /youtu\.be|youtube\.com/i.test(data.url) ? "youtube" : /^https?:\/\//i.test(data.url) ? "http" : "local";
    }
    if (!duration) {
      try {
        const meta = await worker.post<{ duration: number; resolvedId: string | null; uploadDate: string | null; views: number | null }>(
          "/probe",
          { url: data.url },
          60000
        );
        duration = meta.duration;
        resolvedId = meta.resolvedId;
        uploadDate = meta.uploadDate ? new Date(meta.uploadDate) : null;
        views = meta.views;
      } catch {
        /* probe é best effort: cadastra com duração 0 */
      }
    }

    const media = await prisma.media.create({
      data: {
        title: data.title || data.url,
        url: data.url,
        source,
        duration,
        resolvedId,
        uploadDate,
        views,
        status: "ativo",
        categories: data.categories?.length
          ? { connectOrCreate: data.categories.map((name) => ({ where: { name }, create: { name } })) }
          : undefined,
      },
      include: { categories: true },
    });
    res.status(201).json(media);
  })
);

// PATCH /media/:id
mediaRoutes.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = mediaUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.status !== undefined) patch.status = data.status;
    if (data.categories !== undefined) {
      patch.categories = {
        set: [],
        connectOrCreate: data.categories.map((name) => ({ where: { name }, create: { name } })),
      };
    }
    const media = await prisma.media.update({
      where: { id: req.params.id },
      data: patch,
      include: { categories: true },
    });
    res.json(media);
  })
);

// DELETE /media/:id
mediaRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    await prisma.media.delete({ where: { id: req.params.id } });
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
