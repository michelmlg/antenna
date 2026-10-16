/**
 * Grade semanal (EPG): bloco atual, blocos que começam em breve (pre-warm).
 * Blocos NÃO cruzam meia-noite (paridade com o v1 — endTime do mesmo dia).
 */
import type { Prisma } from "@prisma/client";

export type ScheduleRow = Prisma.ProgramScheduleGetPayload<{ include: { program: true } }>;

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toMinutes(hhmmStr: string): number {
  const [h, m] = String(hhmmStr).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface Blockish {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Bloco agendado AGORA (grade semanal). Genérico: preserva o tipo das linhas. */
export function currentBlock<T extends Blockish>(rows: T[], now = new Date()): T | null {
  const dow = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();
  return (
    rows.find((r) => {
      if (r.dayOfWeek !== dow) return false;
      const start = toMinutes(r.startTime);
      const end = toMinutes(r.endTime);
      return start <= cur && cur < end;
    }) ?? null
  );
}

/** IDs de gênero com bloco começando nos próximos `withinMin` minutos (inclui virada do dia). */
export function blocksStartingWithin(
  rows: { dayOfWeek: number; startTime: string; program: { genreId: string | null } | null }[],
  withinMin: number,
  now = new Date()
): string[] {
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const ids: string[] = [];
  for (const r of rows) {
    if (!r.program || !r.program.genreId) continue;
    const startMin = toMinutes(r.startTime);
    if (r.dayOfWeek === dow && startMin >= nowMin && startMin - nowMin <= withinMin) {
      ids.push(r.program.genreId);
    }
    if (r.dayOfWeek === (dow + 1) % 7 && startMin + 1440 - nowMin <= withinMin) {
      ids.push(r.program.genreId);
    }
  }
  return [...new Set(ids)];
}
