/**
 * Perfis de programação: semanas salvas que podem ser aplicadas em
 * substituição à grade atual (troca de programação do canal a qualquer momento).
 * Apply é atômico: apaga todos os blocos e cria os do perfil numa transação.
 * Bloco cujo gênero foi apagado desde o save é mantido como programa-órfão
 * (sem gênero) — o playout cai na seleção automática nesse horário.
 */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { MIN_DURATION, toMin } from "@antenna/core";
import { scheduleProfileCreateSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";

const SCHEDULE_INCLUDE = {
  program: { include: { genre: { select: { id: true, name: true, color: true, icon: true } } } },
};
const BLOCKS_INCLUDE = {
  blocks: { orderBy: [{ dayOfWeek: "asc" as const }, { startTime: "asc" as const }] },
};

export const scheduleProfileRoutes = Router();
scheduleProfileRoutes.use(auth);

// GET /schedule/profiles — lista com contagem de blocos
scheduleProfileRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const profiles = await prisma.scheduleProfile.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, createdAt: true, _count: { select: { blocks: true } } },
    });
    res.json(profiles);
  }),
);

// POST /schedule/profiles — salva blocos como perfil (snapshot dos gêneros no servidor)
scheduleProfileRoutes.post(
  "/",
  wrap(async (req, res) => {
    const data = scheduleProfileCreateSchema.parse(req.body);

    const genreIds = [...new Set(data.blocks.map((b) => b.genreId))];
    const genres = await prisma.genre.findMany({ where: { id: { in: genreIds } } });
    if (genres.length < genreIds.length) {
      const missing = genreIds.find((id) => !genres.some((g) => g.id === id));
      throw new HttpError(404, `gênero não encontrado: ${missing}`);
    }

    for (const b of data.blocks) {
      if (toMin(b.endTime) - toMin(b.startTime) < MIN_DURATION)
        throw new HttpError(400, `duração mínima: ${MIN_DURATION} min`);
    }
    // sem sobreposição DENTRO do perfil (dia a dia, pares adjacentes)
    for (let dow = 0; dow < 7; dow++) {
      const day = data.blocks
        .filter((b) => b.dayOfWeek === dow)
        .map((b) => ({ start: toMin(b.startTime), end: toMin(b.endTime) }))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < day.length; i++) {
        if (day[i].start < day[i - 1].end)
          throw new HttpError(
            409,
            `blocos do perfil se sobrepõem no dia ${dow} (às ${(day[i - 1].end / 60) | 0}h)`,
          );
      }
    }

    const created = await prisma.scheduleProfile.create({
      data: {
        name: data.name,
        blocks: {
          create: data.blocks.map((b) => {
            const g = genres.find((x) => x.id === b.genreId)!;
            return {
              dayOfWeek: b.dayOfWeek,
              startTime: b.startTime,
              endTime: b.endTime,
              genreId: g.id,
              genreName: g.name,
              genreColor: g.color,
              genreIcon: g.icon,
            };
          }),
        },
      },
      include: BLOCKS_INCLUDE,
    });
    res.status(201).json(created);
  }),
);

// GET /schedule/profiles/:id — detalhe com blocos
scheduleProfileRoutes.get(
  "/:id",
  wrap(async (req, res) => {
    const profile = await prisma.scheduleProfile.findUnique({
      where: { id: req.params.id },
      include: BLOCKS_INCLUDE,
    });
    if (!profile) throw new HttpError(404, "perfil não encontrado");
    res.json(profile);
  }),
);

// DELETE /schedule/profiles/:id
scheduleProfileRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    await prisma.scheduleProfile.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// POST /schedule/profiles/:id/apply — substitui TODA a grade pelos blocos do perfil.
// Transação curta (WAL aguenta; leitores veem o antes ou o depois).
scheduleProfileRoutes.post(
  "/:id/apply",
  wrap(async (req, res) => {
    const profile = await prisma.scheduleProfile.findUnique({
      where: { id: req.params.id },
      include: { blocks: true },
    });
    if (!profile) throw new HttpError(404, "perfil não encontrado");

    const orphans = await prisma.$transaction(async (tx) => {
      await tx.programSchedule.deleteMany({});
      let orphanCount = 0;
      for (const b of profile.blocks) {
        let program = await tx.program.findUnique({ where: { genreId: b.genreId } });
        if (!program) {
          // gênero sumiu desde o save → mantém o bloco ligado a um programa-órfão
          // (sem gênero): o worker não programa conteúdo para ele e cai na seleção automática
          orphanCount++;
          program =
            (await tx.program.findFirst({ where: { name: b.genreName, genreId: null } })) ??
            (await tx.program.create({ data: { name: b.genreName, genreId: null } }));
        }
        await tx.programSchedule.create({
          data: {
            programId: program.id,
            dayOfWeek: b.dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
          },
        });
      }
      return orphanCount;
    });

    const rows = await prisma.programSchedule.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: SCHEDULE_INCLUDE,
    });
    res.json({ orphans, rows });
  }),
);
