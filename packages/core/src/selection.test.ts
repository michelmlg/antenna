import { describe, expect, it } from "vitest";
import { orderPool, parseMixOverride, planSequence, scopeLabel, type GenrePools, type MediaRow, type MixScope } from "./selection";

function media(id: string, over: Partial<MediaRow> = {}): MediaRow {
  return {
    id,
    title: `Título ${id}`,
    description: "",
    url: `https://youtu.be/${id}`,
    duration: 600,
    source: "youtube",
    status: "ativo",
    originSourceId: null,
    resolvedId: id,
    channelTitle: "",
    views: null,
    uploadDate: null,
    thumbnailUrl: null,
    createdAt: new Date("2026-01-01"),
    ...over,
  } as MediaRow;
}

function pools(manual: MediaRow[], bySource: Record<string, MediaRow[]>): GenrePools {
  const sourcePools = new Map(Object.entries(bySource));
  const genrePool = [...manual, ...Object.values(bySource).flat()];
  return { manual, sourcePools, genrePool, rawPorFonte: {} };
}

const mix = (scope: MixScope, count: number, sourceId: string | null = null) => ({
  scope, count, sourceId, categoryName: null, order: 0,
});

describe("parseMixOverride", () => {
  it("lê JSON válido e clampa count", () => {
    const mix = parseMixOverride('[{"scope":"source","sourceId":"s1","count":99}]');
    expect(mix).toEqual([{ scope: "source", sourceId: "s1", categoryName: null, count: 10, order: 0 }]);
  });
  it("rejeita lixo", () => {
    expect(parseMixOverride("nope")).toBeNull();
    expect(parseMixOverride("[]")).toBeNull();
    expect(parseMixOverride(null)).toBeNull();
  });
});

describe("planSequence — mistura 3→2→1 (padrão do v1)", () => {
  it("respeita a ordem e contagens dos ingredientes", async () => {
    const manual = ["m1", "m2", "m3"].map((id) => media(id));
    const a = ["a1", "a2", "a3", "a4"].map((id) => media(id, { originSourceId: "sa" }));
    const b = ["b1"].map((id) => media(id, { originSourceId: "sb" }));
    const p = pools(manual, { sa: a, sb: b });

    const plan = await planSequence({
      pools: p,
      mix: [mix("links", 3), mix("source", 2, "sa"), mix("genre", 1)],
      recent: new Set(),
      forced: new Set(),
      ordering: "definida",
      playCounts: new Map(),
      count: 6,
    });

    expect(plan).toHaveLength(6);
    expect(plan.slice(0, 3).map((e) => e.media.id)).toEqual(["m1", "m2", "m3"]);
    expect(plan.slice(3, 5).map((e) => e.media.id)).toEqual(["a1", "a2"]);
    // escopo genre usa o pool inteiro (manual + fontes) na ordem natural:
    // m1..m3 já no plano → primeiro disponível é a3
    expect(plan[5].scope).toBe("genre");
    expect(plan[5].media.id).toBe("a3");
  });

  it("janela anti-repetição empurra para o próximo candidato", async () => {
    const a = ["a1", "a2"].map((id) => media(id));
    const p = pools([], { sa: a });
    const plan = await planSequence({
      pools: p,
      mix: [mix("source", 2, "sa")],
      recent: new Set(["a1"]),
      forced: new Set(),
      ordering: "definida",
      playCounts: new Map(),
      count: 2,
    });
    expect(plan.map((e) => e.media.id)).toEqual(["a2", "a1"]); // a1 só entra no nível 2
  });

  it("exclusão dura (no ar) nunca entra no plano, em nenhum nível", async () => {
    const a = ["a1", "a2"].map((id) => media(id));
    const p = pools([], { sa: a });
    const plan = await planSequence({
      pools: p,
      mix: [mix("source", 2, "sa")],
      recent: new Set(),
      forced: new Set(["a1"]),
      ordering: "definida",
      playCounts: new Map(),
      count: 2,
    });
    // a2 entra; a1 (no ar) é barrado nos 3 níveis → plano fica com só 1 item
    expect(plan.map((e) => e.media.id)).toEqual(["a2"]);
  });

  it("fonte vazia é pulada sem quebrar o ciclo", async () => {
    const a = ["a1"].map((id) => media(id));
    const p = pools([], { sa: a, svazia: [] });
    const plan = await planSequence({
      pools: p,
      mix: [mix("source", 2, "svazia"), mix("source", 1, "sa")],
      recent: new Set(),
      forced: new Set(),
      ordering: "definida",
      playCounts: new Map(),
      count: 3,
    });
    expect(plan).toHaveLength(1);
  });

  it("ordering menos_reproduzidos ordena pelo playCounts", async () => {
    const a = ["a1", "a2", "a3"].map((id) => media(id));
    const p = pools([], { sa: a });
    const plan = await planSequence({
      pools: p,
      mix: [mix("source", 3, "sa")],
      recent: new Set(),
      forced: new Set(),
      ordering: "menos_reproduzidos",
      playCounts: new Map([["a1", 9], ["a2", 1], ["a3", 4]]),
      count: 3,
    });
    expect(plan.map((e) => e.media.id)).toEqual(["a2", "a3", "a1"]);
  });

  it("pool esgotado devolve plano menor que o pedido (repetição só ocorre entre chamadas)", async () => {
    const a = ["a1", "a2"].map((id) => media(id));
    const p = pools([], { sa: a });
    const plan = await planSequence({
      pools: p,
      mix: [mix("source", 1, "sa")],
      recent: new Set(),
      forced: new Set(),
      ordering: "definida",
      playCounts: new Map(),
      count: 3,
    });
    // dentro de um mesmo plano ninguém repete; esgotou, devolve o que tem
    expect(plan.map((e) => e.media.id)).toEqual(["a1", "a2"]);
  });

  it("categoryLoader é consultado para escopo category", async () => {
    const c = ["c1"].map((id) => media(id));
    const plan = await planSequence({
      pools: pools([], {}),
      mix: [{ scope: "category", count: 1, sourceId: null, categoryName: "notícias", order: 0 }],
      recent: new Set(),
      forced: new Set(),
      ordering: "definida",
      playCounts: new Map(),
      count: 1,
      categoryLoader: async () => c,
    });
    expect(plan.map((e) => e.media.id)).toEqual(["c1"]);
  });
});

describe("orderPool / scopeLabel", () => {
  it("mais_antigos ordena por createdAt", () => {
    const list = [media("novo", { createdAt: new Date("2026-02-01") }), media("velho", { createdAt: new Date("2025-01-01") })];
    const out = orderPool(list, "mais_antigos", new Map());
    expect(out.map((m) => m.id)).toEqual(["velho", "novo"]);
  });

  it("scopeLabel rotula busca e canal", () => {
    const sources = new Map([
      ["s1", { type: "search", url: "", query: "Rocket League" }],
      ["s2", { type: "channel", url: "https://www.youtube.com/@FAGames1", query: "" }],
    ]);
    expect(scopeLabel(mix("source", 1, "s1"), sources)).toBe("🔍 Rocket League");
    expect(scopeLabel(mix("source", 1, "s2"), sources)).toBe("📺 @FAGames1");
    expect(scopeLabel(mix("genre", 1))).toBe("gênero");
  });
});
