import { setupDb } from "@antenna/database";
import { config } from "./config";
import { startControl } from "./control";
import { playout } from "./playout";
import { readState, writeFallback } from "./state";
import { startScheduler } from "./sync-scheduler";

async function main() {
  await setupDb();
  console.log("[db] conectado");

  // restaura o fallback e a fila persistidos (sobrevivem a restarts)
  const persisted = await readState();
  if (!config.fallbackMediaId && persisted?.fallbackMediaId) {
    await playout.setFallback(persisted.fallbackMediaId);
    await writeFallback(persisted.fallbackMediaId);
  }
  if (persisted?.queue?.length) {
    const prog =
      persisted.current?.programId != null
        ? { id: persisted.current.programId, name: persisted.current.programName ?? "" }
        : null;
    playout.restoreQueue(persisted.queue, prog);
  }

  if (config.autoplay) {
    await playout.start();
  } else {
    console.log("[playout] AUTOPLAY=false — aguardando comando");
    await writeFallback(config.fallbackMediaId).catch(() => {});
  }

  startScheduler();
  startControl(config.playoutPort);

  console.log(`[antenna] canal "${config.channel}" — worker de playout pronto`);
}

main().catch((err) => {
  console.error("[fatal] falha ao iniciar worker:", err);
  process.exit(1);
});
