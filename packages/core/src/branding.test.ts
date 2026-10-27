import { describe, expect, it } from "vitest";
import { DEFAULT_LOGO, logoActive, logoBox, logoFilter, normalizeLogo } from "./branding";

describe("normalizeLogo", () => {
  it("aplica padrões e limites", () => {
    const l = normalizeLogo({ scale: 99, margin: -4, opacity: 0, corner: "meio" as never });
    expect(l.scale).toBe(30);
    expect(l.margin).toBe(0);
    expect(l.opacity).toBe(10);
    expect(l.corner).toBe("top-right");
  });

  it("vazio = padrão desligado", () => {
    expect(normalizeLogo(null)).toEqual(DEFAULT_LOGO);
  });
});

describe("logoActive", () => {
  it("exige ligado e arquivo", () => {
    expect(logoActive({ ...DEFAULT_LOGO, enabled: true })).toBe(false);
    expect(logoActive({ ...DEFAULT_LOGO, enabled: true, file: "logo.png" })).toBe(true);
    expect(logoActive({ ...DEFAULT_LOGO, file: "logo.png" })).toBe(false);
  });
});

describe("logoBox", () => {
  it("canto superior direito com margem igual em px nos dois eixos", () => {
    const b = logoBox({ ...DEFAULT_LOGO, scale: 10, margin: 2, corner: "top-right" }, 16 / 9, 2);
    expect(b.width).toBeCloseTo(0.1);
    expect(b.left).toBeCloseTo(0.88);
    // 2% da largura = 2% * 16/9 da altura
    expect(b.top).toBeCloseTo(0.02 * (16 / 9));
    // altura do logo: 10% de 1920 = 192px / aspecto 2 = 96px → 96/1080
    expect(b.height).toBeCloseTo(96 / 1080);
  });

  it("canto inferior esquerdo", () => {
    const b = logoBox({ ...DEFAULT_LOGO, scale: 10, margin: 0, corner: "bottom-left" }, 16 / 9, 1);
    expect(b.left).toBe(0);
    expect(b.top + b.height).toBeCloseTo(1);
  });
});

describe("logoFilter", () => {
  it("monta o grafo com escala relativa, opacidade e posição do canto", () => {
    const f = logoFilter({
      ...DEFAULT_LOGO,
      scale: 12,
      margin: 3,
      opacity: 80,
      corner: "bottom-left",
    });
    expect(f).toBe(
      "[0:v]split[base][ref];" +
        "[2:v]format=rgba,colorchannelmixer=aa=0.8[lg];" +
        "[lg][ref]scale=w=rw*0.12:h=-1[lgs];" +
        "[base][lgs]overlay=x=W*0.03:y=H-h-W*0.03:shortest=1[vout]",
    );
  });

  it("canto direito usa W-w", () => {
    expect(logoFilter({ ...DEFAULT_LOGO, corner: "top-right" }, "0:v", 1)).toContain(
      "overlay=x=W-w-W*0.03:y=W*0.03",
    );
  });
});
