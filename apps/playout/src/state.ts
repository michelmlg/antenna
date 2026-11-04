/**
 * Estado do playout: fonte da verdade é a tabela PlayoutState (linha id=1).
 * O worker publica a cada tick; a API e o painel só leem — restart do worker
 * não deixa o painel cego, e o fallbackMediaId persiste entre boots.
 */
import { prisma } from "@antenna/database";
import type { PlayoutStatePayload } from "@antenna/shared";
import { playoutStatePayloadSchema } from "@antenna/shared";

export async function readState(): Promise<PlayoutStatePayload | null> {
  const row = await prisma.playoutState.findUnique({ where: { id: 1 } });
  if (!row) return null;
  const parsed = playoutStatePayloadSchema.safeParse(JSON.parse(row.payload || "{}"));
  return parsed.success ? parsed.data : null;
}

export async function readStateUpdatedAt(): Promise<Date | null> {
  const row = await prisma.playoutState.findUnique({ where: { id: 1 }, select: { updatedAt: true } });
  return row?.updatedAt ?? null;
}

export async function writeState(payload: PlayoutStatePayload): Promise<void> {
  await prisma.playoutState.upsert({
    where: { id: 1 },
    update: { payload: JSON.stringify(payload), updatedAt: new Date() },
    create: { id: 1, payload: JSON.stringify(payload), updatedAt: new Date() },
  });
}

/** Só ajusta o fallback (API comanda) sem esperar o próximo tick. */
export async function writeFallback(mediaId: string | null): Promise<void> {
  const current = (await readState()) ?? {
    running: false,
    channel: "",
    since: null,
    current: null,
    next: null,
    queue: [],
    errors: 0,
    restarts: 0,
    lastError: null,
    fallbackMediaId: mediaId,
  };
  current.fallbackMediaId = mediaId;
  await writeState(current);
}
