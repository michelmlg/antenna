/** ytTarget — alvo da listagem yt-dlp por tipo de fonte (canal com busca incluído). */
import { describe, expect, it } from "vitest";
import { ytTarget } from "./sync";

const base = { sort: "recent", limit: 12 };

describe("ytTarget", () => {
  it("canal simples -> aba /videos", () => {
    expect(
      ytTarget({ type: "channel", url: "https://www.youtube.com/@canal", query: "", ...base }),
    ).toBe("https://www.youtube.com/@canal/videos");
  });

  it("canal com query -> aba de busca do canal (mesmo alvo do channelSearch)", () => {
    const alvo = ytTarget({
      type: "channel",
      url: "https://www.youtube.com/@canal/videos",
      query: "rocket league",
      ...base,
    });
    expect(alvo).toBe("https://www.youtube.com/@canal/search?query=rocket%20league");
    expect(alvo).toBe(
      ytTarget({
        type: "channelSearch",
        url: "https://www.youtube.com/@canal/videos",
        query: "rocket league",
        ...base,
      }),
    );
  });

  it("busca global embute o limite (ytsearchN)", () => {
    expect(ytTarget({ type: "search", url: "", query: "smite", ...base })).toBe("ytsearch12:smite");
  });

  it("canal apenas com espaços na query é tratado como sem busca", () => {
    expect(
      ytTarget({ type: "channel", url: "https://www.youtube.com/@canal", query: "   ", ...base }),
    ).toBe("https://www.youtube.com/@canal/videos");
  });
});
