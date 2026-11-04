/**
 * Seleção — a "sequência viva" de um gênero (mistura de ingredientes) e a
 * seleção automática fora da grade. Portado do composer/selector do v1.
 *
 * Split proposital:
 *  - planSequence(): PURA (pools + mistura + janela anti-repetição em memória) — testada
 *  - composeCycle()/selectMedia(): carregam do banco e chamam as puras
 */
import type { Prisma } from "@prisma/client";
import type { SourceFilters } from "@antenna/shared";
import { prisma } from "@antenna/database";
import { parseFilters, passes } from "./filters";

const MAX_PASSES = 40; // proteção contra loops

export type MixScope = "links" | "source" | "genre" | "category";
export interface MixItem {
  scope: MixScope;
  sourceId: string | null;
  categoryName: string | null;
  count: number;
  order: number;
}

export type MediaRow = Prisma.MediaGetPayload<object>;

export interface GenrePools {
  manual: MediaRow[];
  sourcePools: Map<string, MediaRow[]>;
  genrePool: MediaRow[];
  rawPorFonte: Record<string, number>; // total SEM filtro por fonte ("3 de 12" na UI)
}

// ---------- mistura vinda de JSON (mixOverride do programa) ----------
export function parseMixOverride(json: string | null | undefined): MixItem[] | null {
  try {
    const arr = JSON.parse(json || "null");
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr
      .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === "object" && typeof (i as { scope?: unknown }).scope === "string")
      .map((i, idx) => ({
        scope: i.scope as MixScope,
        sourceId: typeof i.sourceId === "string" ? i.sourceId : null,
        categoryName: typeof i.categoryName === "string" ? i.categoryName : null,
        count: Math.min(Math.max(Number(i.count) || 1, 1), 10),
        order: idx,
      }));
  } catch {
    return null;
  }
}

export function normalizeMix(ingredients: { scope: string; sourceId: string | null; categoryName: string | null; count: number; order?: number }[]): MixItem[] {
  return ingredients.map((i, idx) => ({
    scope: i.scope as MixScope,
    sourceId: i.sourceId,
    categoryName: i.categoryName,
    count: Math.min(Math.max(Number(i.count) || 1, 1), 10),
    order: i.order ?? idx,
  }));
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- pools do gênero (DB) ----------
export async function loadGenre(genreId: string) {
  return prisma.genre.findUnique({
    where: { id: genreId },
    include: {
      sources: { orderBy: { createdAt: "asc" } },
      items: { orderBy: { order: "asc" }, include: { media: true } },
      ingredients: { orderBy: { order: "asc" } },
    },
  });
}

/**
 * Pools do gênero: links manuais + mídias expandidas por fonte.
 * Filtros avançados valem AQUI TAMBÉM: mídia já sincronizada que não bate
 * mais com o filtro da fonte fica de fora (nada é apagado).
 * Links manuais não passam por filtro (escolha de propósito).
 */
export async function buildPools(genre: NonNullable<Awaited<ReturnType<typeof loadGenre>>>): Promise<GenrePools> {
  const manual = genre.items.map((it) => it.media).filter((m) => m && m.status === "ativo");

  const filtersBySource = new Map<string, SourceFilters>(
    (genre.sources || []).map((s) => [s.id, parseFilters(s.filters)])
  );
  const sourcePools = new Map<string, MediaRow[]>();
  for (const s of genre.sources) sourcePools.set(s.id, []);

  const expanded = genre.sources.length
    ? await prisma.media.findMany({
        where: { originSourceId: { in: genre.sources.map((s) => s.id) }, status: "ativo" },
      })
    : [];

  const accepted: MediaRow[] = [];
  const rawPorFonte: Record<string, number> = {};
  for (const m of expanded) {
    if (!m.originSourceId) continue;
    rawPorFonte[m.originSourceId] = (rawPorFonte[m.originSourceId] || 0) + 1;
    if (!sourcePools.has(m.originSourceId)) continue;
    const f = filtersBySource.get(m.originSourceId);
    if (f && !passes({ title: m.title, duration: m.duration, views: m.views, uploadDate: m.uploadDate }, f)) continue;
    sourcePools.get(m.originSourceId)!.push(m);
    accepted.push(m); // também vale pro pool do gênero (escopo "genre")
  }

  const seen = new Set<string>();
  const genrePool = [...manual, ...accepted].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  return { manual, sourcePools, genrePool, rawPorFonte };
}

// ---------- janela anti-repetição (DB) ----------
/** Últimos N ids distintos exibidos — GLOBAL (corta repetição entre gêneros). */
export async function recentWindow(n: number): Promise<Set<string>> {
  const count = Math.min(Math.max(Number(n) || 0, 0), 100);
  if (!count) return new Set();
  const rows = await prisma.playbackHistory.findMany({
    take: count * 3 + 10,
    orderBy: { startedAt: "desc" },
    select: { mediaId: true },
  });
  const out = new Set<string>();
  for (const r of rows) {
    if (!out.has(r.mediaId)) {
      out.add(r.mediaId);
      if (out.size >= count) break;
    }
  }
  return out;
}

// ---------- planSequence (pura) ----------
export interface PlanEntry {
  media: MediaRow;
  scope: MixScope;
  scopeLabel: string;
}

export type SourcesByIdMap = Map<string, { type: string; url: string; query: string }>;

/**
 * Monta a sequência viva a partir dos pools em memória.
 *   recent    — janela anti-repetição (ids)
 *   forced    — exclusões duras (ex.: o item QUE ESTÁ NO AR): sobrevivem a todos
 *               os níveis de fallback e nunca entram no plano
 * Níveis de disponibilidade por ingrediente (portais do v1):
 *   1) fora da janela anti-repetição e fora do plano
 *   2) pool pequeno: abre a janela, mantém exclusões duras
 *   3) último recurso: repete — o canal nunca pode parar
 *   4) pool zerado → ingrediente pulado (fonte vazia/não sincronizada)
 */
export async function planSequence(opts: {
  pools: GenrePools;
  mix: MixItem[];
  recent: Set<string>;
  forced: Set<string>;
  ordering: string;
  playCounts: Map<string, number>; // contagem de exibições por mediaId
  count: number;
  categoryLoader?: (name: string) => Promise<MediaRow[]>;
  sourcesById?: SourcesByIdMap;
}): Promise<PlanEntry[]> {
  const { pools, mix, recent, forced, ordering, playCounts } = opts;
  const n = Math.min(Math.max(Number(opts.count) || 6, 1), 30);
  const planned = new Set<string>();
  const plan: PlanEntry[] = [];

  for (let pass = 0; pass < MAX_PASSES && plan.length < n; pass++) {
    let added = 0;
    for (const ing of mix) {
      if (plan.length >= n) break;
      let cand: MediaRow[];
      if (ing.scope === "links") cand = pools.manual;
      else if (ing.scope === "source") cand = (ing.sourceId && pools.sourcePools.get(ing.sourceId)) || [];
      else if (ing.scope === "genre") cand = pools.genrePool;
      else if (ing.scope === "category") {
        cand = ing.categoryName && opts.categoryLoader ? await opts.categoryLoader(ing.categoryName) : [];
      } else cand = [];

      // 1) janela anti-repetição + exclusões duras (no ar) + sem repetir o plano
      let avail = cand.filter((m) => !recent.has(m.id) && !forced.has(m.id) && !planned.has(m.id));
      // 2) pool pequeno: abre a janela anti-repetição, mantém as exclusões duras
      if (!avail.length) avail = cand.filter((m) => !forced.has(m.id) && !planned.has(m.id));
      // 3) último recurso: repete o que já passou na janela — mas NUNCA o no ar
      if (!avail.length) avail = cand.filter((m) => !forced.has(m.id) && !planned.has(m.id));
      // 4) pool zerado → ingrediente pulado
      if (!avail.length) continue;

      const ordered = orderPool(avail, ordering, playCounts);
      const take = Math.min(ing.count, ordered.length, n - plan.length);
      for (let i = 0; i < take; i++) {
        plan.push({ media: ordered[i], scope: ing.scope, scopeLabel: scopeLabel(ing, opts.sourcesById) });
        planned.add(ordered[i].id);
        added++;
      }
    }
    if (!added) break; // ninguém conseguiu item novo → evita loop infinito
  }
  return plan;
}

// ---------- ordenação justa ----------
export function orderPool(pool: MediaRow[], ordering: string, playCounts: Map<string, number>): MediaRow[] {
  const list = pool.slice();
  switch (ordering) {
    case "menos_reproduzidos":
      list.sort((a, b) => (playCounts.get(a.id) || 0) - (playCounts.get(b.id) || 0));
      break;
    case "mais_antigos":
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
    case "aleatoria":
      shuffle(list);
      break;
    case "definida":
    default:
      break; // mantém a ordem natural (playlist / mais recentes primeiro)
  }
  return list;
}

/** Rótulo do ingrediente para a UI (sem emojis — a web renderiza os ícones). */
export function scopeLabel(ing: MixItem, sourcesById?: Map<string, { type: string; url: string; query: string }>): string {
  if (ing.scope === "links") return "links";
  if (ing.scope === "genre") return "gênero";
  if (ing.scope === "category") return ing.categoryName || "categoria";
  if (ing.scope === "source") {
    const s = sourcesById?.get(ing.sourceId || "");
    if (!s) return "fonte";
    if (s.type === "search" || s.type === "channelSearch") return `busca "${s.query || "-"}"`;
    if (s.type === "channel") {
      const tail = String(s.url || "").split("/").filter(Boolean).pop() || "canal";
      return "canal " + tail;
    }
    return "fonte";
  }
  return ing.scope;
}

// ---------- composeCycle (DB) ----------
/** Sequência viva do gênero: carrega pools, janela, contagens e chama planSequence. */
export async function composeCycle(
  genreId: string,
  count = 6,
  overrideMix: string | null = null,
  excludeIds: string[] = []
): Promise<PlanEntry[]> {
  const genre = await loadGenre(genreId);
  if (!genre) return [];

  let mix = parseMixOverride(overrideMix);
  if (!mix) mix = normalizeMix(genre.ingredients);
  if (!mix.length) mix = [{ scope: "genre", count: 1, sourceId: null, categoryName: null, order: 0 }];

  const pools = await buildPools(genre);
  const recent = await recentWindow(genre.antiRepeatWindow);
  const forced = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const ordering = genre.orderingPadrao || "menos_reproduzidos";

  const ids = [...new Set([...pools.manual, ...pools.genrePool].map((m) => m.id))];
  const counts = ids.length
    ? await prisma.playbackHistory.groupBy({
        by: ["mediaId"],
        where: { mediaId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const playCounts = new Map(counts.map((c) => [c.mediaId, c._count._all]));
  const sourcesById: SourcesByIdMap = new Map(
    genre.sources.map((s) => [s.id, { type: s.type, url: s.url, query: s.query }])
  );

  return planSequence({
    pools,
    mix,
    recent,
    forced,
    ordering,
    playCounts,
    count,
    sourcesById,
    categoryLoader: async (name) =>
      prisma.media.findMany({
        where: { status: "ativo", categories: { some: { name } } },
      }),
  });
}

// ---------- seleção automática (fora da grade) ----------
async function recentIds(n: number): Promise<string[]> {
  const count = Number(n) || 0;
  if (count <= 0) return [];
  const rows = await prisma.playbackHistory.findMany({
    take: count,
    orderBy: { startedAt: "desc" },
    select: { mediaId: true },
  });
  return [...new Set(rows.map((r) => r.mediaId))];
}

/**
 * Seleção automática com ordenação (modo "sem grade programada").
 * Anti-repetição nunca zera o canal: cai em níveis de fallback:
 *   1) apenas o último reproduzido (evita repetição imediata)
 *   2) pool completo (só se sobrar 1 mídia ou pool minúsculo)
 */
export async function selectAuto(opts: { recentCount?: number; limit?: number; excludeIds?: string[] } = {}): Promise<MediaRow[]> {
  const limit = Math.min(Math.max(Number(opts.limit) || 1, 1), 30);
  const where: Prisma.MediaWhereInput = { status: "ativo" };

  const exclude = opts.excludeIds !== undefined ? opts.excludeIds : await recentIds(opts.recentCount ?? 0);
  if (exclude.length) where.id = { notIn: exclude };

  let items = await prisma.media.findMany({ where });
  if (!items.length && exclude.length) {
    where.id = { notIn: exclude.slice(0, 1) };
    items = await prisma.media.findMany({ where });
    if (!items.length) {
      delete where.id;
      items = await prisma.media.findMany({ where });
    }
  }

  shuffle(items);
  return items.slice(0, limit);
}

/** Mídia de fallback (RF do v1): explícita (env) ou source='fallback'/'título contém fallback'. */
export async function fallbackMedia(explicitId: string | null): Promise<Prisma.MediaGetPayload<object> | null> {
  if (explicitId) {
    const m = await prisma.media.findUnique({ where: { id: explicitId } });
    if (m && m.status === "ativo") return m;
  }
  return prisma.media.findFirst({
    where: { status: "ativo", OR: [{ source: "fallback" }, { title: { contains: "fallback" } }] },
  });
}
