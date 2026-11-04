/**
 * Scheduler de sincronização (port do sync-scheduler do v1).
 *  - periódica: fontes ativas há mais de CONTENT_SYNC_HOURS sem sync
 *  - pre-warm:  blocos da grade que começam em até CONTENT_SYNC_PREWARM_MIN
 * Varre a cada 10 min; syncs rodam em background (nunca derrubam o playout).
 */
import { prisma } from "@antenna/database";
import { blocksStartingWithin } from "@antenna/core";
import { config } from "./config";
import { syncGenre } from "./sync";

const SWEEP_MS = 10 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

export async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const jobs = new Map<string, string>(); // genreId -> motivo

    if (config.prewarmMin > 0) {
      const rows = await prisma.programSchedule.findMany({
        include: { program: { select: { genreId: true } } },
      });
      for (const gid of blocksStartingWithin(rows, config.prewarmMin)) jobs.set(gid, "pre-warm");
    }

    if (config.syncHours > 0) {
      const cutoff = new Date(Date.now() - config.syncHours * 3600 * 1000);
      const stale = await prisma.source.findMany({
        where: {
          status: "ativo",
          genre: { status: "ativo" },
          OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
        },
        select: { genreId: true },
      });
      for (const s of stale) if (!jobs.has(s.genreId)) jobs.set(s.genreId, "periódica");
    }

    for (const [gid, reason] of jobs) {
      try {
        const r = await syncGenre(gid);
        if (r.added) console.log(`[sync] +${r.added} vídeo(s) (${reason})`);
      } catch (err) {
        console.error(`[sync] gênero ${gid}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[sync] sweep:", String(err instanceof Error ? err.message : err));
  } finally {
    sweeping = false;
  }
}

export function startScheduler(): void {
  if (timer) return;
  if (config.syncHours <= 0 && config.prewarmMin <= 0) {
    console.log("[sync] scheduler desativado (CONTENT_SYNC_HOURS=0 e CONTENT_SYNC_PREWARM_MIN=0)");
    return;
  }
  console.log(
    `[sync] scheduler: periódica a cada ${config.syncHours}h + pre-warm ${config.prewarmMin}min antes dos blocos`
  );
  timer = setInterval(() => sweep(), SWEEP_MS);
  // primeira varredura após o boot, sem brigar com o start do playout
  setTimeout(() => sweep().catch((e) => console.error("[sync]", e)), 60 * 1000);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
