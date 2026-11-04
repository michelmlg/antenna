import { describe, expect, it } from "vitest";
import {
  backoffMs,
  blamesMedia,
  classifyFfmpegLine,
  clearMediaFailure,
  describeResolveError,
  errorResult,
  isQuarantined,
  pruneQuarantine,
  recordMediaFailure,
  sinkStatus,
  type FailureRecord,
} from "./failures";
import { parseHistoryResult } from "@antenna/shared";

// Linhas REAIS dos logs de produção (26/10/2026)
const FORBIDDEN = "[in#0 @ 0x57e0137c4840] Error opening input: Server returned 403 Forbidden (access denied)";
const HTTP403 = "[https @ 0x57e0137c5780] HTTP error 403 Forbidden";
const DNS_SINK = "[tcp @ 0x750280f0c340] Failed to resolve hostname mediamtx: Temporary failure in name resolution";
const DNS_SINK2 = "[tcp @ 0x77e18cf0c340] Failed to resolve hostname mediamtx: Name or service not known";
const NO_HEADER = "[out#0/rtsp @ 0x62234b20f840] Could not write header (incorrect codec parameters ?): Input/output error";
const CONSUMERS = "[fc#0 @ 0x62234afef4c0] Error sending frames to consumers: Input/output error";
const DEMUX = "[in#1/matroska,webm @ 0x566cf10930c0] Error during demuxing: Input/output error";

describe("classifyFfmpegLine", () => {
  it("403 do googlevideo é falha da fonte", () => {
    expect(classifyFfmpegLine(FORBIDDEN)).toBe("source_forbidden");
    expect(classifyFfmpegLine(HTTP403)).toBe("source_forbidden");
  });

  it("DNS/saída do mediamtx é falha de infra, não do vídeo", () => {
    expect(classifyFfmpegLine(DNS_SINK, { sinkHost: "mediamtx" })).toBe("sink_unreachable");
    expect(classifyFfmpegLine(DNS_SINK2, { sinkHost: "mediamtx" })).toBe("sink_unreachable");
    expect(classifyFfmpegLine(NO_HEADER)).toBe("sink_unreachable");
    expect(classifyFfmpegLine(CONSUMERS)).toBe("sink_unreachable");
  });

  it("DNS de outro host (input) não acusa o mediamtx", () => {
    const line = "[tcp @ 0x1] Failed to resolve hostname rr2---sn-8p8v.googlevideo.com: Name or service not known";
    expect(classifyFfmpegLine(line, { sinkHost: "mediamtx" })).toBe("source_unresolvable");
  });

  it("morte de input continua sendo input_died", () => {
    expect(classifyFfmpegLine(DEMUX)).toBe("input_died");
  });

  it("avisos transitórios e progresso não são falha", () => {
    expect(classifyFfmpegLine("[in#1/matroska,webm @ 0x5b2161ddc180] Read error")).toBeNull();
    expect(classifyFfmpegLine("[https @ 0x590f90e0ab00] Stream ends prematurely at 14466976")).toBeNull();
    expect(classifyFfmpegLine("frame= 1234 fps=30 q=28.0 size= 45678kB")).toBeNull();
    expect(classifyFfmpegLine("")).toBeNull();
  });
});

describe("describeResolveError", () => {
  it("traduz as causas comuns do yt-dlp", () => {
    expect(describeResolveError("ERROR: Sign in to confirm you're not a bot")).toMatch(/anti-bot/);
    expect(describeResolveError("yt-dlp: Video unavailable")).toBe("vídeo indisponível");
    expect(describeResolveError("Private video")).toBe("vídeo privado");
    expect(describeResolveError("yt-dlp: Command failed: ETIMEDOUT")).toBe("yt-dlp demorou demais");
    expect(describeResolveError("???")).toBe("yt-dlp falhou");
  });
});

describe("backoffMs", () => {
  it("dobra a cada tentativa e respeita o teto", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffMs(n))).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
    expect(backoffMs(0)).toBe(3000);
  });
});

describe("culpa e histórico", () => {
  it("só falha do vídeo conta como culpa do vídeo", () => {
    expect(blamesMedia("source_forbidden")).toBe(true);
    expect(blamesMedia("source_unresolvable")).toBe(true);
    expect(blamesMedia("input_died")).toBe(true);
    expect(blamesMedia("sink_unreachable")).toBe(false);
    expect(blamesMedia("unknown")).toBe(false);
  });

  it("errorResult e parseHistoryResult fazem ida e volta; 'error' legado segue válido", () => {
    expect(parseHistoryResult(errorResult("source_forbidden"))).toEqual({ base: "error", kind: "source_forbidden" });
    expect(parseHistoryResult("error")).toEqual({ base: "error", kind: null });
    expect(parseHistoryResult("success")).toEqual({ base: "success", kind: null });
    expect(parseHistoryResult("error:algo_novo").kind).toBe("unknown");
  });
});

describe("quarentena", () => {
  const H = 3600_000;
  it("entra na 3ª falha e sai depois do TTL", () => {
    const map = new Map<string, FailureRecord>();
    expect(recordMediaFailure(map, "a", "source_forbidden", 0).until).toBe(0);
    expect(recordMediaFailure(map, "a", "source_forbidden", 1 * H).until).toBe(0);
    const third = recordMediaFailure(map, "a", "source_forbidden", 2 * H);
    expect(third.count).toBe(3);
    expect(isQuarantined(map, "a", 3 * H)).toBe(true);
    expect(isQuarantined(map, "a", 2 * H + 24 * H + 1)).toBe(false);
    pruneQuarantine(map, 2 * H + 24 * H + 1);
    expect(map.has("a")).toBe(false);
  });

  it("contagem velha (sem falhas por 24h) recomeça; sucesso zera", () => {
    const map = new Map<string, FailureRecord>();
    recordMediaFailure(map, "a", "input_died", 0);
    recordMediaFailure(map, "a", "input_died", 1 * H);
    expect(recordMediaFailure(map, "a", "input_died", 30 * H).count).toBe(1);
    expect(clearMediaFailure(map, "a")).toBe(true);
    expect(isQuarantined(map, "a", 31 * H)).toBe(false);
  });
});

describe("sinkStatus", () => {
  it("ok -> degraded -> blocked no 3º erro seguido", () => {
    expect([0, 1, 2, 3, 9].map(sinkStatus)).toEqual(["ok", "degraded", "degraded", "blocked", "blocked"]);
  });
});
