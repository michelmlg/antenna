# Configuração

Toda a configuração fica num único arquivo `.env` na raiz do projeto (copie de
[`.env.example`](../.env.example)). Ele é lido pelo `docker compose` e pelo ambiente de
desenvolvimento local.

Depois de alterar o `.env`, recrie os containers:

```bash
docker compose up -d
```

## Canal

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `CHANNEL` | `antenna` | Nome do canal, usado como caminho no MediaMTX e nas URLs (`/hls/<CHANNEL>/…`, `rtsp://…/<CHANNEL>`). |
| `TZ` | `America/Sao_Paulo` | Fuso horário da grade. **A grade usa o horário local**: ajuste para o seu fuso. |
| `ADMIN_TOKEN` | _(vazio)_ | Se definido, as rotas que alteram dados exigem `Authorization: Bearer <token>`. Veja [Segurança](../SECURITY.md). |

## Portas publicadas

| Variável | Padrão | Serviço |
| --- | --- | --- |
| `WEB_PORT` | `3000` | nginx: painel, `/api` e `/hls`. É a porta de entrada. |
| `RTSP_PORT` | `8554` | RTSP (VLC, mpv). |
| `RTMP_PORT` | `1935` | RTMP, para reencaminhar o sinal (OBS, ffmpeg). |
| `HLS_PORT` | `8080` | HLS direto do MediaMTX (opcional; o painel usa `/hls` via nginx). |

As portas internas `3001` (API), `3100` (controle do playout) e `9997` (API do MediaMTX)
**não são publicadas**: só existem na rede interna do compose.

## Dados

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Pasta do banco (`antenna.db`) e do logo. Relativa à raiz ou absoluta. |
| `MEDIA_DIR` | `./media` | Pasta dos arquivos de vídeo locais, montada em `/media` no worker. |
| `DATABASE_URL` | _(derivada)_ | Avançado. Se vazia, é derivada de `DATA_DIR` (recomendado). |

## Playout e sincronização

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `AUTOPLAY` | `true` | Coloca o canal no ar assim que o worker sobe. |
| `FALLBACK_MEDIA_ID` | _(vazio)_ | Id de uma mídia para tocar quando não há nada elegível. Também pode ser definido pelo painel. |
| `CONTENT_SYNC_HOURS` | `6` | Intervalo do sync automático das fontes do YouTube. `0` desliga. |
| `CONTENT_SYNC_PREWARM_MIN` | `15` | Antecedência, em minutos, para pré-sincronizar o gênero do próximo bloco da grade. |

## Desenvolvimento local

As variáveis abaixo só valem fora do Docker (`npm run dev:*`). No compose, os endereços
internos são fixos e não devem ir para o `.env`.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `API_PORT` | `3001` | Porta da API. |
| `PLAYOUT_PORT` | `3100` | Porta do controle interno do worker. |
| `WEB_DEV_PORT` | `5173` | Porta do Vite. |
| `PLAYOUT_URL` | `http://localhost:3100` | Como a API alcança o worker. |
| `MEDIA_MTX_URL` | `rtsp://localhost:8554` | Para onde o FFmpeg publica. |
| `MTX_API_URL` | `http://localhost:9997` | API do MediaMTX (contagem de espectadores). |
| `LOG_LEVEL` | `info` | Nível dos logs estruturados da API (pino). |

Veja [Contribuindo](../CONTRIBUTING.md) para o passo a passo do ambiente de desenvolvimento.
