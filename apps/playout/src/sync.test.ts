/** ytTarget — alvo da listagem yt-dlp por tipo de fonte (canal com busca incluído). */
import { describe, expect, it } from "vitest";
import { videoOnlyEntries, ytTarget } from "./sync";

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

describe("videoOnlyEntries", () => {
  const video = {
    _type: "url",
    ie_key: "Youtube",
    id: "aKq93vB1yxC",
    title: "video real",
    url: "https://www.youtube.com/watch?v=aKq93vB1yxC",
  };
  const playlistEntry = {
    _type: "playlist",
    ie_key: "YoutubeTab",
    id: "PLoABXeeErcuPLqVyvrqcrr8lvBwJcyv2_",
    title: "Videos de um canal inativo",
    url: "https://www.youtube.com/playlist?list=PLoABXeeErcuPLqVyvrqcrr8lvBwJcyv2_",
  };
  const nested = {
    _type: "playlist",
    title: "coleção",
    id: "UUxzC1vm_9wZ7F8YU1rRVu0g",
    entries: [video],
  };
  const channelEntry = {
    _type: "url",
    ie_key: "YoutubeTab",
    id: "UCxzC1vm_9wZ7F8YU1rRVu0g",
    title: "outro canal",
    url: "https://www.youtube.com/@canal2/videos",
  };

  it("mantém vídeos e conta pulados", () => {
    const { videos, skipped } = videoOnlyEntries([
      video,
      playlistEntry as unknown as Record<string, unknown>,
      nested as unknown as Record<string, unknown>,
      channelEntry as unknown as Record<string, unknown>,
    ]);
    expect(videos).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it("entry de vídeo sem id mas com url de véu passa", () => {
    const semId = { ...video, id: "" };
    const { videos, skipped } = videoOnlyEntries([semId]);
    expect(videos).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("video id muito curto/longo é descartado (não é vídeo de 11 chars)", () => {
    const { videos } = videoOnlyEntries([{ ...video, id: "IZqBrZgLpsk_extra" }]);
    expect(videos).toHaveLength(0);
  });
});
