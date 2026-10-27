import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// raiz do monorepo (packages/database/src -> 3 níveis); /app no container
export const ROOT_DIR = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

/** Pasta de dados (banco + branding): DATA_DIR relativo à raiz, padrão `data/`. */
export function dataDir(): string {
  return path.resolve(ROOT_DIR, process.env.DATA_DIR || "data");
}

/**
 * URL do SQLite. DATABASE_URL explícita vence (compatível com .env antigo);
 * senão deriva `<DATA_DIR>/antenna.db` e cria a pasta. Também grava em
 * process.env para o Prisma CLI e o client enxergarem a mesma URL.
 */
export function resolveDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "antenna.db").replace(/\\/g, "/");
    process.env.DATABASE_URL = `file:${file}?connection_limit=1&socket_timeout=15`;
  }
  return process.env.DATABASE_URL;
}
