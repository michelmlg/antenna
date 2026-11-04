/** Helpers do domínio de gêneros/fontes usados por várias abas. */
import type { ScheduleRow, SourceRow } from "../../lib/api";
import { toMin } from "../grade/time";

export const ORDERINGS: [string, string][] = [
  ["menos_reproduzidos", "Menos reproduzidos"],
  ["aleatoria", "Aleatória"],
  ["mais_antigos", "Mais antigos"],
  ["definida", "Ordem definida"],
];

export const orderingLabel = (k: string) =>
  ORDERINGS.find(([v]) => v === k)?.[1].toLowerCase() ?? k.replace(/_/g, " ");

/** Rótulo da fonte na lista/mistura/simulador — canal com busca aparece como "busca". */
export function sourceLabelOf(s: Pick<SourceRow, "type" | "url" | "query">): string {
  if (s.type === "search") return `busca "${s.query}"`;
  return (
    s.url.replace("https://www.youtube.com/", "").replace(/\/(videos|search)$/i, "") || "vídeo"
  );
}

/** busca interna aceita em canal (e no tipo legado channelSearch) */
export const hasChannelQuery = (s: { type: string; query: string }): boolean =>
  s.type === "channel" || s.type === "channelSearch";

/** Minutos por semana de cada gênero na grade. */
export function weeklyMinutesByGenre(rows: ScheduleRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = r.program.genre?.id;
    if (id) m.set(id, (m.get(id) ?? 0) + toMin(r.endTime) - toMin(r.startTime));
  }
  return m;
}
