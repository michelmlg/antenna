import { describe, expect, it } from "vitest";
import { blocksStartingWithin, currentBlock, hasOverlap, MIN_DURATION, minutesToHHMM, snapMinutes, type ScheduleRow } from "./schedule";

function row(dayOfWeek: number, startTime: string, endTime: string, genreId = "g1"): ScheduleRow {
  return {
    id: `${dayOfWeek}-${startTime}`,
    programId: "p1",
    dayOfWeek,
    startTime,
    endTime,
    program: { id: "p1", name: "Prog", genreId, description: "", targetDuration: 0, openUrl: null, closeUrl: null, status: "active", mixOverride: null, createdAt: new Date(), genre: null },
  } as unknown as ScheduleRow;
}

const MON_0900_1200 = row(1, "09:00", "12:00");

describe("currentBlock", () => {
  it("acha o bloco quando está dentro", () => {
    const now = new Date("2026-01-05T10:30:00"); // segunda
    expect(currentBlock([MON_0900_1200], now)?.startTime).toBe("09:00");
  });

  it("não acha fora do horário nem fora do dia", () => {
    expect(currentBlock([MON_0900_1200], new Date("2026-01-05T13:00:00"))).toBeNull();
    expect(currentBlock([MON_0900_1200], new Date("2026-01-06T10:00:00"))).toBeNull(); // terça
  });

  it("limite: começa no startTime e termina no endTime", () => {
    expect(currentBlock([MON_0900_1200], new Date("2026-01-05T09:00:00"))).not.toBeNull();
    expect(currentBlock([MON_0900_1200], new Date("2026-01-05T12:00:00"))).toBeNull();
  });
});

describe("blocksStartingWithin (pre-warm)", () => {
  const rows = [MON_0900_1200, row(2, "00:30", "02:00", "g2")];

  it("pega bloco começando em breve", () => {
    const now = new Date("2026-01-05T08:50:00"); // falta 10min
    expect(blocksStartingWithin(rows, 15, now)).toEqual(["g1"]);
    expect(blocksStartingWithin(rows, 5, now)).toEqual([]);
  });

  it("trata virada do dia (bloco 00:30 de terça visto às 23:50 de segunda)", () => {
    const now = new Date("2026-01-05T23:50:00");
    expect(blocksStartingWithin(rows, 45, now)).toEqual(["g2"]);
  });
});

describe("hasOverlap / minutesToHHMM / snapMinutes", () => {
  const rows = [MON_0900_1200, row(2, "08:00", "10:00", "g2")];

  it("detecta sobreposição no mesmo dia", () => {
    expect(hasOverlap(rows, 1, 300, 720)).toBe(true); // 05:00–12:00 pega 09–12
    expect(hasOverlap(rows, 1, 720, 900)).toBe(false); // 12:00–15:00 encosta na borda
    expect(hasOverlap(rows, 1, 0, 540, "1-09:00")).toBe(false); // exclui a própria linha
    expect(hasOverlap(rows, 2, 480, 600)).toBe(true);
    expect(hasOverlap(rows, 2, 600, 700)).toBe(false);
  });

  it("converte minutos ↔ HH:MM com clamp de 24h", () => {
    expect(minutesToHHMM(540)).toBe("09:00");
    expect(minutesToHHMM(1440)).toBe("24:00");
    expect(minutesToHHMM(1500)).toBe("24:00");
    expect(minutesToHHMM(-3)).toBe("00:00");
  });

  it("snap em grid de 5 min", () => {
    expect(snapMinutes(502)).toBe(500);
    expect(snapMinutes(497)).toBe(495);
    expect(MIN_DURATION).toBe(5);
  });
});
