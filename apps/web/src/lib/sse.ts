import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * SSE: a API empurra "state" (playout) e "sync" (runs concluídas).
 * Qualquer evento invalida as queries do painel — nada de polling agressivo.
 * Fallback: os getters usam refetchInterval se o SSE não conectar.
 */
export function useAntennaEvents(onState?: () => void): void {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/v1/events");
    const invalidate = (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    es.addEventListener("state", () => {
      invalidate(["playout-state", "playout-queue", "history"]);
      onState?.();
    });
    es.addEventListener("sync", () => invalidate(["genres", "genre", "sync-runs"]));
    es.onerror = () => es.close(); // reconecta sozinho pelo retry do navegador? não — remonta no unmount/remount
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
