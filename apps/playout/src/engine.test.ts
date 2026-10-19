import { describe, expect, it } from "vitest";
import { isFfmpegError, isInputDeath } from "./engine";

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
