/*
 * Migração v1 (Tv-local) → Antenna.
 *
 * Lê o SQLite do v1 (somente leitura, via node:sqlite — sem dependências),
 * copia tudo preservando IDs e valida contagens tabela a tabela no fim.
 * Descarta: Rule, _ProgramToRule (legado sem uso).
 *
 * Uso (na raiz do monorepo):
 *   npm run migrate:v1                                  # caminho padrão do v1
 *   npm run migrate:v1 -- --from <caminho> [--force]    # --force limpa o destino antes
 */

import { DatabaseSync } from "node:sqlite";
import { execSync } from "node:child_process";
import path from "node:path";
import { prisma, resolveDatabaseUrl } from "./index";

type Row = Record<string, unknown>;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const DEFAULT_V1 = path.resolve(__dirname, "../../../..", "Tv-local", "data", "local-tv.db");
const fromPath = path.resolve(arg("--from") || DEFAULT_V1);
const force = process.argv.includes("--force");

// DATABASE_URL=file:.../antenna.db?connection_limit=1 -> caminho do arquivo
const dbUrl = resolveDatabaseUrl();
const toPath = dbUrl.replace(/^file:/, "").split("?")[0];
if (!toPath) {
  console.error("DATABASE_URL não definida (.env). Ex.: file:.../data/antenna.db");
  process.exit(1);
}

function dt(v: unknown): Date | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v) : null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function main() {
  console.log(`origem: ${fromPath}`);
  console.log(`destino: ${toPath}`);

  let v1: DatabaseSync;
  try {
    v1 = new DatabaseSync(fromPath, { readOnly: true });
  } catch (err) {
    console.error(`não abriu o banco do v1: ${(err as Error).message}`);
    process.exit(1);
  }
  const all = (sql: string): Row[] => v1.prepare(sql).all() as unknown as Row[];

  // ---- prepara o destino (db push se estiver vazio/inexistente) ----
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='Genre'`
  );
  if (!tables.length) {
    console.log("destino sem schema — executando prisma db push…");
    execSync("npx prisma db push --skip-generate", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });
  }

  const existing = await prisma.genre.count();
  if (existing > 0 && !force) {
    console.error(`destino já tem ${existing} gênero(s). Use --force para limpar e migrar de novo.`);
    process.exit(1);
  }
  if (force) {
    console.log("limpando destino (--force)…");
    await prisma.playbackHistory.deleteMany();
    await prisma.syncRun.deleteMany();
    await prisma.mixIngredient.deleteMany();
    await prisma.genreItem.deleteMany();
    await prisma.programSchedule.deleteMany();
    await prisma.program.deleteMany();
    await prisma.source.deleteMany();
    await prisma.media.deleteMany();
    await prisma.category.deleteMany();
    await prisma.genre.deleteMany();
    await prisma.$executeRawUnsafe(`DELETE FROM "_CategoryToMedia"`);
  }

  // ---- lê o v1 ----
  const genres = all(`SELECT * FROM Playlist`);
  const sources = all(`SELECT * FROM Source`);
  const medias = all(`SELECT * FROM Media`);
  const items = all(`SELECT * FROM PlaylistItem`);
  const mixes = all(`SELECT * FROM MixIngredient`);
  const programs = all(`SELECT * FROM Program`);
  const schedules = all(`SELECT * FROM ProgramSchedule`);
  const runs = all(`SELECT * FROM SyncRun`);
  const history = all(`SELECT * FROM PlaybackHistory`);
  const categories = all(`SELECT * FROM Category`);
  const catLinks = all(`SELECT * FROM "_CategoryToMedia"`);

  // ---- grava no destino (ordem respeita FK) ----
  for (const g of genres) {
    await prisma.genre.create({
      data: {
        id: str(g.id), name: str(g.name), description: str(g.description),
        color: str(g.color) || "#38bdf8", icon: str(g.icon) || "🎭",
        antiRepeatWindow: Number(g.antiRepeatWindow) || 20,
        orderingPadrao: str(g.orderingPadrao) || "menos_reproduzidos",
        status: str(g.status) || "ativo", createdAt: dt(g.createdAt) ?? new Date(),
      },
    });
  }

  for (const s of sources) {
    await prisma.source.create({
      data: {
        id: str(s.id), genreId: str(s.playlistId), type: str(s.type),
        url: str(s.url), query: str(s.query), limit: Number(s.limit) || 12,
        status: str(s.status) || "ativo", lastSyncAt: dt(s.lastSyncAt),
        lastSyncCount: Number(s.lastSyncCount) || 0, lastError: str(s.lastError),
        filters: s.filters == null ? null : str(s.filters), sort: str(s.sort) || "recent",
        createdAt: dt(s.createdAt) ?? new Date(),
      },
    });
  }

  for (const m of medias) {
    await prisma.media.create({
      data: {
        id: str(m.id), title: str(m.title), description: str(m.description), url: str(m.url),
        duration: Number(m.duration) || 0, source: str(m.source) || "local",
        status: str(m.status) || "ativo", originSourceId: m.originSourceId == null ? null : str(m.originSourceId),
        resolvedId: m.resolvedId == null ? null : str(m.resolvedId), channelTitle: str(m.channelTitle),
        views: m.views == null ? null : Number(m.views), uploadDate: dt(m.uploadDate),
        thumbnailUrl: null, createdAt: dt(m.createdAt) ?? new Date(),
      },
    });
  }

  for (const it of items) {
    await prisma.genreItem.create({
      data: { id: str(it.id), order: Number(it.order) || 0, genreId: str(it.playlistId), mediaId: str(it.mediaId) },
    });
  }

  for (const mi of mixes) {
    await prisma.mixIngredient.create({
      data: {
        id: str(mi.id), genreId: str(mi.playlistId), scope: str(mi.scope),
        sourceId: mi.sourceId == null ? null : str(mi.sourceId),
        categoryName: mi.categoryName == null ? null : str(mi.categoryName),
        count: Number(mi.count) || 1, order: Number(mi.order) || 0,
      },
    });
  }

  for (const c of categories) {
    await prisma.category.create({
      data: { id: str(c.id), name: str(c.name), color: str(c.color) || "#3b82f6", createdAt: dt(c.createdAt) ?? new Date() },
    });
  }

  for (const p of programs) {
    await prisma.program.create({
      data: {
        id: str(p.id), name: str(p.name), description: str(p.description),
        targetDuration: Number(p.targetDuration) || 0,
        openUrl: p.openUrl == null ? null : str(p.openUrl),
        closeUrl: p.closeUrl == null ? null : str(p.closeUrl),
        status: str(p.status) || "active",
        mixOverride: p.mixOverride == null ? null : str(p.mixOverride),
        createdAt: dt(p.createdAt) ?? new Date(),
        genreId: p.playlistId == null ? null : str(p.playlistId),
      },
    });
  }

  for (const s of schedules) {
    await prisma.programSchedule.create({
      data: {
        id: str(s.id), programId: str(s.programId),
        dayOfWeek: Number(s.dayOfWeek) || 0, startTime: str(s.startTime), endTime: str(s.endTime),
      },
    });
  }

  for (const r of runs) {
    await prisma.syncRun.create({
      data: {
        id: str(r.id), sourceId: str(r.sourceId), startedAt: dt(r.startedAt) ?? new Date(),
        finishedAt: dt(r.finishedAt), added: Number(r.added) || 0,
        errors: Number(r.errors) || 0, message: str(r.message),
      },
    });
  }

  for (const h of history) {
    await prisma.playbackHistory.create({
      data: {
        id: str(h.id), mediaId: str(h.mediaId),
        programId: h.programId == null ? null : str(h.programId),
        channel: str(h.channel) || "antenna", startedAt: dt(h.startedAt) ?? new Date(),
        finishedAt: dt(h.finishedAt), duration: Number(h.duration) || 0, result: str(h.result) || "playing",
      },
    });
  }

  for (const l of catLinks) {
    await prisma.$queryRaw`INSERT INTO "_CategoryToMedia" ("A", "B") VALUES (${str(l.A)}, ${str(l.B)})`;
  }

  // ---- validação: contagens tabela a tabela ----
  const pairs: [string, number, number][] = [
    ["Genre ← Playlist", genres.length, await prisma.genre.count()],
    ["Source", sources.length, await prisma.source.count()],
    ["Media", medias.length, await prisma.media.count()],
    ["GenreItem ← PlaylistItem", items.length, await prisma.genreItem.count()],
    ["MixIngredient", mixes.length, await prisma.mixIngredient.count()],
    ["Category", categories.length, await prisma.category.count()],
    ["Program", programs.length, await prisma.program.count()],
    ["ProgramSchedule", schedules.length, await prisma.programSchedule.count()],
    ["SyncRun", runs.length, await prisma.syncRun.count()],
    ["PlaybackHistory", history.length, await prisma.playbackHistory.count()],
    ["_CategoryToMedia", catLinks.length,
      Number(
        (await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM "_CategoryToMedia"`)[0].n
      )],
  ];

  console.log("\nValidação (origem → destino):");
  let ok = true;
  for (const [name, a, b] of pairs) {
    const line = `${name}: ${a} → ${b}`;
    console.log(`  ${a === b ? "OK " : "DIF"} ${line}`);
    if (a !== b) ok = false;
  }

  if (!ok) {
    console.error("\nMIGRAÇÃO FALHOU: contagens divergentes (destino NÃO foi limpo — corrija e rode de novo com --force).");
    process.exit(1);
  }
  console.log("\nMigração concluída e validada.");
}

main()
  .catch((err) => {
    console.error("migração:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
