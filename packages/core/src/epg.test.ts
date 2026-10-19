import { describe, expect, it } from "vitest";
import { epgXmltv, xmltvStamp } from "./epg";

// 19/10/2026 é segunda-feira (dayOfWeek 1), TZ do servidor: America/Sao_Paulo (-0300)
const NOW = new Date(2026, 9, 19, 15, 0, 0, 0);
const AUTO = "Programação automática";

const prog = (name: string, genre?: string) => ({ name, genre: genre ? { name: genre } : null });

describe("xmltvStamp", () => {
  it("formata AAAAMMDDHHMMSS com offset local", () => {
    expect(xmltvStamp(new Date(2026, 9, 19, 14, 0, 0))).toBe("20261019140000 -0300");
  });
});

describe("epgXmltv", () => {
  const base = { channel: { id: "antenna.br", name: "Antenna" }, now: NOW };

  it("emite o bloco da grade com title/category e preenche o resto do dia com automática", () => {
    const xml = epgXmltv({
      ...base,
      blocks: [{ dayOfWeek: 1, startTime: "14:00", endTime: "16:00", program: prog("Podcasts", "Fala") }],
    });
    expect(xml).toContain(`start="20261019140000 -0300" stop="20261019160000 -0300" channel="antenna.br"`);
    expect(xml).toContain("<title>Podcasts</title>");
    expect(xml).toContain("<category>Fala</category>");
    // buracos: 00:00–14:00 e 16:00–(00:00 do dia seguinte)
    expect(xml).toContain(`<title>${AUTO}</title>`);
    expect(xml).toContain(`start="20261019160000 -0300" stop="20261020000000 -0300"`);
    // canal com o id que casa com o tvg-id do M3U
    expect(xml).toContain(`<channel id="antenna.br">`);
  });

  it("ignora bloco com end <= start (nunca vai pro ar — paridade com currentBlock)", () => {
    const xml = epgXmltv({
      ...base,
      blocks: [{ dayOfWeek: 1, startTime: "16:00", endTime: "15:00", program: prog("Fantasma") }],
    });
    expect(xml).not.toContain("Fantasma");
  });

  it("escapa XML em títulos com caracteres especiais", () => {
    const xml = epgXmltv({
      ...base,
      blocks: [{ dayOfWeek: 1, startTime: "14:00", endTime: "15:00", program: prog(`Caça & "Peça" <HD>`) }],
    });
    expect(xml).toContain(`<title>Caça &amp; &quot;Peça&quot; &lt;HD&gt;</title>`);
  });

  it("janela ±dias inclui blocos de dias vizinhos e mantém cobertura contínua", () => {
    const xml = epgXmltv({
      ...base,
      blocks: [
        { dayOfWeek: 2, startTime: "08:00", endTime: "09:00", program: prog("Terça") },
        { dayOfWeek: 0, startTime: "08:00", endTime: "09:00", program: prog("Domingo") },
      ],
      daysBack: 1,
      daysForward: 3,
    });
    expect(xml).toContain("<title>Terça</title>");
    expect(xml).toContain("<title>Domingo</title>");
    // cobertura contínua: nenhuma lacuna — cada stop == start do próximo
    // (carimbos XMLTV trazem " -0300" dentro das aspas — capturar até a aspa)
    const stamps = [...xml.matchAll(/start="([^"]+)" stop="([^"]+)"/g)].map((m) => [m[1]!, m[2]!] as const);
    expect(stamps.length).toBeGreaterThan(4);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]![0]).toBe(stamps[i - 1]![1]);
  });

  it("sem grade nenhuma → só programação automática cobrindo a janela", () => {
    const xml = epgXmltv({ ...base, blocks: [], daysBack: 1, daysForward: 3 });
    const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]);
    expect(titles.every((t) => t === AUTO)).toBe(true);
  });
});
