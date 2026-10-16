/** URLs do canal + espectadores em tempo real (API de controle do MediaMTX). */
import { Router } from "express";
import { config } from "../config";
import { auth } from "../lib/auth";
import { wrap } from "../lib/http";

export const streamRoutes = Router();
streamRoutes.use(auth);

async function viewers(): Promise<number | null> {
  try {
    const r = await fetch(`${config.mtxApiUrl}/v3/paths/get/${config.channel}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { readers?: unknown[] };
    return Array.isArray(j.readers) ? j.readers.length : null;
  } catch {
    return null;
  }
}

streamRoutes.get(
  "/",
  wrap(async (req, res) => {
    res.json({
      channel: config.channel,
      // painel monta a URL absoluta com o próprio host (mesma origem via nginx /hls)
      hlsPath: `/hls/${config.channel}/index.m3u8`,
      rtspPath: `rtsp://<ip-da-lan>:8554/${config.channel}`,
      hostHint: req.hostname,
      viewers: await viewers(),
    });
  })
);
