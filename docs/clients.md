# Assistindo ao canal

O canal sai em **HLS** (navegadores, Jellyfin) e **RTSP** (VLC, mpv), sempre pelo MediaMTX.
A tela **Assistir** do painel mostra todos os endereços prontos para copiar.

Nos exemplos abaixo, troque `<ip>` pelo IP do servidor e `antenna` pelo seu `CHANNEL`, se
tiver mudado.

## Navegador

Abra o painel (`http://<ip>:3000`): a tela **Início** já toca o canal (HLS via `hls.js`).
Funciona em qualquer navegador moderno, inclusive em celulares e smart TVs.

URL direta do HLS, para outros players:

```text
http://<ip>:3000/hls/antenna/index.m3u8
```

## VLC e mpv

- **VLC**: _Mídia → Abrir fluxo de rede_ e cole:

  ```text
  rtsp://<ip>:8554/antenna
  ```

- **mpv**:

  ```bash
  mpv rtsp://<ip>:8554/antenna
  ```

## Jellyfin (TV ao vivo)

O Antenna expõe uma lista **M3U** e um guia **XMLTV** gerado a partir da sua grade: o canal
aparece no guia de TV ao vivo do Jellyfin com a programação.

1. _Painel de controle → TV ao vivo → Dispositivos sintonizadores → Adicionar_, tipo
   **M3U Tuner**, com a URL:

   ```text
   http://<ip>:3000/api/v1/iptv/channels.m3u
   ```

2. _Provedores de guia → Adicionar → XMLTV_, com a URL:

   ```text
   http://<ip>:3000/api/v1/epg/guide.xml
   ```

3. Mapeie o canal ao guia, se o Jellyfin pedir, e atualize os dados do guia.

> [!IMPORTANT]
> Deixe **"Auto-loop live streams" desligado** no sintonizador. As flags de loop e
> reconexão do Jellyfin quebram a abertura do HLS do MediaMTX. A continuidade entre vídeos
> já é garantida pelo próprio playout.

## Plex

O Plex não aceita listas M3U diretamente: o _Live TV & DVR_ espera um sintonizador do tipo
HDHomeRun. Use um proxy IPTV → HDHomeRun, como o
[Threadfin](https://github.com/Threadfin/Threadfin), apontando para as mesmas URLs de M3U e
XMLTV acima, e adicione o Threadfin como sintonizador no Plex.

## Outros clientes IPTV

Qualquer app que aceite M3U + XMLTV (Kodi com _PVR IPTV Simple Client_, TiviMate, etc.)
funciona com as duas URLs acima.

## Reencaminhar o sinal (RTMP)

Para levar o canal a outro sistema (OBS, outro ffmpeg), use o RTMP do MediaMTX na porta
`1935`, também listado em _Assistir → Avançado_.

> [!WARNING]
> O Antenna foi feito para a **rede local**. Não exponha os endereços acima à internet;
> veja [Segurança](../SECURITY.md) e o [aviso legal](disclaimer.md).
