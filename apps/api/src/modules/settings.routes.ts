/**
 * Personalização do canal — logo sobreposto ao sinal.
 * Configuração na linha única channel_settings (JSON validado); o arquivo do
 * logo fica em data/branding (o playout lê de lá ao subir cada item).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { prisma } from "@antenna/database";
import { normalizeLogo, type LogoSettings } from "@antenna/core";
import { logoSettingsUpdateSchema, logoUploadSchema } from "@antenna/shared";
import { config } from "../config";
import { auth } from "../lib/auth";
import { HttpError, wrap } from "../lib/http";
import { logger } from "../lib/logger";
import { worker } from "../lib/worker";

export const settingsRoutes = Router();

const MAX_BYTES = 5 * 1024 * 1024;

async function readLogo(): Promise<{ logo: LogoSettings; updatedAt: Date | null }> {
  const row = await prisma.channelSettings.findUnique({ where: { id: 1 } });
  let raw: { logo?: Partial<LogoSettings> } = {};
  try {
    raw = JSON.parse(row?.branding || "{}");
  } catch {
    /* JSON corrompido → padrão */
  }
  return { logo: normalizeLogo(raw.logo), updatedAt: row?.updatedAt ?? null };
}

async function writeLogo(logo: LogoSettings) {
  const branding = JSON.stringify({ logo });
  await prisma.channelSettings.upsert({
    where: { id: 1 },
    create: { id: 1, branding },
    update: { branding },
  });
}

/** Tipo pela assinatura do arquivo (não confia na extensão nem no MIME do cliente). */
function sniff(buf: Buffer): "png" | "webp" | null {
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

async function removeFile(file: string | null) {
  if (!file) return;
  await fs.rm(path.join(config.brandingDir, path.basename(file)), { force: true });
}

/** Aplica na hora: o worker reinicia o item atual no mesmo ponto. Falha não bloqueia o salvar. */
async function applyNow(): Promise<boolean> {
  try {
    const r = await worker.post<{ refreshed: boolean }>("/cmd/refresh-branding", {}, 60000);
    return !!r.refreshed;
  } catch (err) {
    logger.warn({ err }, "[branding] worker não aplicou agora (vale no próximo item)");
    return false;
  }
}

async function payload() {
  const { logo, updatedAt } = await readLogo();
  return {
    logo,
    // ?v= quebra o cache do navegador quando o logo muda
    logoUrl: logo.file
      ? `/api/v1/settings/branding/logo/file?v=${updatedAt?.getTime() ?? 0}`
      : null,
  };
}

// imagem do logo — pública (é o mesmo logo que vai ao ar; <img> não manda Bearer)
settingsRoutes.get(
  "/branding/logo/file",
  wrap(async (_req, res) => {
    const { logo } = await readLogo();
    if (!logo.file) throw new HttpError(404, "sem logo", "NOT_FOUND");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(path.join(config.brandingDir, path.basename(logo.file)));
  }),
);

settingsRoutes.use(auth);

settingsRoutes.get(
  "/branding",
  wrap(async (_req, res) => {
    res.json(await payload());
  }),
);

settingsRoutes.put(
  "/branding/logo",
  wrap(async (req, res) => {
    const patch = logoSettingsUpdateSchema.parse(req.body);
    const { logo } = await readLogo();
    await writeLogo(normalizeLogo({ ...logo, ...patch }));
    res.json({ ...(await payload()), applied: await applyNow() });
  }),
);

settingsRoutes.post(
  "/branding/logo/file",
  wrap(async (req, res) => {
    const { data } = logoUploadSchema.parse(req.body);
    const buf = Buffer.from(data, "base64");
    if (buf.length > MAX_BYTES) throw new HttpError(413, "logo acima de 5 MB", "TOO_LARGE");
    const kind = sniff(buf);
    if (!kind) throw new HttpError(415, "envie um PNG ou WebP", "UNSUPPORTED_TYPE");

    const { logo } = await readLogo();
    await fs.mkdir(config.brandingDir, { recursive: true });
    const file = `logo-${Date.now()}.${kind}`;
    await fs.writeFile(path.join(config.brandingDir, file), buf);
    // primeiro logo enviado já entra ligado; troca mantém o estado escolhido
    await writeLogo({ ...logo, file, enabled: logo.file ? logo.enabled : true });
    const applied = await applyNow(); // antes de apagar o antigo: o FFmpeg velho ainda o usa
    await removeFile(logo.file);
    res.status(201).json({ ...(await payload()), applied });
  }),
);

settingsRoutes.delete(
  "/branding/logo/file",
  wrap(async (_req, res) => {
    const { logo } = await readLogo();
    await writeLogo({ ...logo, file: null, enabled: false });
    const applied = await applyNow();
    await removeFile(logo.file);
    res.json({ ...(await payload()), applied });
  }),
);
