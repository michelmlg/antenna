/** Utilidades puras da timeline: minutos ↔ pixels. Sem estado, sem rede. */
import { MIN_DURATION, snapMinutes, toMin } from "@antenna/core/schedule";

export const DOWS = [
  ["Dom", "Domingo"],
  ["Seg", "Segunda"],
  ["Ter", "Terça"],
  ["Qua", "Quarta"],
  ["Qui", "Quinta"],
  ["Sex", "Sexta"],
  ["Sáb", "Sábado"],
] as const;

export const LABEL_W = 64; // coluna de dias
export const LANE_H = 64;
export const MIN_BLOCK_W = 5; // largura visual mínima de bloco tratada pelo core (5 min)

/** Zoom "auto": a semana inteira (1440 min) cabe na largura útil da viewport. */
export function pxPerMinAuto(displayWidth: number): number {
  return Math.max(0.35, Math.min(6, (displayWidth - LABEL_W - 16) / 1440));
}

export const clampedPx = (px: number) => Math.max(0.35, Math.min(6, px));

/** Minuto do dia sob o cursor x, com snap de 5 min (clamp 0–1440). */
export function cursorMinute(clientX: number, trackLeft: number, px: number): number {
  return Math.min(1440, Math.max(0, snapMinutes(Math.round((clientX - trackLeft) / px))));
}

/** Posição de teste de um range sobre as linhas do dia (conflito + limites). */
export function blockRect(
  row: { startTime: string; endTime: string },
  px: number
): { left: number; width: number } {
  const start = toMin(row.startTime);
  const end = toMin(row.endTime);
  return { left: start * px, width: Math.max(MIN_DURATION * px * 0.9, (end - start) * px - 2) };
}

export { hasOverlap, MIN_DURATION, minutesToHHMM, snapMinutes, toMin } from "@antenna/core/schedule";
export const durLabel = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min - h * 60;
  return h ? (m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`) : `${m}min`;
};
