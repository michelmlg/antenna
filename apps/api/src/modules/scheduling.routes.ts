/** Programas + grade semanal (EPG). A grade cria o auto-programa do gênero. */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { programCreateSchema, programUpdateSchema, scheduleCreateSchema } from "@antenna/shared";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";

export const programRoutes = Router();
programRoutes.use(auth);

programRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const programs = await prisma.program.findMany({
      orderBy: { createdAt: "desc" },
      include: { genre: { select: { id: true, name: true, color: true, icon: true } }, _count: { select: { schedule: true } } },
    });
    res.json(programs);
  })
);

programRoutes.post(
  "/",
  wrap(async (req, res) => {
    const data = programCreateSchema.parse(req.body);
    const program = await prisma.program.create({
      data: {
        name: data.name,
        description: data.description ?? "",
        targetDuration: data.targetDuration ?? 0,
        genreId: data.genreId ?? null,
      },
      include: { genre: true },
    });
    res.status(201).json(program);
  })
);

programRoutes.patch(
  "/:id",
  wrap(async (req, res) => {
    const data = programUpdateSchema.parse(req.body);
    const program = await prisma.program.update({ where: { id: req.params.id }, data });
    res.json(program);
  })
);

programRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    await prisma.program.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

// ---------- grade semanal ----------
export const scheduleRoutes = Router();
scheduleRoutes.use(auth);

// GET /schedule — semana inteira (EPG do painel)
scheduleRoutes.get(
  "/",
  wrap(async (_req, res) => {
    const rows = await prisma.programSchedule.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: { program: { include: { genre: { select: { id: true, name: true, color: true, icon: true } } } } },
    });
    res.json(rows);
  })
);

// POST /schedule — cria bloco; com genreId, cria/reaproveita o auto-programa
scheduleRoutes.post(
  "/",
  wrap(async (req, res) => {
    const data = scheduleCreateSchema.parse(req.body);
    if (!data.genreId && !data.programId) throw new HttpError(400, "genreId ou programId obrigatório");

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

    const row = await prisma.programSchedule.create({
      data: { programId, dayOfWeek: data.dayOfWeek, startTime: data.startTime, endTime: data.endTime },
      include: { program: { include: { genre: true } } },
    });
    res.status(201).json(row);
  })
);

scheduleRoutes.delete(
  "/:id",
  wrap(async (req, res) => {
    await prisma.programSchedule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);
