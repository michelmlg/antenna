/**
 * Personalização da transmissão: logo sobreposto ao sinal.
 * A MESMA geometria alimenta o filtro do FFmpeg (playout) e a prévia do painel
 * — o que aparece na prévia é o que vai ao ar.
 */

import { LOGO_CORNERS } from "@antenna/shared";

export type LogoCorner = (typeof LOGO_CORNERS)[number];

export interface LogoSettings {
  enabled: boolean;
  /** nome do arquivo em data/branding (null = sem logo enviado) */
  file: string | null;
  corner: LogoCorner;
  /** largura do logo em % da largura do vídeo */
  scale: number;
  /** distância do canto em % da largura do vídeo (mesma margem nos dois eixos) */
  margin: number;
  /** 0–100 */
  opacity: number;
}

export const LOGO_LIMITS = {
  scale: { min: 3, max: 30 },
  margin: { min: 0, max: 10 },
  opacity: { min: 10, max: 100 },
} as const;

export const DEFAULT_LOGO: LogoSettings = {
  enabled: false,
  file: null,
  corner: "top-right",
  scale: 12,
  margin: 3,
  opacity: 85,
};

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

/** Normaliza valores vindos do banco/requisição (limites e canto válido). */
export function normalizeLogo(raw: Partial<LogoSettings> | null | undefined): LogoSettings {
  const r = { ...DEFAULT_LOGO, ...(raw ?? {}) };
  return {
    enabled: !!r.enabled,
    file: r.file || null,
    corner: LOGO_CORNERS.includes(r.corner) ? r.corner : DEFAULT_LOGO.corner,
    scale: clamp(Number(r.scale), LOGO_LIMITS.scale.min, LOGO_LIMITS.scale.max),
    margin: clamp(Number(r.margin), LOGO_LIMITS.margin.min, LOGO_LIMITS.margin.max),
    opacity: clamp(Number(r.opacity), LOGO_LIMITS.opacity.min, LOGO_LIMITS.opacity.max),
  };
}

/** O logo vai ao ar? (ligado E com arquivo enviado) */
export const logoActive = (l: LogoSettings): boolean => l.enabled && !!l.file;

/**
 * Caixa do logo em frações (0–1) do vídeo — para a prévia em CSS.
 * `logoAspect` = largura/altura do logo.
 */
export function logoBox(l: LogoSettings, videoAspect: number, logoAspect: number) {
  const w = l.scale / 100;
  const h = (w * videoAspect) / logoAspect; // em fração da ALTURA do vídeo
  const mx = l.margin / 100;
  const my = mx * videoAspect; // mesma margem em pixels nos dois eixos
  const right = l.corner.endsWith("right");
  const bottom = l.corner.startsWith("bottom");
  return {
    left: right ? 1 - w - mx : mx,
    top: bottom ? 1 - h - my : my,
    width: w,
    height: h,
  };
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * Trecho de -filter_complex que sobrepõe o logo (input `logoInput`) ao vídeo
 * `videoIn`, saindo em [vout]. Escala relativa à largura do vídeo (scale com
 * input de referência: funciona em 720p ou 1080p sem sondar o tamanho).
 */
export function logoFilter(l: LogoSettings, videoIn = "0:v", logoInput = 2): string {
  const s = fmt(l.scale / 100);
  const m = fmt(l.margin / 100);
  const a = fmt(l.opacity / 100);
  const x = l.corner.endsWith("right") ? `W-w-W*${m}` : `W*${m}`;
  const y = l.corner.startsWith("bottom") ? `H-h-W*${m}` : `W*${m}`;
  return [
    `[${videoIn}]split[base][ref]`,
    `[${logoInput}:v]format=rgba,colorchannelmixer=aa=${a}[lg]`,
    `[lg][ref]scale=w=rw*${s}:h=-1[lgs]`,
    `[base][lgs]overlay=x=${x}:y=${y}:shortest=1[vout]`,
  ].join(";");
}
