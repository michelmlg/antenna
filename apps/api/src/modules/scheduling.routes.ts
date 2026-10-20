/** Grade semanal (EPG). Blocos referenciam o auto-programa do gênero (criado/reaproveitado no POST). */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@antenna/database";
import { hasOverlap, minutesToHHMM, MIN_DURATION, toMin } from "@antenna/core";
import { scheduleCreateSchema, scheduleUpdateSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";

const SCHEDULE_INCLUDE = {
  program: { include: { genre: { select: { id: true, name: true, color: true, icon: true } } } },
};

/** Confere tamanho mínimo e sobreposição no dia destino antes de gravar (409). */
async function assertScheduleFits(
  data: { dayOfWeek: number; startTime: string; endTime: string },
  excludeId?: string,
) {
  const start = toMin(data.startTime);
  const end = toMin(data.endTime);
  if (end <= start) throw new HttpError(400, "endTime deve ser depois de startTime");
  if (end - start < MIN_DURATION) throw new HttpError(400, `duração mínima: ${MIN_DURATION} min`);
  const others = await prisma.programSchedule.findMany({
    where: { dayOfWeek: data.dayOfWeek, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (hasOverlap(others, data.dayOfWeek, start, end, excludeId)) {
    const clash = others.find((r) => start < toMin(r.endTime) && toMin(r.startTime) < end)!;
    throw new HttpError(
      409,
      `conflito com bloco iniciando às ${minutesToHHMM(toMin(clash.startTime))} (${clash.id})`,
    );
  }
}

// ---------- grade semanal ----------
export const scheduleRoutes = Router();
scheduleRoutes.use(auth);

// GET /schedule — semana inteira (EPG do painel)
scheduleRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const rows = await prisma.programSchedule.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: SCHEDULE_INCLUDE,
    });
    res.json(rows);
  }),
);

// POST /schedule — cria bloco; com genreId, cria/reaproveita o auto-programa
scheduleRoutes.post(
  "/",
  wrap(async (req, res) => {
    const data = scheduleCreateSchema.parse(req.body);
    if (!data.genreId && !data.programId)
      throw new HttpError(400, "genreId ou programId obrigatório");

    let programId = data.programId;
    if (data.genreId) {
      const genre = await prisma.genre.findUnique({ where: { id: data.genreId } });
      if (!genre) throw new HttpError(404, "gênero não encontrado");
      const existing = await prisma.program.findUnique({ where: { genreId: genre.id } });
      programId = existing
        ? existing.id
        : (await prisma.program.create({ data: { name: genre.name, genreId: genre.id } })).id;
    }
    if (!programId) throw new HttpError(400, "programId inválido");

    await assertScheduleFits({
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    const row = await prisma.programSchedule
      .create({
        data: {
          programId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
        },
        include: SCHEDULE_INCLUDE,
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          throw new HttpError(409, "já existe um bloco idêntico deste programa");
        throw e;
      });
    res.status(201).json(row);
  }),
);

// PATCH /schedule/:id — mover/redimensionar pela timeline; 409 se sobrepõe outro bloco do dia
scheduleRoutes.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = scheduleUpdateSchema.parse(req.body);
    const current = await prisma.programSchedule.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, "bloco não encontrado");

    const next = {
      dayOfWeek: data.dayOfWeek ?? current.dayOfWeek,
      startTime: data.startTime ?? current.startTime,
      endTime: data.endTime ?? current.endTime,
    };
    await assertScheduleFits(next, current.id);

    const row = await prisma.programSchedule
      .update({
        where: { id: current.id },
        data: next,
        include: SCHEDULE_INCLUDE,
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          throw new HttpError(409, "já existe um bloco idêntico deste programa");
        throw e;
      });
    res.json(row);
  }),
);

scheduleRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    await prisma.programSchedule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// DELETE /schedule — limpa a grade atual (remove TODOS os blocos; perfis salvos não são afetados)
scheduleRoutes.delete(
  "/",
  wrap(async (_req, res) => {
    const removed = await prisma.$transaction(async (tx) => {
      const n = await tx.programSchedule.deleteMany({});
      return n.count;
    });
    res.json({ ok: true, removed });
  }),
);
