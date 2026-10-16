# Antenna

Canal de TV **linear** na rede local: playout de vídeos do YouTube (por gênero, com
fontes sincronizadas automaticamente) + arquivos locais, publicado como HLS/RTSP via
MediaMTX. Sucessor estruturado do projeto "TV Local".

```
Web (React+TS+Tailwind) ──▶ API (Express+TS, container próprio)
                              │ lê estado (SQLite/WAL) ◀── worker de playout (ffmpeg + yt-dlp)
                              └ comanda via HTTP interno (rede do compose)
MediaMTX ──▶ RTSP :8554 · HLS :8080 · RTMP :1935
```

## Estrutura

```
apps/api        API REST + SSE (Express + TS)
apps/playout    worker de exibição: engine FFmpeg, sync yt-dlp, scheduler
apps/web        painel (React + Vite + Tailwind)
packages/core   domínio puro: composer (mistura/anti-repetição), filtros, grade — testado
packages/database  schema Prisma + client + migração v1→Antenna
packages/shared    contrato Zod (API↔Web)
infra           docker-compose, Dockerfiles, nginx, mediamtx
docs/PLANO.md   plano de arquitetura
```

## Rodar (produção, Docker)

```bash
cd infra
cp ../.env.example ../.env       # ajuste se quiser
docker compose up -d --build
```

- Painel: **http://localhost:3000**
- HLS: `http://<ip-da-lan>:3000/hls/antenna/index.m3u8` (mesma origem)
- RTSP (VLC): `rtsp://<ip-da-lan>:8554/antenna`

## Desenvolvimento

```bash
npm install
npm run db:push        # cria data/antenna.db
npm run dev:playout    # worker (porta 3100, controle interno)
npm run dev:api        # API (porta 3001)
npm run dev:web        # painel (porta 5173, proxy /api)
npm test               # vitest (packages/core)
```

## Migração do v1 (TV Local)

```bash
npm run migrate:v1            # padrão: ../Tv-local/data/local-tv.db
npm run migrate:v1 -- --from <caminho> --force
```

Copia gêneros, fontes, mídias, misturas, programas, grade, syncs e histórico
**preservando IDs**, valida contagens tabela a tabela e falha se divergir.

## Operações

- **Atualizar yt-dlp** (quando o YouTube muda alguma coisa):
  `docker compose -f infra/docker-compose.yml build playout && docker compose -f infra/docker-compose.yml up -d playout`
  (ou fixe `YTDLP_VERSION` na build)
- **Variáveis**: `.env.example` (`CHANNEL`, `TZ`, sync hours/pre-warm, `ADMIN_TOKEN`).
- **Banco**: `data/antenna.db` (SQLite em WAL — API e worker coexistem).

## Critérios de aceitação (v2)

1. Fluxo de stream funcionando (FFmpeg → MediaMTX → HLS/RTSP)
2. Iniciar/pausar o playout pelo painel
3. Gestão de gêneros com busca por fontes (canais/buscas via yt-dlp), mistura e simulador
