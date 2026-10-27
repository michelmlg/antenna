/**
 * Prisma CLI com a DATABASE_URL resolvida (DATA_DIR do .env da raiz).
 *   tsx packages/database/scripts/prisma.ts db push [--skip-generate]
 * `db push` cria o antenna.db se não existir e aplica o schema atual.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveDatabaseUrl } from "../src/url";

resolveDatabaseUrl();
const schema = path.resolve(__dirname, "../prisma/schema.prisma");
const r = spawnSync("npx", ["prisma", ...process.argv.slice(2), "--schema", schema], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
