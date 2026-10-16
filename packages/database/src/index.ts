import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Conecta e ajusta o SQLite para coexistência API (controle) + playout (worker):
 * - WAL: leitores não bloqueiam o escritor e vice-versa (persistente no arquivo)
 * - busy_timeout: escritor concorrente espera em vez de falhar na hora
 * Use também connection_limit=1 na DATABASE_URL (1 conexão por processo).
 */
export async function setupDb(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  try {
    // journal_mode/busy_timeout RETORNAM resultado -> $queryRawUnsafe (executeRaw recusa)
    const mode = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=8000;");
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON;");
    if (String(mode[0]?.journal_mode).toLowerCase() !== "wal") {
      console.warn("[db] WAL não ativo (filesystem sem suporte?):", mode[0]);
    }
  } catch (err) {
    console.warn("[db] pragmas:", err instanceof Error ? err.message : err);
  }
}
