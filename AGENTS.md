# AGENTS.md — guia para agentes de código

Instruções para IA (e humanos) trabalharem neste repositório sem quebrar o canal no ar.

## O projeto em uma frase

**Antenna** é um canal de TV linear na rede local: um worker de playout escolhe
vídeos (YouTube via yt-dlp + arquivos locais) por gênero/grade semanal e publica
via FFmpeg → MediaMTX (HLS/RTSP); um painel web controla tudo.

- `README.md` — como rodar.
- `docs/PLANO.md` — plano de arquitetura + log de decisões versão a versão (leia antes de mexer em algo que pareça já decidido).
- `design.md` — design técnico + design system do frontend.

## Comandos

```bash
npm install                # workspaces (npm 11, node >= 20)
npm run dev:playout        # worker de exibição (porta 3100, controle interno)
npm run dev:api            # API Express (porta 3001)
npm run dev:web            # painel Vite (porta 5173, proxy /api)
npm test                   # vitest — SÓ packages/core e apps/playout
npm run typecheck          # tsc --noEmit (shared, database, core, api, playout — NÃO inclui web)
npm run lint               # eslint (core, shared, api, playout)
npm run build:web          # vite build (use para validar mudanças em apps/web)
npm run db:push            # prisma db push (cria/atualiza data/antenna.db)
npm run migrate:v1         # migração one-shot do projeto antigo (não rode de novo)
```

Docker (produção):

```bash
cd infra && docker compose up -d --build   # o compose vive em infra/ — da raiz falha ("no configuration file provided")
docker compose -f infra/docker-compose.yml build playout && \
docker compose -f infra/docker-compose.yml up -d playout   # atualizar yt-dlp (YouTube mudou algo)
```

## Mapa do monorepo

| Caminho             | O que é                                          | Notas                                                                                                                                 |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`          | API REST + SSE (Express + TS)                    | módulos em `src/modules/*.routes.ts`; `lib/` tem prisma, auth (Bearer opcional via `ADMIN_TOKEN`), logger pino, client HTTP do worker |
| `apps/playout`      | worker de exibição (sem HTTP público)            | `engine.ts` (FFmpeg), `sync.ts` (yt-dlp), `playout.ts` (tick 5s, fila estável), `control.ts` (HTTP interno :3100), `state.ts`         |
| `apps/web`          | painel (React 18 + Vite + Tailwind)              | `features/` (noar, generos, grade/, operacao), `components/` (LivePlayer, ui), `lib/` (api tipado, sse, icons)                        |
| `packages/core`     | **domínio puro, testado**                        | `selection.ts` (composer/mistura/anti-repetição), `filters.ts`, `schedule.ts` (bloco atual), `epg.ts` (XMLTV)                         |
| `packages/database` | schema Prisma + client + migração v1             | SQLite em WAL; `data/antenna.db`                                                                                                      |
| `packages/shared`   | contrato Zod único API↔Web                       | todo input da API valida aqui; a web tipa daqui                                                                                       |
| `infra/`            | docker-compose, Dockerfiles, nginx, mediamtx.yml | nginx :3000 é o front door (SPA + `/api` + `/hls`)                                                                                    |
| `data/`             | `antenna.db` (SQLite WAL)                        | estado compartilhado API ↔ worker                                                                                                     |
| `media/`            | arquivos locais do playout                       | montado em `/media` no container                                                                                                      |

## Arquitetura em 30 segundos

```
Web (React) ──HTTP──▶ API (:3001) ──HTTP interno──▶ Playout worker (:3100)
   ▲                    │ lê PlayoutState (SQLite) ◀── grava a cada tick (5s)
   └──────SSE /api/v1/events──────────────────────────┘
Playout: FFmpeg (2 inputs YouTube) ──▶ MediaMTX ──▶ HLS :8080 / RTSP :8554
nginx :3000 = front door (SPA, /api, /hls, /epg via API)
```

- **Comandos** (start/stop/next/playNow): API → worker via HTTP interno (rede do compose, não publicado).
- **Estado**: worker grava `PlayoutState` (linha única) a cada tick; API só lê → painel sobrevive a restart do worker.
- **SSE**: API empurra eventos (estado do playout, fim de sync); front invalida queries TanStack.
- **IPTV**: `GET /api/v1/iptv/channels.m3u` (M3U p/ Jellyfin) + `GET /api/v1/epg/guide.xml` (XMLTV gerado da grade em `packages/core/epg.ts`).

## Convenções

- **Idioma**: código/identificadores em inglês, domínio e comentários/docs em PT-BR (ex.: `ativo`/`pausado`, `menos_reproduzidos`).
- **Lógica de domínio** (seleção, filtros, grade, EPG, parsing) vai em `packages/core` como funções puras **com testes**. Apps só orquestram I/O.
- **Contrato**: mudou a API → mude o schema Zod em `packages/shared` primeiro; a web consome os tipos inferidos.
- **TypeScript strict**; sem `any`; erros da API padronizados `{ error, code }`; logs estruturados (pino).
- **Frontend**: Tailwind puro com tokens definidos em `apps/web/tailwind.config.js` (superfícies `base`/`panel`/`raised`/`line`/`element`, texto `fg`/`sub`/`dim`, `brand` âmbar, `live`/`danger`/`ok`) — nada de hex espalhado (cor de gênero é dado: derive tons com `lib/color.ts`); ícones `lucide-react` (nunca emoji; ícones de gênero = galeria fixa em `lib/icons.tsx`); kit próprio em `components/ui/` (importe de `components/ui`), com micro-interações padronizadas nos botões; toasts via `useToast`; TanStack Query + SSE (sem polling agressivo; queries compartilhadas em `lib/queries.ts`).
- **Grade/EPG**: geometria derivada de **minutos** (`dayOfWeek*1440 + start`); px só no render. Blocos não cruzam meia-noite; mínimo de 5 min; sobreposição é rejeitada (409 no PATCH/POST).
- **Commits**: convencionais em PT-BR com escopo — `feat(playout):`, `fix(iptv):`, `docs:` (veja `git log`).

## Armadilhas operacionais (leia de verdade)

1. **NUNCA escreva no SQLite a partir do host com containers no ar.** Host e container
   escrevendo simultâneo (bind mount Windows) já clobberou frames do WAL
   (`IOERR_SHORT_READ`). Jobs de dados: `docker exec` no container + PrismaClient,
   com critérios de match por `id` (nunca por título com acento).
2. **`docker compose` só de dentro de `infra/`** — o `docker-compose.yml` não está na raiz; pipe com `tail` mascara o exit code.
3. **Mudanças na grade valem a partir do próximo tick (5s)** — o vídeo em execução não é interrompido; a fila só se refaz quando o _programa_ (bloco) muda.
4. **Fila estável**: o worker gera lotes de 10 e consome em ordem (`queue.shift()`); regenera só quando bloco muda, fila esvazia ou boot. Não "recalcule a cada escolha" (reordenação sozinha = bug).
5. **ffmpeg com 2 inputs** (vídeo itag 137 + áudio webm): morte terminal de input é só
   `Error during demuxing` em `in#N` (`isInputDeath` em `engine.ts`) — isso corta o item.
   Erros transitórios (`Read error`, `Stream ends prematurely`) são só log (Range-resume recupera).
6. **yt-dlp é frágil por natureza** (YouTube muda): versão pinned no Dockerfile; para
   atualizar, rebuild do container `playout` (comando acima). Bot-check do YouTube é
   transitório — o canal se auto-recupera, não trate como bug de código.
7. **Vitest não cobre `apps/web`** e `typecheck` não cobre `apps/web` — valide o front com `npm run build:web`.
8. **`MEDIA_MTX_URL`** aponta para `rtsp://mediamtx:8554` no compose e `rtsp://localhost:8554` no dev local — não "conserte" um para o outro.
9. **Testes do engine usam linhas reais de stderr do ffmpeg** — ao mexer em classificação de erros, atualize os fixtures com saída de produção.

## Checklist antes de considerar pronto

- [ ] `npm run typecheck` limpo
- [ ] `npm run lint` limpo
- [ ] `npm test` verde (43 testes no momento)
- [ ] `npm run build:web` OK (se tocou em `apps/web`)
- [ ] Mudou rota/contrato? Atualizou `packages/shared` e o smoke dos endpoints (status codes esperados)?
- [ ] Mexeu em seleção/filtros/grade/EPG? Testes novos em `packages/core`?
- [ ] Em produção? Rebuild dos containers afetados (`api`, `playout` e/ou `web`) — código novo não entra com bind mount de código (só `data/` e `media/` são montados).
