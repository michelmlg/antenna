/**
 * Filtros avançados por fonte.
 *
 * Guardados em Source.filters (JSON em string — SQLite não tem tipo Json).
 * Aplicados em DOIS lugares, com a MESMA função:
 *   1) no sync (entrada):   entry do yt-dlp  {title, duration, view_count, timestamp, live_status}
 *   2) na seleção (composer): mídia já salva {title, duration, views, uploadDate}
 * Regra de ouro: dado faltando = PASSA (o filtro nunca derruba vídeo por
 * falta de informação — ex.: busca sem data continua útil).
 */
import type { SourceFilters } from "@antenna/shared";

const MAX_LIST = 8;

function toInt(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (v === "" || v === null || v === undefined || typeof v === "boolean" || !Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

function toList(v: unknown): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;]/);
  return arr
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_LIST);
}

/** Normaliza/valida um objeto vindo da API -> forma canônica (e segura). */
export function normalizeFilters(raw: unknown): SourceFilters {
  const f = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dateMode = ["any", "range", "older", "newer"].includes(String(f.dateMode))
    ? (String(f.dateMode) as SourceFilters["dateMode"])
    : "any";
  return {
    titleHas: toList(f.titleHas),
    titleLacks: toList(f.titleLacks),
    minDur: toInt(f.minDur, 1, 24 * 60),
    maxDur: toInt(f.maxDur, 1, 24 * 60),
    excludeShorts: !!f.excludeShorts,
    minViews: toInt(f.minViews, 0, 2_000_000_000),
    maxViews: toInt(f.maxViews, 0, 2_000_000_000),
    excludeLive: !!f.excludeLive,
    dateMode,
    yearFrom: toInt(f.yearFrom, 2005, 2100),
    yearTo: toInt(f.yearTo, 2005, 2100),
    olderYears: toInt(f.olderYears, 1, 80),
    newerMonths: toInt(f.newerMonths, 1, 600),
  };
}

/** string JSON (coluna Source.filters) -> objeto canônico */
export function parseFilters(value: string | null | undefined): SourceFilters {
  if (!value) return normalizeFilters(null);
  try {
    return normalizeFilters(JSON.parse(value));
  } catch {
    return normalizeFilters(null);
  }
}

export function hasDateFilter(f: SourceFilters | null | undefined): boolean {
  return !!f && !!f.dateMode && f.dateMode !== "any";
}

export function hasAnyFilter(f: SourceFilters | null | undefined): boolean {
  return !!f && !!(
    (f.titleHas && f.titleHas.length) ||
    (f.titleLacks && f.titleLacks.length) ||
    f.minDur || f.maxDur || f.excludeShorts ||
    f.minViews || f.maxViews || f.excludeLive ||
    hasDateFilter(f)
  );
}

/** aceita timestamp unix, Date, "20251207" ou ISO -> Date | null */
export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "" || v === "NA") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v > 1e10 ? v : v * 1000); // ms ou segundos
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) {
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface FilterableItem {
  title?: string | null;
  duration?: number | null;
  views?: number | null;
  view_count?: number | null;
  uploadDate?: unknown;
  timestamp?: unknown;
  liveStatus?: string | null;
  live_status?: string | null;
}

/**
 * O item passa no filtro? `item` = entry do yt-dlp OU mídia do banco (campos tolerantes).
 * Dado ausente/nulo = passa (regra de ouro acima).
 */
export function passes(item: FilterableItem | null | undefined, f: SourceFilters, now = Date.now()): boolean {
  if (!f || !hasAnyFilter(f)) return true;
  const it = item || {};
  const title = String(it.title || "").toLowerCase();
  const dur = Number(it.duration) || 0; // 0 = desconhecido
  const rawViews = it.views !== undefined && it.views !== null ? it.views : it.view_count;
  const views = Number.isFinite(Number(rawViews)) && rawViews !== null ? Number(rawViews) : null;
  const up = toDate(it.uploadDate !== undefined ? it.uploadDate : it.timestamp);
  const live = it.liveStatus || it.live_status || null;

  // "sem ao vivo": corta apenas transmissões em andamento; gravações passam
  if (f.excludeLive && live === "is_live") return false;
  if (f.titleHas && f.titleHas.length && !f.titleHas.some((t) => title.includes(t))) return false;
  if (f.titleLacks && f.titleLacks.length && f.titleLacks.some((t) => title.includes(t))) return false;
  if (f.excludeShorts && dur > 0 && dur < 60) return false;
  if (f.minDur && dur > 0 && dur < f.minDur * 60) return false;
  if (f.maxDur && dur > 0 && dur > f.maxDur * 60) return false;
  if (f.minViews && views !== null && views < f.minViews) return false;
  if (f.maxViews && views !== null && views > f.maxViews) return false;

  if (up) {
    if (f.dateMode === "range" && f.yearFrom && f.yearTo) {
      const y = up.getUTCFullYear();
      const lo = Math.min(f.yearFrom, f.yearTo);
      const hi = Math.max(f.yearFrom, f.yearTo);
      if (y < lo || y > hi) return false;
    }
    if (f.dateMode === "older" && f.olderYears) {
      const cut = now - f.olderYears * 365.25 * 864e5;
      if (up.getTime() > cut) return false;
    }
    if (f.dateMode === "newer" && f.newerMonths) {
      const cut = now - f.newerMonths * 30.44 * 864e5;
      if (up.getTime() < cut) return false;
    }
  }
  return true;
}

function fmtViews(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "k";
  return String(n);
}

/** chips legíveis p/ UI e logs: ["título: plantado", ">=5min", ...] */
export function summary(f: SourceFilters | null): string[] {
  if (!f || !hasAnyFilter(f)) return [];
  const out: string[] = [];
  if (f.titleHas && f.titleHas.length) out.push("título: " + f.titleHas.join("/"));
  if (f.titleLacks && f.titleLacks.length) out.push("não contém: " + f.titleLacks.join("/"));
  if (f.excludeShorts) out.push("sem shorts");
  if (f.minDur && f.maxDur) out.push(`${f.minDur}–${f.maxDur} min`);
  else if (f.minDur) out.push(`≥${f.minDur} min`);
  else if (f.maxDur) out.push(`≤${f.maxDur} min`);
  if (f.minViews) out.push(`≥${fmtViews(f.minViews)} views`);
  if (f.maxViews) out.push(`≤${fmtViews(f.maxViews)} views`);
  if (f.excludeLive) out.push("sem ao vivo");
  if (f.dateMode === "range" && f.yearFrom && f.yearTo)
    out.push(`${Math.min(f.yearFrom, f.yearTo)}–${Math.max(f.yearFrom, f.yearTo)}`);
  if (f.dateMode === "older" && f.olderYears) out.push(`antigo de ${f.olderYears}+ anos`);
  if (f.dateMode === "newer" && f.newerMonths) out.push(`últimos ${f.newerMonths} meses`);
  return out;
}
