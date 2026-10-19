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

## 15. v2.2 — Tela do gênero: sync interativo, CRUD de vídeos, ícones, layout

### 15.1 Sync interativo (o que o antigo fazia melhor)
- Ao sincronizar (canal/busca/busca-no-canal), o resultado abre **dentro do bloco
  da fonte**: grid de thumbs com título/duração/canal de cada vídeo encontrado.
- Bloco da fonte mostra "N de M passam os filtros" e botão ver todos.
- O sync passa a rodar em foreground com estados (sincronizando… → resultado no bloco).

### 15.2 CRUD de vídeos por fonte
- **GET** `/genres/:id/sources/:sid/media` — vídeos da fonte (inclui inativos).
- **PATCH** `/genres/:id/media/:id { status }` — remover = `inativo` (arquivado:
  dedupe preserva, nunca volta no sync; pode reativar de lá). Apagar de vez = DELETE (cuidado).
- **Adicionar manualmente** continua pelo tipo `vídeo` (link direto + probe) —
  botão visível na mesma barra "Adicionar fonte".
- API de fonte criada passa a ter um `sync` que responde com os vídeos adicionados.

### 15.3 Ícones lucide em vez de emojis
- `Genre.icon` passa a guardar o **nome do ícone lucide** (`fish`, `gamepad-2`,
  `newspaper`…); galeria curada (~24 ícones) no picker do painel.
- Migração: script mapeia os emojis existentes (`🎭→drama`, `🎮→gamepad-2`,
  `📰→newspaper`, `🐟→fish`) e deixa "" para o resto (renderiza ícone padrão).
- Um único componente `<GenreIcon name?>` resolve nome → componente lucide.

### 15.4 Layout da tela do gênero

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Gêneros   [icon] Gameplays        ordem: menos reproduzidos  ativo ●  ✎ │  identidade inline (nome/ícone/status/janela anti-rep.)
├────────────────────────────────────────────────────────────────────────────┤
│ ADICIONAR FONTE                                                            │
│ [ Canal ] [ Busca ] [ Busca no canal ] [ Vídeo (manual) ]                   │
│ ┌──────────────────────────────────────────────────────────────┐ [Adicionar]│
│ │ https://youtube.com/@canal                     limite 12    │            │
│ └──────────────────────────────────────────────────────────────┘            │
├────────────────────────────────────────────────────────────────────────────┤
│ FONTES (3)                                                    [↻ Sync geral]│
│ ┌ ▾  canal @FAGames1        12 vídeos (12 passam filtros)  ↻ ⚙ ⏸ 🗑        │
│ │   ┌──────┬──────┬──────┬──────┬──────┬──────┐                             │
│ │   │thumb │thumb │thumb │thumb │thumb │thumb │  ← grid 6 col               │
│ │   │título│título│título│título│título│título│    hover: (re)ativar        │
│ │   └──────┴──────┴──────┴──────┴──────┴──────┘    remover / ver mais →     │
│ └──────────────────────────────────────────────────────────────────────────┘
│ ┌ ▸  busca "Rocket League"  12 vídeos (+3 fora do filtro) ↻ ⚙ ⏸ 🗑 (fechado)│
│ └────────────────── expandir revela o mesmo grid de vídeos ────────────────┘
├────────────────────────────────────────────────────────────────────────────┤
│ MISTURA        3× canal A → 2× busca B → 1× gênero            [editar]     │
│ (chips com fonte, contador e reordenação; salva em lote)                    │
├────────────────────────────────────────────────────────────────────────────┤
│ SIMULADOR [8 ▾] [Simular] → 01 thumb · tag gênero · título · dur · link ↗   │
└────────────────────────────────────────────────────────────────────────────┘
```

- Identidade (nome, ícone, cor, status, janela anti-repetição, ordenação) vira
  uma faixa compacta editável no cabeçalho — sai do lugar de "form solto".
- Fonte em cima (form) → lista de fontes embaixo, cada uma com o CRUD de vídeos
  dentro do bloco (grid de thumbs, filtrável ativo/inativo).

## 16. v3.0 — Grade: timeline de edição (drag & drop + resize)

> **STATUS: implementado e em produção (16/10/2026).** Verificado: 33 testes do
> core ✓, typecheck ✓, build web ✓, smoke de API (POST 201 / PATCH 200 / conflito
> 409 / inverso e <5min 400 / duplicado 409) ✓, drag+resize+undo/redo exercitados
> no navegador ✓, estado do DB restaurado ao original (12 blocos). Pendente de
> validação visual do usuário: gesto de arrastar da biblioteca (dnd-kit) — o
> caminho de código existe e a matemática é a mesma do drag de blocos, mas o
> sandbox headless não consegue simular dnd-kit.

Substitui os 7 cards independentes de `grade.tsx` por uma timeline de edição.
Objetivo: gerenciar a grade sem formulário — arrastar blocos, redimensionar pelas
alças, ver conflitos na hora, persistir no mesmo backend/models.

### 16.0 Decisões (clarify, 16/10/2026 — contrato de implementação)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Geometria | **7 linhas horizontais (A)** — uma trilha por dia Dom→Sáb, régua de horas compartilhada no topo; arrastar na vertical muda o dia |
| D2 | Drag & drop | **dnd-kit** (nova dependência) — facilita arrastar da biblioteca; resize continua com pointer events próprios (dnd-kit como wrapper mínimo) |
| D3 | Blocos sobrepostos | **Bloquear salvamento** — região em vermelho + explicação objetiva; a grade nunca fica inexequível |
| D4 | Regra de encaixe | **Blocos independentes, lacunas permitidas** — é o modelo atual; fora dos blocos roda seleção automática |
| D5 | Backend | **PATCH `/schedule/:id` aditivo** — sem mudar modelos; validação continua via Zod no shared + checagem de conflito server-side |

### 16.1 Wireframe aprovado (layout A)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Grade de Programação      ⊖ Zoom ⊕  [Auto]  [Dia ▾]      ⟲ ⟳   ● pendente / ✓ salvo │
├──────────┬────────────────────────────────────────────────────────────────────────┤
│ BIBLIO.  │ régua:  00 02 04 06 08 10 12 14 16 18 20 22 24 (sticky, tick 30 min)    │
│ (▸sel.)  │ ┌────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴─────────┐  │
│ 🔍 buscar│ │DOM │        ▓▓▓Música▓▓░│          ░░Retrô░         │               │  │
│ ▾ gênero │ │    │    09–11 · 2h      │          14–17 · 3h       │               │  │
│ ▾ origem │ ├────┼────────────────────┼───────────────────────────┼───────────────┤  │
│ ┌──────┐ │ │SEG │  ▼ linha "agora"   │▒▒▒Jornal▒▒▒               │░░░░ (auto)    │  │
│ │Música│ │ │    │    08–13 · 5h      │                           │               │  │
│ │1h    │ │ ├────┴────────────┬───────┴───────────────────────────┴───┴───────────┤  │
│ └──────┘ │ │TER │            │  ← divisão entre dias visível, régua contínua     │  │
│ (arrasta)│ └────────────────────────────────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────────────────────────────────┘
   bloco:  ┌─Música 09–11─┐  ← alça esquerda e direita (6px, cursor ew-resize)
           seleção: borda + ações contextual (editar, duplicar, excluir)
           duplo-clique → modal de edição; lacunas mostram "livre (auto)"
```

Leitura do wireframe: cada dia é uma trilha horizontal; largura dos blocos =
minutos reais × pxPorMinuto (zoom); a régua no topo fica fixa durante o scroll
horizontal; a coluna de dias fica fixa durante scroll horizontal; biblioteca
colapsável à esquerda.

### 16.2 Limitações do modelo (sem mudança de modelos)

- **Semana única recorrente** — não há navegação entre semanas nem períodos.
- **Canal único (`antenna`)** — sem seleção de canal.
- **Blocos não cruzam meia-noite** (paridade v1, `packages/core/schedule.ts`) —
  arrastar/redimensionar trava em 24:00; exceder meia-noite exigiria mudança
  de modelo, fora de escopo nesta versão.
- **Sobreposição hoje: silenciosamente o primeiro ganha** (`currentBlock` usa
  `find`) — D3 torna isso impossível de salvar a partir de agora.

### 16.3 Backend (aditivo)

- `packages/shared`: `scheduleUpdateSchema = { dayOfWeek?, startTime?, endTime? }` (hhmm).
- `apps/api/scheduling.routes.ts`: `PATCH /schedule/:id` — atualiza os três campos
  com checagem de conflito **server-side**: para o `dayOfWeek` resultante, rejeita
  (409) se `start < other.end && other.start < end` contra qualquer outro bloco do
  mesmo dia (excluindo a própria linha). Também valida `start < end`.
- Playout não muda: `scheduledProgram()` roda a cada tick (5 s), então qualquer
  mudança na grade vale a partir do tick seguinte; o vídeo em execução não
  interrompe (a fila só se refaz quando o *programa* muda).

### 16.4 Frontend — arquitetura modular

```
features/grade/
  index.tsx            ← cabeçalho (título, zoom, Dia ▾, undo/redo, indicador)
  TimelineBits.tsx     ← régua (ticks 60/30 min), grid de fundo, linha "agora"
  DayLane.tsx          ← uma trilha por dia (label fixa à esquerda)
  ScheduleBlock.tsx    ← bloco (conteúdo adaptativo: nome, icon, hh–hh, duração)
  BlockModal.tsx       ← evolui o modal atual (nome, dia, início, fim, programa)
  LibraryPanel.tsx     ← programas de GET /programs com filtro por gênero/origem
  useTimelineDrag.ts   ← dnd-kit blocks + pointer handlers de resize
  useScheduleMutations.ts ← mutations (react-query) + optimistic + rollback + undo/redo
```

- **Fonte única de verdade:** tudo derivado de `ScheduleRow` em minutos
  (`dayOfWeek*1440 + start`, duração); `Math.round` de minutos → px só no final,
  no render; ao soltar, o bloco sempre rehidrata de minutos para px — nunca se
  trava posições em pixels (sem drift entre o que aparece e o que grava).
- **Zoom:** `pxPerMinute` (default Auto = semana inteira na largura útil);
  botões +/− e "Auto"; 0.35 a 6 px/min; visão "Dia" = scroll até o dia e margens
  para o resto (régua continua).
- **Desktop-first**; atalhos de teclado e navegação por teclado entram na F3.

### 16.5 Regras de negócio na UI

| Cenário | Tratamento |
|---|---|
| Duração < 5 min | alça trava no mínimo de 5 min (snap 5 min em qualquer arraste) |
| Sobreposição no dia | região em vermelho + tooltip com os 2 blocos; **409 do PATCH** é a barreira final |
| Único bloco por dia/excedente | mesma checagem do POST, no drag preview antes de soltar |
| Bloco em execução | marcado com "● no ar" do estado SSE; resize dele é permitido só a partir da próxima semana (modelo semanal), sem tocar no vídeo corrente |
| Programas noturnos que invadem 24:00 | trava em 24:00 (limitação 16.2) |
| Lacunas | permitidas por design; fundo das lacunas mostra "livre (auto)" |

### 16.6 Salvamento

- Durante arraste/resize: **só estado local visual** (sem rede).
- Ao soltar / soltar a alça: valida localmente → `PATCH` (ou `POST` no drop da
  biblioteca) → optimistic com rollback em falha; indicador "● pendente → ✓
  salvo / ⚠ falhou (estado anterior restaurado)".
- Sem debounce de rede por pixel — gravação é no fim da interação, uma chamada
  por bloco alterado.
- `refetchInterval: 15000` da query `schedule` **sai** — invalidação explícita
  (polling atrapalharia drag/undo); SSE de playout continua como está.
- Undo/redo: pilha local de snapshots dos rows (máx. 30); refazer/reverter
  chama PATCH com o snapshot (não confundir com histórico do backend).

### 16.7 Fases (prioridade do usuário)

| Fase | Entrega | Aceitação |
|---|---|---|
| **F1 — timeline + cálculos** | Régua/trilhas/blocos posicionados por minutos + zoom + linha "agora" + biblioteca renderizada (sem arrastar) + módulo de cálculo em `packages/core` com testes | Semana renderizada, largura ∝ duração, horários alinhados, régua fixa |
| **F2 — dnd-kit + resize** | Arrastar entre horários/dias, alças de resize, preview fantasma, snap de 5 min, `PATCH /schedule/:id` + POST na biblioteca, bloqueio de conflito | Mover/redimensionar persiste; conflito nunca salva (409) |
| **F3 — edição + histórico** | Modal completo, ações contextuais, undo/redo, indicador pendente/salvo, atalhos de teclado, tooltips, refinamento visual | Editar sem sair da timeline; undo desfaz; falha restaura o estado anterior |

Fora de escopo nesta versão: semana/canal múltiplos (limitações 16.2);
responsividade mobile além de "usável"; meia-noite cruzando blocos.

## 17. v3.1 — Consolidação: corte das telas Programas e Mídias

> Gestão de conteúdo passa a ser 100% na tela do Gênero; a Grade usa os
> gêneros direto. **STATUS: implementado e verificado (17/10/2026).**
> F1: tsc web ✓, build ✓, bundle sem `/programas` ✓, smoke grade
> (201 via genreId · PATCH 200 · 409 · 400, blocos 12=12) ✓.
> F2: build ✓, ▶ play-now muda `state.current` ✓, 🗑 delete 201→0 ✓,
> toggle intacto ✓. F3: script in-container (docker exec + Prisma):
> 22 links → Gameplays, 6 → Aquarismo de Manha, slide mantido solto,
> "Jornal da Tarde" apagado (5 programas, todos com gênero), validação
> de contagens ✓. F4: typecheck+lint+33 testes core ✓, `/programs` e
> `GET /media` 404 ✓, `POST /schedule` 201 ✓, DELETE/play 404 em id
> inexistente ✓, playout running ✓. Pending de validação visual do
> usuário: gesto de arrastar gênero da biblioteca (dnd-kit) e o hover
> com ▶/🗑 no grid.
>
> Ajuste pós-deploy (17/10, a pedido): hover do grid de mídia ficou com
> **SÓ o 🗑 Apagar de vez** (▶ Colocar no ar e Remover/Reativar saíram
> da UI; arquivar/reativar seguem possíveis via `PATCH /genres/:id/media/:id`).
> Consequência conhecida: mídia apagada de vez pode voltar no próximo
> sync (o dedupe preserva só arquivados).
>
> Ajuste pós-deploy 2 (17/10, a pedido): o ▶ Colocar no ar migrou para a
> lista **"Próximos na programação"** (No Ar) — um ▶ por item da fila;
> no playout, `playNow` agora **remove a mídia da fila** ao assumir o ar
> (antes: o shift() a tocaria de novo em seguida). Smoke: item saiu da
> fila ✓; o alvo do teste falhou ao abrir por bloqueio transitório do
> YouTube (bot-check no yt-dlp) e o canal se auto-recuperou — fallback
> funcionando.
>
> Incidente durante o deploy (resolvido, zero perda): escrita simultânea
> host↔container no SQLite (bind mount Windows) clobberou frames do WAL
> e novas conexões no container falharam com IOERR_SHORT_READ; restart
> de api+playout restaurou a consistência (host tinha o estado completo;
> o "sumiço" de 18 mídias era leitura de snapshot velho — eram as
> inativas). Regra nova: **nenhuma escrita no banco a partir do host**
> com containers no ar; jobs de dados via `docker exec` + PrismaClient
> (critérios de match por id, não por título com acento).

### 17.0 Decisões (clarify, 17/10/2026 — contrato de implementação)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Biblioteca lateral da Grade | **Listar gêneros** (ícone + cor) em vez de programas; arrastar cria o bloco via `POST /schedule { genreId }` (o backend cria/reaproveita o auto-programa, como já faz); campo "Programa" sai do BlockModal (criar passa a aceitar só gênero) |
| D2 | Grid de mídia do gênero | Ganha **▶ Colocar no ar** e **🗑 Apagar de vez** no hover — APIs já existem (`POST /media/:id/play`, `DELETE /media/:id`), muda só UI |
| D3 | Mídias soltas (29 sem fonte, herdadas do v1) | **Anexar por links manuais**: gameplay/Minecraft/Rocket League/Dayz → **Gameplays**; aquário/peixes → **Aquarismo de Manha**; "Teste de Padrão" (local, slide) fica solta de propósito |
| D4 | API/types sem uso | **Cortar**: `programRoutes` inteiro e `GET/POST/PATCH /media`. Modelos `Program`/`ProgramSchedule` **ficam no banco** (grade + worker dependem) |
| D5 | Programa "Jornal da Tarde" | **Apagar** (sem gênero, 0 blocos, o playout nem programa bloco de programa sem gênero) |

Dados de apoio (sondagem 17/10/2026): 6 gêneros · 23 fontes · 384 mídias
(355 via fonte, 29 soltas — 28 conteúdo único, 1 duplicata "Dayz") ·
5 programas (4 auto + 1 manual sem gênero) · 11 blocos, todos em programas
com gênero. `selectAuto` usa **qualquer mídia ativa**, então as 29 soltas
tocam hoje na seleção automática — por isso D3 as re-assenta em vez de
arquivar.

### 17.1 Wireframe — nav e ações

```
NAV HOJE                       NAV DEPOIS
┌────────────┐                 ┌────────────┐
│ ● No Ar    │                 │ ● No Ar    │   player + fila
│ ● Grade    │                 │ ● Grade    │   timeline — biblioteca lista GÊNEROS
│ ● Gêneros  │                 │ ● Gêneros  │   gestão de conteúdo centralizada
│ ● Programas│ ✗               │ ● Operação │
│ ● Mídias   │ ✗               └────────────┘
│ ● Operação │
└────────────┘

GRID DE MÍDIA DA FONTE — hover no thumb:
┌ ▾  canal @FAGames1        12 vídeos (12 passam filtros)  ↻ ⚙ ⏸ 🗑
│   ┌──────┬──────┬──────┐
│   │thumb │thumb │thumb │    hover:
│   │título│título│título│    ┌───────────────────────┐
│   └──────┴──────┴──────┘    │ ▶  Colocar no ar      │  ← novo (API existente)
│                             │ ⇄  Remover/Reativar   │  ← como hoje
│                             │ 🗑  Apagar de vez      │  ← novo (API existente)
│                             └───────────────────────┘

BIBLIOTECA DA GRADE (painel esquerdo):                 DEPOIS
HOJE                                                   ┌──────────────────┐
┌──────────────────┐                                   │ 🔍 buscar        │
│ 🔍 buscar        │                                   │                  │
│ filtro: gênero ▾ │ ← some (redundante)               │ 🎮 Gameplays     │ ← ícone + cor
│ Gameplays        │ ← programa                        │ 📺 Desbugados TV │    do gênero
│ Retrô            │                                   │ 📼 Nostalgia     │
│ Jornal da Tarde  │ ← sem gênero (nunca toca nada)    │ 🐟 Aquarismo…    │
└──────────────────┘                                   └──────────────────┘
```

### 17.2 Escopo técnico

Frontend (`apps/web`):
- Deleta `features/programas.tsx` e `features/midias.tsx`, rotas
  `/programas`/`/midias` e os itens de nav (ícones `Film`, `ListVideo`).
- `LibraryPanel.tsx`: fonte vira `GET /genres`; item mostra ícone + cor +
  nome; filtro "por gênero" sai; drag solta `POST /schedule` com `genreId`
  (mesmo fluxo de drop de hoje).
- `BlockModal.tsx`: criar só com Gênero (campo Programa removido); editar
  segue igual (nunca mudava programa).
- `genero-fontes.tsx` (grid de mídia): hover ganha ▶ e 🗑 além de
  Remover/Reativar; `MediaActions` recebe `onPlay`/`onDelete`.
- `lib/api.ts`: tipos/métodos dos endpoints mortos saem (`ProgramRow`…).

Backend (`apps/api` + `packages/shared`, fase 4):
- `programRoutes` fora (`app.ts` + `scheduling.routes.ts`);
  `media.routes` reduz a `DELETE /media/:id` e `POST /media/:id/play`.
- `shared`: `programCreate/UpdateSchema` e `mediaCreate/UpdateSchema`
  saem se ficarem sem uso (grep antes de cortar — sync pode referenciar).
- **Nenhuma migração de banco** — modelos `Program`/`ProgramSchedule`
  permanecem; corte é de superfície (API/UI), não de modelo.

Dados (fase 3): script one-shot com snapshot de contagens antes/depois;
heurística por título decide o gênero de cada mídia solta e imprime a
decisão de cada uma; valida que **restam 0 mídias soltas ativas além de
"Teste de Padrão"**; apaga o programa "Jornal da Tarde".

### 17.3 Fases

| Fase | Entrega | Aceitação |
|---|---|---|
| **F1 — Programas sai** | Página/rota/nav fora; biblioteca da Grade lista gêneros; BlockModal sem campo Programa | typecheck + build ✓; arrastar gênero cria bloco (201); PATCH 200; conflito 409 e <5min 400 intactos; snapshot: 11 blocos antes = depois |
| **F2 — Mídias sai** | Página/rota/nav fora; ▶ e 🗑 no grid do gênero | typecheck + build ✓; ▶ muda `state.current` (curl antes/depois); 🗑 reduz a contagem da fonte; Remover/Reativar intactos |
| **F3 — Reassentar + limpeza** | Script: 28 soltas → links manuais (Gameplays/Aquarismo); "Teste de Padrão" fica; "Jornal da Tarde" apagado | contagens antes = depois; 0 soltas ativas restantes (além do slide); pools crescem (+gameplay, +6 aquarismo); 4 programas restantes, todos com gênero |
| **F4 — Corte de API** | `programRoutes` fora; `media.routes` reduzida; rebuild api → web | smoke: `/api/v1/programs` 404 · `GET /media` 404 · `POST /schedule` 201 · `DELETE /media/:id` 200 · `POST /media/:id/play` 200 |

Riscos: mudanças na biblioteca reusam o fluxo de drag existente (mesma
matemática de drop dnd-kit); o playout não muda em nenhuma fase — fila
estável preserva o vídeo corrente e tudo vale a partir do próximo tick.
Rebuild obrigatório api → web na F4 (worker/playout intocados).

## 18. v3.2 — Grade: correção do DnD + layout/responsividade

> **STATUS: implementado e verificado (17/10/2026).** Base versionada:
> tag `pre-grade-v3.2` (2 commits: fix DnD → feat layout).

### 18.0 Bug do DnD (prioridade) — 2 causas, umastructural

1. **`<DndContext>` envolvia só a Card da timeline** — a `LibraryPanel`
   (com os `useDraggable`) ficava FORA do contexto: o arraste nunca
   ativava (fantasma/preview/criação jamais aconteciam). Fix: contexto
   envolve biblioteca + timeline. Esse era o "arraste não funciona" do
   usuário — não era tuning do sensor.
2. **Prévia derivava de `ev.delta` (pós-modifier)** — com o modifier que
   centraliza o overlay no cursor, `ev.delta` NÃO é o deslocamento bruto
   do ponteiro: recomputar o ponteiro com ele produzia exatamente o
   deslocamento "à direita do cursor" que o usuário reportava. Fix:
   **ponteiro bruto rastreado por listener `pointermove` (capture, no
   document) instalado no `onDragStart`** e removido em end/cancel;
   `libPreview` lê esse valor. Geometry: `pointerMin =
   (pointerX − trackLeft() Rect) / px`, bloco de 1h centrado no cursor,
   snap 5 min, clamp 0–1440; `ev.over` resolve o lane.

### 18.1 Layout (desktop/tablet)

- Barra superior agrupada: status · grupos (⟲⟳) (⊖ zoom ⊕) · ir p/ dia · + Programar.
- Biblioteca: recolhível + **largura ajustável pela borda direita**
  (150–360px, persistida em `localStorage["grade-lib-w"]`, listeners de
  document — pointer capture falha com CDP).
- **Painel de propriedades** (novo `PropertiesPanel.tsx`): selecionar
  bloco → dia (botões), início/fim (inputs time), duração, Duplicar/Excluir;
  PATCH automático (rollback + msg de conflito inline). Duplo-clique agora
  só seleciona (o painel é o editor; o modal ficou para CRIAR).
- Blocos: gradiente sobre a cor do gênero (uniformiza), contorno
  **tracejado = PATCH em andamento**, anel = selecionado, ghost vermelho =
  conflito. Ticks de meia-hora quando zoom ≥ 1.5 px/min.
- Undo/redo e atalhos (N/D/Del/Ctrl+Z/Y) preservados.

### 18.2 Responsividade

- Desktop ≥768px: como acima (timeline com scroll horizontal por zoom).
- Celular <768px: **`GradeMobile.tsx`** — chips de dia + agenda do dia com
  campos de horário (type=time) + excluir + "Novo bloco" (modal); sem drag.

### 18.3 Verificação (Chrome real via CDP `Input.dispatchMouseEvent`)

| Teste | Resultado |
|---|---|
| Drag biblioteca → minuto 800 (13:20) | bloco criado **Dom 12:50–13:50** (snap exato) ✓ |
| Mover bloco (corpo) | PATCH persistiu ✓ |
| Editar pelo painel (Fim 05:00→05:30) | API 04:00–05:30 + "duração: 1h30" ✓ |
| Alça da biblioteca | largura persistida (`ls=293`) ✓ |
| 1500×900 / 1024×768 / 390×844 | timeline / tablet / agenda mobile ✓ |
| DB | sempre restaurado (12 blocos antes = depois) ✓ |

> Nota de método: `npx chrome-devtools-mcp` `drag` usa HTML5 DnD (dnd-kit
> ignora); eventos sintetizados via `dispatchEvent` falham por
> `button = -1` default e React-async. O que funcionou: **Chrome próprio
> com `--remote-debugging-port` + `Input.dispatchMouseEvent`** (eventos
> confiáveis, passos discretos com sleeps) — ver skill repo-restructure.

### 18.4 Pendente

Validação visual do usuário: afinação do gesto (arrastar da biblioteca,
mover, alças), largura da biblioteca. Ajustes de gosto no painel.

## 19. v3.2.1 — Playout: corte automático quando um input do FFmpeg morre (19/10/2026)

**Bug**: vídeo rodando com áudio de outro trecho/vídeo ("sobreposição"). Causa
raiz: toda mídia YouTube sobe como FFmpeg de 2 inputs independentes (vídeo itag
137 + áudio webm, cada um com `-stream_loop -1` e `-re` próprio). O input de
áudio (googlevideo) morre no meio do stream com frequência; o FFmpeg **não
morre** — recupera com Range-resume (PTS do áudio congela, vídeo avança =
dessincroniza acumulando) e, quando o demuxer desiste, o `-stream_loop` reabre
o áudio do byte 0 (áudio salta pro início do vídeo). O playout não enxergava:
`durationEnded` é relógio × duração do DB e `lastError` era display-only.
MediaMTX nunca teve 2 publishers (muxer é destruído antes do próximo) — a
divergência nasce no stream publicado, não no player.

**Correção (opção B aprovada — manter 1080p, cortar):**
- `engine.ts`: `isInputDeath(line)` — true só para `Error during demuxing` em
  `in#N` (morte terminal). Transitórios (`Read error`, `Stream ends prematurely`)
  seguem sendo só log (o retry de Range os recupera).
- `playout.ts`: stderr por-proc; morte no proc atual → `state.inputDead` → o
  tick corta o item (≤2 ticks), grava `result="error"` e avança a fila.

**Verificação**: 4 testes unitários com as linhas reais de produção; `tsc` limpo;
drill end-to-end (mídia cuja fonte morre → item cortado automaticamente, canal
se recupera sozinho); smoke pós-deploy (worker online, fila restaurada, m3u8 200
pelo front door). Cobertura honesta: o drill exercita o corte por morte do
processo; o caminho do `inputDead` (áudio morre com vídeo vivo — o caso real de
2 inputs) fica com o teste unitário + log `[playout] input morreu — corte no
próximo tick`, confirmável na 1ª ocorrência natural. Resíduo aceito na opção B:
drift de stalls recuperados até a morte terminal. Nota de operação: o
`docker-compose.yml` vive em `infra/` — `docker compose` da raiz falha com "no
configuration file provided" (e pipe com `tail` mascara o exit).
