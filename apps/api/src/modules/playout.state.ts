/** Leitura do estado publicado pelo worker (tabela PlayoutState, linha id=1). */
import { prisma } from "@antenna/database";
import type { PlayoutStatePayload } from "@antenna/shared";
import { playoutStatePayloadSchema } from "@antenna/shared";

export async function readState(): Promise<PlayoutStatePayload | null> {
  const row = await prisma.playoutState.findUnique({ where: { id: 1 } });
  if (!row) return null;
  try {
    const parsed = playoutStatePayloadSchema.safeParse(JSON.parse(row.payload || "{}"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readStateUpdatedAt(): Promise<Date | null> {
  const row = await prisma.playoutState.findUnique({ where: { id: 1 }, select: { updatedAt: true } });
  return row?.updatedAt ?? null;
}
