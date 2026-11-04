import { describe, expect, it } from "vitest";
import { buildFfmpegArgs, isFfmpegError, isInputDeath } from "./engine";

// Linhas REAIS dos logs de produção (19/10/2026) — bug: vídeo rodando com áudio
// dessincronizado/errado porque o input de áudio morre e o ffmpeg não é cortado.
const AUDIO_DEATH = "[in#1/matroska,webm @ 0x566cf10930c0] Error during demuxing: Input/output error";
const VIDEO_DEATH = "[in#0/matroska,webm @ 0x566cf10930c0] Error during demuxing: Input/output error";

describe("isInputDeath", () => {
  it("detecta morte terminal de input (áudio e vídeo)", () => {
    expect(isInputDeath(AUDIO_DEATH)).toBe(true);
    expect(isInputDeath(VIDEO_DEATH)).toBe(true);
  });

  it("ignora avisos transitórios que o retry de Range recupera", () => {
    expect(isInputDeath("[in#1/matroska,webm @ 0x5b2161ddc180] Read error")).toBe(false);
    expect(
      isInputDeath("[https @ 0x590f90e0ab00] Stream ends prematurely at 14466976, should be 15150235")
    ).toBe(false);
    expect(isInputDeath("[tls @ 0x590f90f861c0] IO error: End of file")).toBe(false);
    expect(
      isInputDeath("[vist#0:0/h264 @ 0x63f95a09c040] Resumed reading at pts 0.517 with rate 1.050 after a lag of 0.357s")
    ).toBe(false);
  });

  it("ignora linhas que não são do demuxer de input", () => {
    expect(isInputDeath("")).toBe(false);
    expect(isInputDeath("frame= 1234 fps=30 q=28.0 size= 45678kB")).toBe(false);
    expect(isInputDeath("[out#0/rtp] Could not write header")).toBe(false);
  });

  it("a morte de input também é erro real do stderr (vira lastError do painel)", () => {
    expect(isFfmpegError(AUDIO_DEATH)).toBe(true);
  });
});

describe("buildFfmpegArgs", () => {
  const yt = ["https://v.example/video", "https://v.example/audio"];

  it("sem logo: mapeia vídeo+áudio e mantém copy para h264 local", () => {
    const local = buildFfmpegArgs(["/media/a.mp4"], "h264");
    expect(local).toContain("copy");
    expect(local).not.toContain("-filter_complex");
    const two = buildFfmpegArgs(yt, null);
    expect(two.join(" ")).toContain("-map 0:v:0 -map 1:a:0");
  });

  it("com logo: input extra em loop, grafo com o índice certo e transcodifica", () => {
    const args = buildFfmpegArgs(yt, "h264", { path: "/app/data/branding/logo.png", filter: (i) => `F${i}` });
    const s = args.join(" ");
    expect(s).toContain("-loop 1 -i /app/data/branding/logo.png");
    expect(s).toContain("-filter_complex F2 -map [vout] -map 1:a:0");
    expect(args).not.toContain("copy");
    expect(args).toContain("libx264");
  });

  it("com logo e arquivo local único: áudio opcional do input 0", () => {
    const s = buildFfmpegArgs(["/media/a.mp4"], null, { path: "/l.png", filter: (i) => `F${i}` }).join(" ");
    expect(s).toContain("-filter_complex F1 -map [vout] -map 0:a?");
  });
});

describe("buildFfmpegArgs — retomada", () => {
  it("busca o mesmo ponto em vídeo e áudio (antes de cada -i), sem afetar o logo", () => {
    const s = buildFfmpegArgs(["v", "a"], null, { path: "/l.png", filter: (i) => `F${i}` }, 754.8).join(" ");
    expect(s).toContain("-ss 754 -stream_loop -1 -i v -ss 754 -stream_loop -1 -i a -loop 1 -i /l.png");
  });

  it("sem retomada não adiciona -ss", () => {
    expect(buildFfmpegArgs(["v"], null)).not.toContain("-ss");
  });
});
