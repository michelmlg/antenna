import { describe, expect, it } from "vitest";
import { normalizeFilters, parseFilters, passes, summary, toDate } from "./filters";

const NEVER = new Date("2026-01-01T00:00:00Z").getTime();

describe("normalizeFilters", () => {
  it("retorna forma canônica com defaults", () => {
    const f = normalizeFilters({ minDur: "5", titleHas: "A, b;c" });
    expect(f.minDur).toBe(5);
    expect(f.titleHas).toEqual(["a", "b", "c"]);
    expect(f.dateMode).toBe("any");
    expect(f.excludeShorts).toBe(false);
  });

  it("limita listas e clamp inteiros", () => {
    const f = normalizeFilters({
      titleHas: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      minDur: 99999,
    });
    expect(f.titleHas).toHaveLength(8);
    expect(f.minDur).toBe(1440);
  });

  it("parseFilters tolera lixo", () => {
    expect(parseFilters("{quebrado")).toEqual(normalizeFilters(null));
    expect(parseFilters(null).dateMode).toBe("any");
  });
});

describe("passes — regra de ouro (dado faltando = passa)", () => {
  it("sem filtros: sempre passa", () => {
    expect(passes({}, normalizeFilters({}))).toBe(true);
  });

  it("duração desconhecida (0) não derruba", () => {
    const f = normalizeFilters({ minDur: 5 });
    expect(passes({ duration: 0 }, f)).toBe(true);
    expect(passes({ duration: 700 }, f)).toBe(true); // 11min ≥ 5min
    expect(passes({ duration: 100 }, f)).toBe(false);
  });

  it("views desconhecidas não derrubam", () => {
    const f = normalizeFilters({ minViews: 1000 });
    expect(passes({ views: null }, f)).toBe(true);
    expect(passes({ view_count: 5000 }, f)).toBe(true);
    expect(passes({ view_count: 10 }, f)).toBe(false);
  });

  it("título contém/não contém (case-insensitive)", () => {
    const f = normalizeFilters({ titleHas: "plantado", titleLacks: "shorts" });
    expect(passes({ title: "Como PLANTADO em casa" }, f)).toBe(true);
    expect(passes({ title: "outro assunto" }, f)).toBe(false);
    expect(passes({ title: "plantado - SHORTS" }, f)).toBe(false);
  });

  it("excludeShorts corta < 60s", () => {
    const f = normalizeFilters({ excludeShorts: true });
    expect(passes({ duration: 59 }, f)).toBe(false);
    expect(passes({ duration: 60 }, f)).toBe(true);
    expect(passes({ duration: 0 }, f)).toBe(true);
  });

  it("excludeLive corta lives em andamento, não gravações", () => {
    const f = normalizeFilters({ excludeLive: true });
    expect(passes({ live_status: "is_live" }, f)).toBe(false);
    expect(passes({ live_status: "was_live" }, f)).toBe(true);
    expect(passes({ live_status: "not_live" }, f)).toBe(true);
    expect(passes({}, f)).toBe(true);
  });

  it("faixa de ano com uploadDate ISO/Date/timestamp", () => {
    const f = normalizeFilters({ dateMode: "range", yearFrom: 2015, yearTo: 2020 });
    expect(passes({ uploadDate: "20170510" }, f, NEVER)).toBe(true);
    expect(passes({ uploadDate: new Date("2019-01-01") }, f, NEVER)).toBe(true);
    expect(passes({ uploadDate: 1500000000 }, f, NEVER)).toBe(true); // 2017 (segundos)
    expect(passes({ uploadDate: "20230101" }, f, NEVER)).toBe(false);
  });

  it("older/newer em meses/anos", () => {
    const older = normalizeFilters({ dateMode: "older", olderYears: 5 });
    expect(passes({ uploadDate: "20100101" }, older, NEVER)).toBe(true);
    expect(passes({ uploadDate: "20250101" }, older, NEVER)).toBe(false);
    const newer = normalizeFilters({ dateMode: "newer", newerMonths: 6 });
    expect(passes({ uploadDate: new Date(NEVER - 30 * 864e5) }, newer, NEVER)).toBe(true);
    expect(passes({ uploadDate: new Date(NEVER - 300 * 864e5) }, newer, NEVER)).toBe(false);
  });

  it("data faltando não derruba (busca sem data continua útil)", () => {
    const f = normalizeFilters({ dateMode: "older", olderYears: 5 });
    expect(passes({}, f, NEVER)).toBe(true);
  });
});

describe("passes — matriz completa de filtros de conteúdo", () => {
  it("titleHas: qualquer um dos termos (OR), case-insensitive", () => {
    const f = normalizeFilters({ titleHas: "SORTILÉGIO, aquascape" });
    expect(passes({ title: "Como fazer AQUASCAPE" }, f)).toBe(true); // 2º termo
    expect(passes({ title: "A SORTILÉGIO" }, f)).toBe(true); // 1º termo
    expect(passes({ title: "nada relacionado" }, f)).toBe(false);
  });

  it("titleLacks: qualquer termo presente descarta", () => {
    const f = normalizeFilters({ titleLacks: "shorts,直播" });
    expect(passes({ title: "Vlog normal" }, f)).toBe(true);
    expect(passes({ title: "reação a SHORTS" }, f)).toBe(false);
    expect(passes({ title: "tem 直播 aqui" }, f)).toBe(false); // 2º termo também corta
  });

  it("duração precisa ficar na banda [min, max]", () => {
    const f = normalizeFilters({ minDur: 5, maxDur: 20 });
    expect(passes({ duration: 5 * 60 }, f)).toBe(true); // limite inclusivo
    expect(passes({ duration: 20 * 60 }, f)).toBe(true); // limite inclusivo
    expect(passes({ duration: 4 * 60 + 59 }, f)).toBe(false);
    expect(passes({ duration: 20 * 60 + 1 }, f)).toBe(false);
    expect(passes({ duration: 0 }, f)).toBe(true); // desconhecida passa por cima de ambos
  });

  it("maxViews corta acima do teto", () => {
    const f = normalizeFilters({ maxViews: 1000 });
    expect(passes({ view_count: 1000 }, f)).toBe(true); // limite inclusivo
    expect(passes({ view_count: 1001 }, f)).toBe(false);
    expect(passes({ views: null }, f)).toBe(true); // desconhecida passa
  });

  it("faixa de anos funciona com os extremos trocados", () => {
    const f = normalizeFilters({ dateMode: "range", yearFrom: 2020, yearTo: 2015 });
    expect(passes({ uploadDate: "20170510" }, f, NEVER)).toBe(true);
    expect(passes({ uploadDate: "20130101" }, f, NEVER)).toBe(false);
    expect(passes({ uploadDate: "20240101" }, f, NEVER)).toBe(false);
  });

  it("older corta exatamente no dia do corte", () => {
    const f = normalizeFilters({ dateMode: "older", olderYears: 1 });
    const cut = NEVER - 365.25 * 864e5;
    expect(passes({ uploadDate: new Date(cut) }, f, NEVER)).toBe(true); // no corte = antigo o bastante
    expect(passes({ uploadDate: new Date(cut + 864e5) }, f, NEVER)).toBe(false);
  });

  it("filtros combinam com AND", () => {
    const f = normalizeFilters({ titleHas: "plantado", minDur: 5, excludeShorts: true });
    expect(passes({ title: "como PLANTAROR título: plantado", duration: 10 * 60 }, f)).toBe(true);
    expect(passes({ title: "outro", duration: 10 * 60 }, f)).toBe(false); // falha só no título
    expect(passes({ title: "plantado", duration: 10 * 60 }, f)).toBe(true);
    expect(passes({ title: "plantado", duration: 10 * 60, live_status: "is_live" }, f)).toBe(true); // sem excludeLive, live passa
  });
});

describe("summary", () => {
  it("chips legíveis", () => {
    const chips = summary(normalizeFilters({ titleHas: "abc", minDur: 5, excludeShorts: true }));
    expect(chips).toEqual(["título: abc", "sem shorts", "≥5 min"]);
    expect(summary(null)).toEqual([]);
  });
});

describe("toDate", () => {
  it("aceita 20251207, unix (s/ms), Date e ISO", () => {
    expect(toDate("20251207")?.getUTCMonth()).toBe(11);
    expect(toDate(1500000000)?.getUTCFullYear()).toBe(2017);
    expect(toDate(1700000000000)?.getUTCFullYear()).toBe(2023);
    expect(toDate("NA")).toBeNull();
    expect(toDate("")).toBeNull();
  });
});
