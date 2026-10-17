/**
 * Gêneros — port do genre.routes.js do v1 com validação Zod.
 * Um gênero tem fontes (links/canais/buscas), uma mistura viva e preview.
 * Operações com yt-dlp (probe/sync) são repassadas ao worker.
 */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { buildPools, parseFilters, summary } from "@antenna/core";
import { genreCreateSchema, genreUpdateSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";
import { worker } from "../lib/worker";

import genresSub from "./genres.sub.routes";

const router = Router();
router.use(auth);

// Rotas aninhadas sob /:id (fontes, links, mistura, sync, preview)
router.use("/:id", genresSub);

const sourceView = (s: {
  filters: string | null;
  [k: string]: unknown;
}) => {
  const f = parseFilters(s.filters);
  return { ...s, filters: f, filterChips: summary(f) };
};

// GET /genres — lista com estatísticas (cards)
router.get(
  "/",
  wrap(async (_req, res) => {
    const genres = await prisma.genre.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sources: { orderBy: { createdAt: "asc" } },
        ingredients: { orderBy: { order: "asc" } },
        items: { include: { media: { select: { id: true, status: true } } } },
        program: { select: { id: true, name: true, _count: { select: { schedule: true } } } },
      },
    });
    const out = [];
    for (const g of genres) {
      const expanded = g.sources.length
        ? await prisma.media.count({
            where: { originSourceId: { in: g.sources.map((s) => s.id) }, status: "ativo" },
          })
        : 0;
      out.push({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        icon: g.icon,
        status: g.status,
        antiRepeatWindow: g.antiRepeatWindow,
        orderingPadrao: g.orderingPadrao,
        linkCount: g.items.filter((i) => i.media && i.media.status === "ativo").length,
        expandedCount: expanded,
        sources: g.sources.map(sourceView),
        ingredients: g.ingredients,
        program: g.program,
        createdAt: g.createdAt,
      });
    }
    res.json(out);
  })
);

// POST /genres — cria gênero (com mistura padrão mínima)
router.post(
  "/",
  wrap(async (req, res) => {
    const data = genreCreateSchema.parse(req.body);
    const genre = await prisma.genre.create({
      data: {
        name: data.name,
        description: data.description ?? "",
        color: data.color ?? "#38bdf8",
        icon: data.icon ?? "🎭",
        ingredients: { create: { scope: "genre", count: 1, order: 0 } },
      },
      include: { ingredients: true, sources: true },
    });
    res.status(201).json(genre);
  })
);

// GET /genres/probe?url= — EXPLICA o link (preview no form, sem criar nada).
// Título/thumb via oEmbed do YouTube (sem chave); metadados via worker (yt-dlp).
router.get(
  "/probe",
  wrap(async (req, res) => {
    const url = String(req.query.url || "").trim();
    if (!url) throw new HttpError(400, "url obrigatória");
    const resolvedId = /(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/.exec(url)?.[1] ?? null;

    let title = "";
    let channelTitle = "";
    let thumb: string | null = null;
    if (resolvedId) {
      try {
        const oembed =
          "https://www.youtube.com/oembed?format=json&url=" +
          encodeURIComponent("https://www.youtube.com/watch?v=" + resolvedId);
        const r = await fetch(oembed, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
          title = String(j.title || "").slice(0, 200);
          channelTitle = String(j.author_name || "").slice(0, 120);
          thumb = j.thumbnail_url || null;
        }
      } catch {
        /* offline/vídeo privado: segue só com os metadados do probe */
      }
    }

    const meta = await worker.post<{ source: string; duration: number; uploadDate: string | null; views: number | null }>(
      "/probe",
      { url },
      60000
    );
    res.json({ url, ...meta, resolvedId, title, channelTitle, thumb });
  })
);

// GET /genres/:id — detalhe p/ o editor (fontes + runs + mistura + pools)
router.get(
  "/:id",
  wrap(async (req, res) => {
    const genre = await prisma.genre.findUnique({
      where: { id: req.params.id },
      include: {
        sources: {
          include: { runs: { orderBy: { startedAt: "desc" }, take: 3 } },
          orderBy: { createdAt: "asc" },
        },
        ingredients: { orderBy: { order: "asc" } },
        items: { orderBy: { order: "asc" }, include: { media: true } },
        program: { select: { id: true, name: true, mixOverride: true } },
      },
    });
    if (!genre) throw new HttpError(404, "gênero não encontrado");

    const pools = await buildPools(genre);
    res.json({
      ...genre,
      sources: genre.sources.map(sourceView),
      pool: {
        links: pools.manual,
        expanded: pools.genrePool.filter((m) => m.originSourceId),
        porFonte: Object.fromEntries([...pools.sourcePools.entries()].map(([k, v]) => [k, v.length])),
        porFonteTotal: pools.rawPorFonte,
      },
    });
  })
);

// PUT /genres/:id — edita identidade/comportamento
router.put(
  "/:id",
  wrap(async (req, res) => {
    const data = genreUpdateSchema.parse(req.body);
    const genre = await prisma.genre.update({ where: { id: req.params.id }, data });
    res.json(genre);
  })
);

// DELETE /genres/:id — programa 1:1 do gênero também sai (grade em cascata)
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const genre = await prisma.genre.findUnique({ where: { id: req.params.id }, include: { program: true } });
    if (!genre) throw new HttpError(404, "gênero não encontrado");
    if (genre.program) await prisma.program.delete({ where: { id: genre.program.id } }).catch(() => {});
    await prisma.genre.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

export default router;
