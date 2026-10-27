import type { StreamInfo } from "./api";

/**
 * URLs de transmissão do canal. HLS/M3U/XMLTV passam pela front door (nginx :3000
 * — o /hls injeta o Bearer do hlsCDNSecret, sem o 302 de cookie-check); RTSP/RTMP
 * saem direto do MediaMTX nas portas publicadas. O host vem da origem que o
 * operador usou para abrir o painel: o `rtspPath` da API traz o placeholder
 * "<ip-da-lan>", que não dá para copiar.
 */
export interface StreamLinks {
  hls: string;
  rtsp: string;
  rtmp: string;
  m3u: string;
  xmltv: string;
}

export function streamLinks(stream: StreamInfo): StreamLinks {
  const origin = location.origin;
  const host = location.hostname;
  return {
    hls: `${origin}${stream.hlsPath}`,
    rtsp: `rtsp://${host}:8554/${stream.channel}`,
    rtmp: `rtmp://${host}:1935/${stream.channel}`,
    m3u: `${origin}/api/v1/iptv/channels.m3u`,
    xmltv: `${origin}/api/v1/epg/guide.xml`,
  };
}
