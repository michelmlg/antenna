// Gêneros: fontes (vídeo/canal/busca), links manuais, mistura, sync e preview.
import { Router } from "express";
import { prisma } from "@antenna/database";
import { composeCycle } from "@antenna/core";
import { mixUpdateSchema, sourceCreateSchema, sourceUpdateSchema } from "@antenna/shared";
import { HttpError, wrap } from "../lib/http";
import { worker } from "../lib/worker";

const sub = Router({ mergeParams: true });

const SCOPES = ["links", "source", "genre", "category"];

const clampInt = (v: unknown, min: number, max: number, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def;
};

// POST /genres/:id/sources — fonte nova (ou link direto, com probe via worker)
sub.post(
  "/sources",
  wrap(async (req, res) => {
    const data = sourceCreateSchema.parse(req.body);
    const genre = await prisma.genre.findUnique({ where: { id: req.params.id } });
    if (!genre) throw new HttpError(404, "gênero não encontrado");

    if (data.type === "video") {
      if (!data.url) throw new HttpError(400, "url obrigatório p/ video");
      const meta = await worker.post<{ source: string; duration: number; resolvedId: string | null; uploadDate: string | null; views: number | null }>(
        "/probe",
        { url: data.url },
        60000
      );
      const media = await prisma.media.create({
        data: {
          title: data.title || data.url,
          url: data.url,
          source: meta.source,
          duration: meta.duration,
          resolvedId: meta.resolvedId,
          uploadDate: meta.uploadDate ? new Date(meta.uploadDate) : null,
          views: meta.views,
          status: "ativo",
        },
      });
      const last = await prisma.genreItem.findFirst({
        where: { genreId: genre.id },
        orderBy: { order: "desc" },
      });
      const item = await prisma.genreItem.create({
        data: { genreId: genre.id, mediaId: media.id, order: last ? last.order + 1 : 1 },
      });
      res.status(201).json({ media, item });
      return;
    }

    if (data.type === "channel" && !data.url) throw new HttpError(400, "url do canal obrigatória");
    if (data.type === "search" && !data.query) throw new HttpError(400, "termo de busca obrigatório");
    if (data.type === "channelSearch" && (!data.url || !data.query))
      throw new HttpError(400, "busca no canal precisa da url do canal E do termo");

    const source = await prisma.source.create({
      data: {
        genreId: genre.id,
        type: data.type,
        url: data.url ?? "",
        query: data.query ?? "",
        limit: data.limit ?? 12,
        sort: data.sort ?? "recent",
      },
    });
    res.status(201).json(source);
  })
);

// PUT /genres/:id/sources/:sid — pausa/ativa, edita ou muda filtros
sub.put(
  "/sources/:sid",
  wrap(async (req, res) => {
    const data = sourceUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    for (const k of ["status", "url", "query", "limit", "sort"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.filters !== undefined) {
      // objeto normalizado -> JSON string no banco (null/{} = limpar)
      patch.filters = data.filters === null || Object.keys(data.filters).length === 0 ? null : JSON.stringify(data.filters);
    }
    const source = await prisma.source.update({
      where: { id: req.params.sid, genreId: req.params.id },
      data: patch,
    });
    res.json(source);
  })
);

// DELETE /genres/:id/sources/:sid — mídias expandidas ficam (originSource fica null)
sub.delete(
  "/sources/:sid",
  wrap(async (req, res) => {
    await prisma.source.delete({ where: { id: req.params.sid, genreId: req.params.id } });
    res.json({ ok: true });
  })
);

// POST /genres/:id/sources/:sid/sync — sincroniza SÓ esta fonte (botão inline)
sub.post(
  "/sources/:sid/sync",
  wrap(async (req, res) => {
    const source = await prisma.source.findUnique({ where: { id: req.params.sid } });
    if (!source || source.genreId !== req.params.id) throw new HttpError(404, "fonte não encontrada");
    res.json(await worker.post(`/sync/source/${source.id}`, {}, 300000));
  })
);

// DELETE /genres/:id/links/:itemId — remove link manual
sub.delete(
  "/links/:itemId",
  wrap(async (req, res) => {
    await prisma.genreItem.delete({ where: { id: req.params.itemId, genreId: req.params.id } });
    res.json({ ok: true });
  })
);

// PUT /genres/:id/links/order — reordena links manuais (ordem "definida")
sub.put(
  "/links/order",
  wrap(async (req, res) => {
    const itemIds: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    if (!itemIds.length) throw new HttpError(400, "itemIds obrigatório");
    const mine = await prisma.genreItem.findMany({ where: { genreId: req.params.id }, select: { id: true } });
    const valid = new Set(mine.map((i) => i.id));
    if (itemIds.some((id) => !valid.has(id)) || itemIds.length !== mine.length) {
      throw new HttpError(400, "itemIds não pertencem ao gênero");
    }
    for (let i = 0; i < itemIds.length; i++) {
      await prisma.genreItem.update({ where: { id: itemIds[i] }, data: { order: i + 1 } });
    }
    res.json({ ok: true, count: itemIds.length });
  })
);

// PUT /genres/:id/mix — substitui a mistura inteira
sub.put(
  "/mix",
  wrap(async (req, res) => {
    const { ingredients } = mixUpdateSchema.parse(req.body);
    const genre = await prisma.genre.findUnique({
      where: { id: req.params.id },
      include: { sources: { select: { id: true } } },
    });
    if (!genre) throw new HttpError(404, "gênero não encontrado");
    const sourceIds = new Set(genre.sources.map((s) => s.id));

    const clean = ingredients.map((it, i) => {
      if (it.scope === "source") {
        if (!it.sourceId || !sourceIds.has(it.sourceId)) {
          throw new HttpError(400, "sourceId não pertence a este gênero");
        }
      }
      if (it.scope === "category" && !(it.categoryName || "").trim()) {
        throw new HttpError(400, "categoryName obrigatório p/ escopo category");
      }
      return {
        scope: it.scope,
        sourceId: it.scope === "source" ? it.sourceId! : null,
        categoryName: it.scope === "category" ? String(it.categoryName).trim() : null,
        count: it.count,
        order: i,
      };
    });

    await prisma.mixIngredient.deleteMany({ where: { genreId: genre.id } });
    await prisma.mixIngredient.createMany({ data: clean.map((c) => ({ ...c, genreId: genre.id })) });
    const out = await prisma.mixIngredient.findMany({ where: { genreId: genre.id }, orderBy: { order: "asc" } });
    res.json({ ingredients: out });
  })
);

// POST /genres/:id/sync — sincroniza todas as fontes do gênero
sub.post(
  "/sync",
  wrap(async (req, res) => {
    const genre = await prisma.genre.findUnique({ where: { id: req.params.id } });
    if (!genre) throw new HttpError(404, "gênero não encontrado");
    res.json(await worker.post(`/sync/genre/${genre.id}`, {}, 600000));
  })
);

// GET /genres/:id/syncs — histórico de sincronizações
sub.get(
  "/syncs",
  wrap(async (req, res) => {
    const runs = await prisma.syncRun.findMany({
      where: { source: { genreId: req.params.id } },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { source: { select: { id: true, type: true, url: true, query: true } } },
    });
    res.json(runs);
  })
);

// GET /genres/:id/preview?count=8&mix=[...] — sequência viva projetada (Simular)
sub.get(
  "/preview",
  wrap(async (req, res) => {
    const genre = await prisma.genre.findUnique({ where: { id: req.params.id } });
    if (!genre) throw new HttpError(404, "gênero não encontrado");
    const count = clampInt(req.query.count, 1, 30, 8);
    const mix = req.query.mix ? String(req.query.mix) : null;
    const plan = await composeCycle(genre.id, count, mix);
    res.json({
      approx: genre.orderingPadrao === "aleatoria",
      window: genre.antiRepeatWindow,
      items: plan.map((it) => ({
        mediaId: it.media.id,
        title: it.media.title,
        source: it.media.source,
        duration: it.media.duration || 0,
        scope: it.scope,
        scopeLabel: it.scopeLabel,
      })),
    });
  })
);

export default sub;
