# Contribuindo com o Antenna

Obrigado pelo interesse! Este guia cobre o ambiente de desenvolvimento, as verificações
antes de abrir um PR e as convenções do projeto.

Antes de mudar algo que pareça já decidido, leia a [arquitetura](docs/architecture.md) e o
[`AGENTS.md`](AGENTS.md), que lista as armadilhas operacionais reais do canal no ar.

## Reportando bugs e sugerindo melhorias

- **Bugs**: abra uma [issue](https://github.com/michelmlg/antenna/issues) com a versão
  (ou commit), o sistema operacional, os passos para reproduzir e os logs do container
  `playout` (`docker compose logs playout`).
- **Ideias**: abra uma issue descrevendo o problema que a ideia resolve antes de partir para
  o código.
- **Segurança**: não use issues públicas; veja [`SECURITY.md`](SECURITY.md).

## Ambiente de desenvolvimento

Requisitos: **Node ≥ 20**, **npm 11** e, para o playout, **FFmpeg**, **yt-dlp** e um
**MediaMTX** acessíveis.

```bash
npm install
cp .env.example .env    # o mesmo .env do Docker
npm run dev:api         # API Express (3001); cria/atualiza o banco antes
npm run dev:playout     # worker de exibição (3100)
npm run dev:web         # painel Vite (5173, proxy /api)
```

O caminho mais simples é subir só o MediaMTX pelo compose e rodar o resto no host:

```bash
docker compose up -d mediamtx
```

No dev local, `MEDIA_MTX_URL=rtsp://localhost:8554`; no compose, o endereço interno é fixo
(`rtsp://mediamtx:8554`). Não "conserte" um para o outro.

## Verificações antes do PR

```bash
npm run typecheck   # shared, database, core, api, playout (não cobre o web)
npm run lint        # eslint (core, shared, api, playout)
npm test            # vitest (packages/core e apps/playout)
npm run build:web   # valida mudanças em apps/web
```

- Mudou uma rota ou contrato? Atualize primeiro o schema Zod em `packages/shared`.
- Mexeu em seleção, filtros, grade ou EPG? Adicione testes em `packages/core`.
- Mexeu na classificação de erros do FFmpeg? Atualize os fixtures com saída real.

## Convenções

- **Idioma**: código e identificadores em inglês; domínio, comentários e documentação em
  português (ex.: `ativo`/`pausado`, `menos_reproduzidos`).
- **TypeScript estrito**, sem `any`. Erros da API no formato `{ error, code }`. Logs
  estruturados (pino).
- **Domínio** (seleção, filtros, grade, EPG, parsing) em `packages/core` como funções puras
  **com testes**. Os apps só orquestram I/O.
- **Frontend**: Tailwind com os tokens do [design system](docs/design-system.md), ícones
  `lucide-react` (nunca emoji), componentes de `components/ui`, TanStack Query + SSE.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) em português,
  com escopo: `feat(playout): …`, `fix(iptv): …`, `docs: …`.

## Estrutura do repositório

```text
apps/
  api/        API REST + SSE (Express + TS)        → src/modules/*.routes.ts
  playout/    worker: FFmpeg, yt-dlp, controle     → src/playout.ts, engine.ts, sync.ts
  web/        painel React + Vite + Tailwind       → src/features, src/components
packages/
  core/       domínio puro e testado
  shared/     contrato Zod API ↔ Web
  database/   schema Prisma + client
infra/        Dockerfiles, nginx, mediamtx.yml
docs/         documentação e capturas de tela
data/         banco SQLite e logo (criado em runtime, fora do git)
media/        arquivos locais de vídeo (fora do git)
```

## Licença

Ao contribuir, você concorda que sua contribuição será distribuída sob a
[licença MIT](LICENSE) do projeto.
