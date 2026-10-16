# Antenna — Plano de Arquitetura

> Plano aprovável. O v1 (`Tv-local`) continua no ar até o cutover (Fase 9).
> Dados reais preservados: 323 mídias, 21 fontes, 5 gêneros, grade semanal, histórico.

## 1. Objetivos

1. **Separar responsabilidades**: API (controle), Playout (exibição) e Web (painel) em apps independentes — mexer no painel nunca derruba o stream.
2. **Frontend novo**: React + TypeScript + Tailwind, minimalista e funcional, uma tela por recurso (acaba o `app.js` de 1.545 linhas).
3. **TypeScript end-to-end** com contrato tipado (Zod) entre API e Web.
4. **Testes onde importa**: composer (mistura/anti-repetição), filtros, grade e parsing do sync são lógica pura → 100% testáveis.
5. **Migração de dados** do v1 → Antenna sem perder acervo, gêneros, grade nem histórico.

## 2. Decisões registradas

| Tema | Decisão |
|---|---|
| Nome do projeto | **Antenna** (repositório `Repos/antenna`) |
| Frontend | React 18 + Vite + TypeScript + Tailwind, TanStack Query + SSE |
| Backend | Node + Express + TypeScript |
| Topologia | 2 processos/containers: `api` (controle) e `playout` (worker de exibição) |
| Banco | SQLite + Prisma, modo WAL (2 escritores coexistem em escala doméstica) |
| Escopo | Paridade das telas com layout novo. Features novas ficam p/ v2.x |

## 3. Identidade visual (design tokens)

Tema dark minimalista. Cores definidas uma vez no `tailwind.config` e usadas só via tokens (nada de hex espalhado no código):

```js
// apps/web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#171717", // fundo geral
        surface:    "#292929", // cards, sidebar, modais
        signal:     "#FFB547", // sinal — acento: AO VIVO, CTAs, seleção, blocos ativos
        foreground: "#FAFAF5", // texto principal
        muted:      "#A3A3A3", // texto secundário, placeholders, bordas sutis
      },
    },
  },
  plugins: [],
};
```

Uso esperado: `bg-background` no app, `bg-surface` nos cards, `text-signal` para o que está ao vivo / ações principais, `text-muted` para metadados. Transparências via modificadores do Tailwind (`bg-signal/10`, `border-signal/30`) — não criar tons novos por enquanto.

## 4. Estrutura do monorepo

```
antenna/
├── apps/
│   ├── api/                      # API REST + SSE (Express + TS)
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── catalog/      # gêneros, fontes, mídias, categorias
│   │       │   ├── scheduling/   # programas + grade semanal (EPG)
│   │       │   ├── sync/         # expansão yt-dlp + scheduler de sync
│   │       │   ├── playout/      # controle: estado, playNow, fila projetada
│   │       │   └── streaming/    # status MediaMTX, URLs do canal (HLS/RTSP)
│   │       ├── lib/              # prisma, config, logger (pino), erros, zod mw
│   │       └── index.ts
│   ├── playout/                  # worker de exibição (sem HTTP público)
│   │   └── src/
│   │       ├── engine/           # tick, ffmpeg, yt-dlp, fallback, cooldown
│   │       ├── selection/        # composer, pools, janela anti-repetição
│   │       └── index.ts
│   └── web/                      # React + Vite + Tailwind (tema da seção 3)
│       └── src/
│           ├── features/         # no-ar, grade, generos, programas, midias, operacao
│           ├── components/ui/    # botão, card, modal, table, badge…
│           └── lib/              # api client tipado, SSE hook, query client
├── packages/
│   ├── database/                 # schema Prisma + client + migração v1→Antenna
│   └── shared/                   # schemas Zod = contrato único API↔Web
├── infra/
│   ├── docker-compose.yml        # mediamtx, api, playout, web
│   ├── mediamtx/mediamtx.yml     # (reaproveita o do v1)
│   └── *.Dockerfile
└── docs/PLANO.md
```

Tooling: **npm workspaces** (npm 11 já instalado), TS strict, ESLint + Prettier, Vitest, GitHub Actions (lint + typecheck + test).

Packages npm: `@antenna/api`, `@antenna/playout`, `@antenna/web`, `@antenna/database`, `@antenna/shared`.

## 5. Modelo de dados (Antenna)

O schema do v1 funcionou — quase tudo permanece. Mudanças:

- **Removido**: `Rule` e `_ProgramToRule` (legado, 0 regras em uso). A aba "Regras" do painel some.
- **Mantido igual**: `Media` (resolvedId, channelTitle, views, uploadDate), `Playlist` (gênero), `PlaylistItem`, `Source`, `SyncRun`, `MixIngredient`, `Program` (+mixOverride), `ProgramSchedule`, `PlaybackHistory`.
- **Adicionado**: `Media.thumbnailUrl` (sync do yt-dlp já traz thumbnail de graça → cards bonitos no painel sem custo).
- **Novo**: `PlayoutState` (linha única): o worker publica estado a cada tick (item no ar, próximo, pid, erros). A API só lê → o painel sobrevive a restart do worker.
- SQLite em **WAL** + `busy_timeout` na conexão; transações curtas (escala doméstica aguenta tranquilo).
- Arquivo do banco: `data/antenna.db`.

## 6. Comunicação entre os processos

```
Web (React) ──HTTP──▶ API (Express, :3001 interno)
   ▲                     │  lê estado  ◀── PlayoutState (SQLite) ◀── Playout worker
   └──────SSE────────────┘  comanda    ◀── HTTP interno (rede do compose) ──▶ worker
```

- **Comandos** (start/stop/playNow): API → worker via HTTP interno **não publicado** na rede do host (rápido, sem latência de tick).
- **Estado**: worker grava em `PlayoutState` a cada tick (5s). API lê do banco — se o worker cair, o painel mostra o último estado + `stale`.
- **SSE** `/api/v1/events`: API observa `PlayoutState` + fim de `SyncRun` e empurra eventos; o front invalida queries TanStack. Sem polling agressivo.
- FFmpeg/yt-dlp vivem **só** no container do playout.

## 7. Contrato da API (Zod)

Módulos e rotas (mesma semântica do v1, contrato tipado em `@antenna/shared`):

| Módulo | Rotas principais |
|---|---|
| catalog | `GET/POST/PATCH/DELETE /genres`, `/genres/:id/sources`, `/genres/:id/mix`, `/genres/:id/simulate`, `/media` (busca/filtro), `/categories` |
| scheduling | `/programs`, `/schedule` (CRUD de blocos semanais) |
| sync | `POST /sync/genre/:id`, `POST /sync/source/:id`, `GET /sync/runs` |
| playout | `GET /playout/state`, `POST /playout/start|stop|play-now`, `GET /playout/queue` |
| streaming | `GET /stream` (URLs HLS/RTSP, espectadores via API do MediaMTX) |
| events | `GET /events` (SSE) |

Erros padronizados (`{ error, code }`), logs estruturados (pino), Helmet+CORS.

## 8. Frontend — telas (paridade, layout novo)

Design: dark (`background`/`surface`), denso, minimalista; sidebar fina; Tailwind puro com poucos componentes próprios (`components/ui/`); ícones lucide-react; hls.js no player. O âmbar `signal` (#FFB547) marca o que está ao vivo e as ações principais.

1. **No Ar** — player HLS, agora tocando + progresso, fila projetada, grade de hoje, últimos exibidos, controles.
2. **Grade (EPG)** — grade semanal visual (7 colunas), blocos coloridos por gênero, criar/editar por modal.
3. **Gêneros** — cards com ícone/cor/thumbnails; tela de detalhe: fontes com status do último sync, builder visual da mistura ("3 do canal → 2 da busca → 1 do gênero"), filtros avançados em **form** (nada de JSON na UI), simulador da fila.
4. **Programas** — lista simples (criados pela Grade).
5. **Mídias** — biblioteca com thumbs, busca, filtros, status, playNow manual.
6. **Operação** — estado do worker, erros, histórico completo, syncs.
- *Removida*: aba **Regras** (legado sem uso).

## 9. Testes e qualidade

- **Unit (Vitest)**: composer (pools, janela anti-repetição, degraus de fallback, mixOverride), `filters.passes` (datas/views/shorts/lives), grade (bloco atual, virada da meia-noite), sync (dedupe, cap de arquivamento, parsing de entries), agendador (pre-warm).
- **API**: supertest por módulo com SQLite temporário.
- TS strict + ESLint + Prettier + CI no push.

## 10. Migração v1 → Antenna

Script `@antenna/database/src/migrate-from-v1.ts`:

- Lê o `Tv-local/data/local-tv.db` original (attach read-only).
- Copia: gêneros, fontes, mídias, misturas, programas, grade, `SyncRun` e `PlaybackHistory` (o histórico alimenta a anti-repetição e as stats — manter).
- Descarta: `Rule`, `_ProgramToRule`.
- **Validação no fim**: compara contagens tabela a tabela contra o v1 (323 mídias etc.) e falha se divergir.

## 11. Docker / deploy

- `compose`: `mediamtx` (8554 RTSP / 8080 HLS), `api` (3001 interno), `playout` (sem porta publicada), `web` (nginx na **:3000 do host** servindo o SPA e proxy de `/api` + `/events` → api).
- `.env.example`: `TZ`, `CHANNEL` (default `antenna` — v1 usava `tvlocal`; as URLs de acesso mudam no cutover), `DATABASE_URL`, `MEDIA_MTX_URL`, `CONTENT_SYNC_HOURS`, `CONTENT_SYNC_PREWARM_MIN`, `ADMIN_TOKEN`.
- Dev local: `npm run dev` (tsx watch api/playout + Vite), banco no volume local.

## 12. Fases de implementação

| # | Fase | Entrega |
|---|---|---|
| 0 | Scaffold | monorepo, workspaces, TS strict, eslint/prettier/vitest, CI |
| 1 | Database | schema Antenna + WAL + **migração dos dados reais do v1** (validada) |
| 2 | Shared | schemas Zod do contrato |
| 3 | Domínio | selection (composer/filters) + parsing de sync em TS, **com testes** — o coração do produto |
| 4 | API | módulos, rotas, SSE, erros, logs |
| 5 | Playout | engine (ffmpeg/yt-dlp), estado em tabela, control HTTP interno |
| 6 | Web I | shell + design system mínimo + tela **No Ar** |
| 7 | Web II | **Gêneros** (fontes, mistura, filtros, simulador) — a tela mais rica |
| 8 | Web III | Grade/EPG + Programas, Mídias, Operação |
| 9 | Cutover | compose completo, README, v1 parado, Antenna assumindo o canal |

As fases 0–5 não tocam no canal do v1: ele continua no ar até a Fase 9.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| SQLite com 2 escritores | WAL + busy_timeout + transações curtas (escala doméstica) |
| yt-dlp quebrando (YouTube muda) | versão pinned no Dockerfile + comando de update documentado |
| Complexidade de 2 processos | estado no banco (painel à prova de restart) + control HTTP interno simples |
| Perder dados na migração | script com validação de contagens e execução idempotente |

## 14. v2.1 — Player e fila estável (No Ar)

Correções já aplicadas no cutover (commit `fix(stream)`): nginx reescreve o redirect
do cookie-check do MediaMTX (o player recebia HTML em vez de playlist) e o stderr do
ffmpeg é classificado (avisos do decodificador, como "Late SEI", não viram lastError).

### 14.1 LivePlayer (componente reutilizável)
- `components/LivePlayer.tsx`: hls.js + estados (connecting / live / stalled / offline) + `<Loader>` reutilizável.
- Banner AO VIVO (ponto pulsante âmbar), OFFLINE e RECONECTANDO.
- Botões no overlay (paridade v1): som mudo/ligado, reconectar, tela cheia.
- **Auto-reload na troca de mídia** via SSE (hoje o player fica no stream velho).
- Watchdog: currentTime parado 10s → reconexão com backoff (1s→2s→4s… máx 30s).
- Latência: `liveSyncDurationCount: 3` (~4–6s atrás do ao vivo).

### 14.2 Fila estável (reformulação da lógica de transmissão)
- **A fila passa a ser gerada UMA VEZ e consumida em ordem** — hoje o composer
  recalcula a cada escolha (ordenar por "menos reproduzidos" reordena sozinho).
- Worker mantém `state.queue` (persistida no payload de `PlayoutState`):
  - gera lote de 10 ao entrar num bloco da grade / ao esvaziar (repõe quando ≤ 1);
  - `pickNext` = `queue.shift()` (sem recomputar nada);
  - regenera só quando: bloco da grade muda, fila esvaziou ou boot;
  - exclusões na geração: no ar + ids já na fila + janela anti-repetição global.
- Painel exibe a fila persistida (estável, sem embaralhar a cada tick).

### 14.3 No Ar — fila enriquecida + Pular
- Cada item da fila: **thumbnail** (do sync; fallback `i.ytimg.com` pelo resolvedId),
  **tag do gênero** (cor+ícone), **nome do canal**, duração e **link para o vídeo**.
- Botão **Pular** (`POST /playout/next` → worker `/cmd/next`): encerra a mídia atual
  (resultado "skipped") e avança imediatamente para o próximo da fila.

### 14.4 ffmpeg 7 (experimento aprovado)
- Build estático (BtbN, pinado) no container `playout` para eliminar o warning
  "Late SEI" na origem; validado com um vídeo real; rollback = voltar ao ffmpeg do apt.
