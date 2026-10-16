import { setupDb } from "@antenna/database";
import { buildApp } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

async function main() {
  await setupDb();
  logger.info("[db] conectado");

  const app = buildApp();
  app.listen(config.apiPort, () => {
    logger.info(`[http] Antenna API em :${config.apiPort} (canal "${config.channel}")`);
  });
}

main().catch((err) => {
  logger.error({ err }, "[fatal] falha ao iniciar API");
  process.exit(1);
});
