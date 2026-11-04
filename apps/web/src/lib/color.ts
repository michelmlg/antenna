/**
 * Cor do gênero é DADO (escolhida pelo usuário), não token de tema — estes
 * helpers derivam tons dela de forma consistente.
 */

/** Cores sugeridas ao criar/editar gênero (o usuário ainda pode escolher outra). */
export const GENRE_PALETTE = [
  "#E8A33D",
  "#3FA66B",
  "#8BBF4A",
  "#2BB0A0",
  "#3AA0D8",
  "#8B7CF6",
  "#D46BB3",
  "#E05A5A",
  "#E07B39",
  "#8C9BB0",
] as const;

export const FALLBACK_GENRE_COLOR = "#8C9BB0";

function normalize(hex: string): string {
  const h = hex.replace("#", "").trim();
  if (h.length === 3)
    return h
      .split("")
      .map((c) => c + c)
      .join("");
  return h.slice(0, 6).padEnd(6, "0");
}

/** Mesma cor com opacidade (0–1) em notação #RRGGBBAA. */
export function alpha(hex: string | null | undefined, a: number): string {
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${normalize(hex || FALLBACK_GENRE_COLOR)}${aa}`;
}

/** Texto legível sobre um fundo sólido da cor (escuro em cores claras, branco nas escuras). */
export function readableOn(hex: string | null | undefined): string {
  const n = parseInt(normalize(hex || FALLBACK_GENRE_COLOR), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#10141B" : "#FFFFFF";
}
