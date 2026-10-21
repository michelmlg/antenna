/**
 * Sync de fontes (port do sync.js do v1) — expande canais e buscas do YouTube
 * em mídias. yt-dlp em modo --flat-playlist NÃO baixa nada: lista id/título/duração.
 * Dedupe em dois níveis (mesmo resolvedId): dentro da própria fonte e dentro do gênero.
 * O mesmo vídeo pode existir em gêneros diferentes (pools separados).
 */
import { execFile } from "node:child_process";
import { prisma } from "@antenna/database";
import { hasDateFilter, parseFilters, passes } from "@antenna/core";
import { extractYtId, probeYouTubeMeta, ytUrl } from "./probe";

const runningSources = new Set<string>(); // guarda contra syncs concorrentes

// URLs de canal (@handle, /channel/, /c/, /user/) -> aba "videos" explícita
export function normalizeChannelUrl(url: string): string {
  const u = String(url || "").trim();
  if (!/youtube\.com\//i.test(u)) return u;
  if (/\/(channel|c|user)\/[^/]+$/i.test(u) || /@[^/]+$/.test(u)) {
    return u.replace(/\/+$/, "") + "/videos";
  }
  return u;
}

// base do canal (sem /videos, /search etc.) — usado p/ montar a aba de busca
export function channelBaseUrl(url: string): string {
  const u = String(url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!/youtube\.com\//i.test(u)) return u;
  return u.replace(/\/(videos|search|shorts|streams|featured|live)$/i, "");
}

// executa fn em paralelo limitado (sondas de data)
async function mapLimit<T, R>(
  arr: T[],
  n: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, arr.length) }, async () => {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function bestThumb(e: { thumbnail?: string; thumbnails?: { url: string }[] }): string | null {
  if (e.thumbnail) return e.thumbnail;
  const list = e.thumbnails || [];
  return list.length ? list[list.length - 1].url : null;
}

/** Alvo do yt-dlp para a listagem da fonte:
 *  - search            -> busca global
 *  - channelSearch     -> legado: busca no canal
 *  - channel + query   -> busca dentro do canal (o "busca no canal" virou filtro da fonte)
 *  - channel sem query -> uploads do canal
 * `oldest` só anda o canal inteiro em listagem de canal sem busca (a página de
 * busca ignora ordenação; usamos os primeiros N como na busca global). */
export function ytTarget(opts: {
  type: string;
  url: string;
  query: string;
  sort: string;
  limit: number;
}): string {
  const q = String(opts.query || "").trim();
  const n = Math.min(Math.max(Number(opts.limit) || 12, 1), 50);
  if (opts.type === "search") return `ytsearch${n}:${q}`;
  if ((opts.type === "channelSearch" || opts.type === "channel") && q)
    return `${channelBaseUrl(opts.url)}/search?query=${encodeURIComponent(q)}`;
  return normalizeChannelUrl(opts.url);
}

/** Lista plana de vídeos (canal, busca global ou busca no canal) via yt-dlp. */
export function ytList(opts: {
  type: string;
  url: string;
  query: string;
  limit: number;
  sort: string;
}): Promise<{ entries: Record<string, unknown>[]; walkTotal: number }> {
  const n = Math.min(Math.max(Number(opts.limit) || 12, 1), 50);
  const oldest =
    opts.sort === "oldest" && opts.type === "channel" && !String(opts.query || "").trim();
  const target = ytTarget(opts);

  const args = ["--flat-playlist", "--dump-single-json"];
  if (!oldest) args.push("--playlist-end", String(n));
  args.push("--no-warnings", "--yes-playlist", "--ignore-errors", "--", target);

  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      args,
      {
        timeout: oldest ? 300000 : 120000,
        maxBuffer: oldest ? 64 * 1024 * 1024 : 16 * 1024 * 1024,
      },
      (err, stdout) => {
        if (err && !stdout) {
          const msg = String(err.message || err)
            .split("\n")[0]
            .slice(0, 200);
          return reject(new Error(msg || "yt-dlp falhou"));
        }
        try {
          const data = JSON.parse(String(stdout));
          let entries = ((data.entries || []) as Record<string, unknown>[]).filter(Boolean);
          let walkTotal = 0;
          if (oldest) {
            walkTotal = entries.length;
            entries = entries.slice(-n).reverse(); // cauda = os N mais antigos
          } else {
            entries = entries.slice(0, n);
          }
          resolve({ entries, walkTotal });
        } catch {
          reject(new Error("saída do yt-dlp ilegível"));
        }
      },
    );
  });
}

/** Sincroniza UMA fonte: expande e cadastra apenas mídias novas. */
export async function syncSource(source: {
  id: string;
  genreId: string;
  type: string;
  url: string;
  query: string;
  limit: number;
  sort: string;
  filters: string | null;
}) {
  if (runningSources.has(source.id))
    return {
      sourceId: source.id,
      added: 0,
      errors: 0,
      message: "sync já em andamento",
      skipped: true,
    };
  runningSources.add(source.id);

  const run = await prisma.syncRun.create({ data: { sourceId: source.id, startedAt: new Date() } });
  let added = 0;
  let errors = 0;
  let filtered = 0;
  let probed = 0;
  let healed = 0;
  let message = "";

  try {
    if (source.type === "video")
      throw new Error("fonte tipo video não sincroniza (use link direto)");
    if (source.type === "channel" && !source.url) throw new Error("fonte sem url");
    if (source.type === "search" && !source.query) throw new Error("fonte sem termo de busca");
    if (source.type === "channelSearch" && (!source.url || !source.query))
      throw new Error("fonte sem url do canal ou termo");

    const filters = parseFilters(source.filters);
    const { entries, walkTotal } = await ytList({
      type: source.type,
      url: source.url,
      query: source.query,
      limit: source.limit,
      sort: source.sort,
    });

    // o que já existe na própria fonte (com metadados p/ self-heal)
    const own = await prisma.media.findMany({
      where: { originSourceId: source.id },
      select: { id: true, resolvedId: true, url: true, uploadDate: true, views: true },
    });
    // o que já existe no gênero (links manuais + outras fontes)
    const inGenre = await prisma.media.findMany({
      where: {
        status: "ativo",
        OR: [
          { items: { some: { genreId: source.genreId } } },
          { originSource: { genreId: source.genreId } },
        ],
      },
      select: { resolvedId: true, url: true },
    });

    const have = new Set(own.map((m) => m.resolvedId).filter(Boolean) as string[]);
    const haveUrl = new Set(own.map((m) => m.url));
    const genreHave = new Set(inGenre.map((m) => m.resolvedId).filter(Boolean) as string[]);
    const genreUrl = new Set(inGenre.map((m) => m.url));

    // self-heal: preenche data/views que faltam em mídias já sincronizadas
    const byVid = new Map<string, (typeof own)[number]>();
    const byUrl = new Map<string, (typeof own)[number]>();
    own.forEach((m) => {
      if (m.resolvedId) byVid.set(m.resolvedId, m);
      byUrl.set(m.url, m);
    });
    for (const e of entries) {
      const vid = (e.id as string) || extractYtId(e.url as string);
      if (!vid) continue;
      const m = byVid.get(vid) || byUrl.get(ytUrl(vid));
      if (!m) continue;
      const patch: { uploadDate?: Date; views?: number } = {};
      if (!m.uploadDate && typeof e.timestamp === "number")
        patch.uploadDate = new Date(e.timestamp * 1000);
      if (m.views === null && Number.isFinite(Number(e.view_count)))
        patch.views = Number(e.view_count);
      if (Object.keys(patch).length) {
        try {
          await prisma.media.update({ where: { id: m.id }, data: patch });
          healed++;
        } catch {
          /* best effort */
        }
      }
    }

    // candidatos novos (fora da fonte e fora do gênero)
    const fresh: { e: Record<string, unknown>; vid: string; u: string; uploadDate?: Date }[] = [];
    for (const e of entries) {
      const vid = (e.id as string) || extractYtId(e.url as string);
      if (!vid) continue;
      const u = ytUrl(vid);
      if (have.has(vid) || haveUrl.has(u)) continue;
      if (genreHave.has(vid) || genreUrl.has(u)) continue;
      fresh.push({ e, vid, u });
    }

    // flat não traz data nesta versão do yt-dlp -> sonde cada vídeo NOVO,
    // mas só quando o filtro realmente precisar de data (caminho rápido preservado)
    if (hasDateFilter(filters)) {
      await mapLimit(fresh, 4, async (item) => {
        const meta = await probeYouTubeMeta(item.u);
        probed++;
        if (meta.uploadDate) item.uploadDate = meta.uploadDate;
      });
    }

    // self-heal de data: mídias já sincronizadas sem data também são sondadas
    if (hasDateFilter(filters)) {
      const missing = own.filter((m) => !m.uploadDate).slice(0, 8);
      await mapLimit(missing, 4, async (m) => {
        const meta = await probeYouTubeMeta(m.url);
        probed++;
        if (meta.uploadDate) {
          try {
            await prisma.media.update({
              where: { id: m.id },
              data: { uploadDate: meta.uploadDate },
            });
            healed++;
          } catch {
            /* best effort */
          }
        }
      });
    }

    // aplica os filtros avançados (título/duração/views/data/live)
    const accepted = fresh.filter((item) => {
      const e = item.e;
      const ok = passes(
        {
          title: e.title as string,
          duration: e.duration as number,
          view_count: e.view_count as number,
          timestamp: e.timestamp as number,
          live_status: e.live_status as string,
          uploadDate:
            item.uploadDate ?? (e.timestamp ? new Date((e.timestamp as number) * 1000) : null),
        },
        filters,
      );
      if (!ok) filtered++;
      return ok;
    });

    for (const item of accepted) {
      const { e, vid, u } = item;
      try {
        await prisma.media.create({
          data: {
            title: String(e.title || u).slice(0, 200),
            description: "",
            url: u,
            duration: Number(e.duration) || 0,
            source: "youtube",
            status: "ativo",
            resolvedId: vid,
            channelTitle: String(e.channel || e.uploader || "").slice(0, 120),
            views: Number.isFinite(Number(e.view_count)) ? Number(e.view_count) : null,
            uploadDate:
              item.uploadDate ?? (e.timestamp ? new Date((e.timestamp as number) * 1000) : null),
            thumbnailUrl: bestThumb(e as { thumbnail?: string; thumbnails?: { url: string }[] }),
            originSourceId: source.id,
          },
        });
        have.add(vid);
        haveUrl.add(u);
        genreHave.add(vid);
        genreUrl.add(u);
        added++;
      } catch {
        errors++;
      }
    }

    const parts: string[] = walkTotal
      ? [`${entries.length} dos ${walkTotal} (mais antigos)`]
      : [`${entries.length} listados`];
    if (hasDateFilter(filters) && probed) parts.push(`${probed} com data buscada`);
    if (filtered) parts.push(`${filtered} fora do filtro`);
    parts.push(`${added} novos`);
    if (healed) parts.push(`${healed} metadados atualizados`);
    message = parts.join(", ");
  } catch (err) {
    errors++;
    message = String(err instanceof Error ? err.message : err).slice(0, 300);
  }

  await prisma.syncRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), added, errors, message },
  });

  // pool saudável: no máximo limit*2 ativas por fonte (o mais velho é arquivado, não apagado)
  let archived = 0;
  try {
    const cap = Math.max(Number(source.limit) || 12, 1) * 2;
    const all = await prisma.media.findMany({
      where: { originSourceId: source.id, status: "ativo" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (all.length > cap) {
      const oldIds = all.slice(cap).map((m) => m.id);
      await prisma.media.updateMany({ where: { id: { in: oldIds } }, data: { status: "inativo" } });
      archived = oldIds.length;
      message += `, ${archived} arquivadas`;
      await prisma.syncRun.update({ where: { id: run.id }, data: { message } });
    }
  } catch {
    /* cap é melhor esforço */
  }

  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastSyncAt: new Date(),
      lastSyncCount: added,
      lastError: errors && !added ? message : "",
    },
  });
  runningSources.delete(source.id);
  return {
    sourceId: source.id,
    type: source.type,
    added,
    filtered,
    probed,
    archived,
    errors,
    message,
  };
}

/** Sincroniza todas as fontes ativas de um gênero (sequencial p/ não pesar). */
export async function syncGenre(genreId: string) {
  const sources = await prisma.source.findMany({
    where: { genreId, status: "ativo" },
    orderBy: { createdAt: "asc" },
  });
  const results: Awaited<ReturnType<typeof syncSource>>[] = [];
  for (const s of sources) results.push(await syncSource(s));
  return {
    genreId,
    added: results.reduce((a, r) => a + r.added, 0),
    filtered: results.reduce((a, r) => a + (r.filtered || 0), 0),
    errors: results.reduce((a, r) => a + r.errors, 0),
    sources: results,
  };
}
