/** Lê a personalização (logo) a cada item — mudança no painel vale no próximo vídeo. */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@antenna/database";
import { logoActive, logoFilter, normalizeLogo, type LogoSettings } from "@antenna/core";
import { config } from "./config";
import type { LogoOverlay } from "./engine";

export async function loadLogoOverlay(): Promise<LogoOverlay | null> {
  try {
    const row = await prisma.channelSettings.findUnique({ where: { id: 1 } });
    const raw = JSON.parse(row?.branding || "{}") as { logo?: Partial<LogoSettings> };
    const logo = normalizeLogo(raw.logo);
    if (!logoActive(logo) || !logo.file) return null;
    const file = path.join(config.brandingDir, path.basename(logo.file));
    if (!fs.existsSync(file)) {
      console.warn("[branding] logo ligado mas arquivo ausente:", file);
      return null;
    }
    return { path: file, filter: (idx) => logoFilter(logo, "0:v", idx) };
  } catch (err) {
    // personalização nunca derruba o canal: sem logo, segue no ar
    console.warn("[branding] ignorado:", err instanceof Error ? err.message : err);
    return null;
  }
}
