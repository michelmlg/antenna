/**
 * Camada IPTV para guias externas (Jellyfin etc.): lista de canais (M3U) e
 * guia XMLTV gerada da grade semanal. Rotas PÚBLICAS (sem auth) — o Jellyfin
 * busca sem credenciais. O host embutido nas URLs é o do PRÓPRIO request:
 * o Jellyfin baixa lista e stream pelo mesmo front door que usou aqui.
 */
import { Router, type Request, type Response } from "express";
import { prisma } from "@antenna/database";
import { epgXmltv } from "@antenna/core";
import { wrap } from "../lib/http";
import { config } from "../config";

export const iptvRoutes = Router();

const CHANNEL_ID = `${config.channel}.br`;
const channelName = config.channel.charAt(0).toUpperCase() + config.channel.slice(1);

function baseUrl(req: Request): string {
  const host = req.headers.host ?? `localhost:${config.apiPort}`;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

// GET /api/v1/iptv/channels.m3u — LISTA de canais (não é o m3u8 de stream);
// é essa peça que dá identidade ao canal no tuner (tvg-id casa com o XMLTV).
// O stream vai como HLS pela front door (o nginx injeta o Bearer do
// hlsCDNSecret — sem o 302 de cookie-check que quebrava ffmpeg com
// -reconnect). NO JELLYFIN, deixar "Auto-loop live streams" DESLIGADO: as
// flags de loop/reconnect do Jellyfin quebram a abertura do HLS do MediaMTX;
// a continuidade nas trocas de mídia vem do handover sem vão do playout.
iptvRoutes.get("/iptv/channels.m3u", (req: Request, res: Response) => {
  const base = baseUrl(req);
  const m3u = [
    `#EXTM3U x-tvg-url="${base}/api/v1/epg/guide.xml"`,
    `#EXTINF:-1 tvg-id="${CHANNEL_ID}" tvg-name="${channelName}" group-title="TV local",${channelName}`,
    `${base}/hls/${config.channel}/index.m3u8`,
    "",
  ].join("\n");
  res.type("audio/x-mpegurl").send(m3u);
});

// GET /api/v1/epg/guide.xml — guia gerada da grade semanal (sempre atual:
// gerada a cada fetch a partir do banco).
iptvRoutes.get(
  "/epg/guide.xml",
  wrap(async (_req, res) => {
    const rows = await prisma.programSchedule.findMany({
      include: { program: { include: { genre: true } } },
    });
    const xml = epgXmltv({
      channel: { id: CHANNEL_ID, name: channelName },
      blocks: rows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        program: r.program ? { name: r.program.name, genre: r.program.genre } : null,
      })),
      now: new Date(),
    });
    res.type("application/xml").send(xml);
  })
);
