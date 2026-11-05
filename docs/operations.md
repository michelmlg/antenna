# Operação e manutenção

## Comandos do dia a dia

```bash
docker compose ps                    # estado e saúde dos containers
docker compose logs -f playout       # logs do worker (ffmpeg, yt-dlp, falhas)
docker compose logs -f api           # logs da API
docker compose restart playout       # reinicia só a exibição (o painel continua)
```

O código fica dentro das imagens; só `data/` e `media/` são montados. Para aplicar uma
mudança de código, faça _rebuild_ do serviço afetado:

```bash
docker compose up -d --build api     # idem para web e playout
```

## Backup

Tudo o que importa fica em duas pastas (`DATA_DIR` e `MEDIA_DIR`):

| Pasta | Conteúdo |
| --- | --- |
| `data/` | `antenna.db` (SQLite em modo WAL: gêneros, fontes, mídias, grade, histórico) e `branding/` (logo) |
| `media/` | Seus arquivos de vídeo locais |

**Fazer backup:**

```bash
docker compose stop
cp -r data/ /caminho/do/backup/antenna-data-$(date +%F)
docker compose start
```

Copie a pasta inteira, incluindo os arquivos `-wal` e `-shm` se existirem.

**Restaurar:** pare os containers, devolva a pasta `data/` e suba de novo.

> [!CAUTION]
> **Nunca escreva no `antenna.db` pelo host com os containers no ar.** Escritas
> simultâneas de host e container (especialmente em bind mount no Windows) podem
> corromper o WAL (`IOERR_SHORT_READ`). Para scripts de dados, use `docker exec` dentro do
> container `api`.

## Atualizando o yt-dlp

O YouTube muda com frequência e, de tempos em tempos, os vídeos deixam de resolver até o
`yt-dlp` ser atualizado. A imagem do `playout` baixa a versão mais recente na _build_;
force uma _build_ sem cache para pegar a nova:

```bash
docker compose build --no-cache playout
docker compose up -d playout
```

## Saúde do canal

O worker classifica toda falha de reprodução:

| Causa | Exemplo | Reação |
| --- | --- | --- |
| **Infraestrutura** | MediaMTX inacessível | Repete o **mesmo** item; nunca vai para quarentena |
| **Do vídeo** | 403, URL não resolve, stream interrompido | Até 3 tentativas; depois **quarentena de 24 h** |
| **Transitória** | `Read error`, `Stream ends prematurely` | Só registra; a retomada por _Range_ recupera |

Um _disjuntor_ marca o container `playout` como `unhealthy` após falhas seguidas de
publicação. O bloqueio do YouTube (_bot-check_) é transitório e o canal se recupera
sozinho. Acompanhe tudo em **Atividade** no painel.

## Solução de problemas

| Sintoma | Causa provável / o que fazer |
| --- | --- |
| Player "conectando…" para sempre | Playout parado ou MediaMTX sem rede. Veja `docker compose ps` e os logs do `playout`. |
| MediaMTX "Up" mas o player não conecta | Problema de rede do Docker Desktop. Rode `docker compose up -d --force-recreate mediamtx`. |
| Container `playout` _unhealthy_ | Worker travado ou disjuntor do MediaMTX aberto (3+ falhas seguidas de publicação). Veja os logs. |
| Vídeos pulando / _bot-check_ do YouTube | Transitório: o canal se recupera. Se persistir, [atualize o yt-dlp](#atualizando-o-yt-dlp). |
| Nenhum vídeo toca | Gênero sem mídias elegíveis. Sincronize as fontes, revise filtros e a janela anti-repetição, ou defina um fallback. |
| Grade "não aplicou" | Vale no próximo ciclo (5 s). O vídeo atual não é cortado; a fila só é refeita quando o bloco muda. |
| Horários da grade errados | `TZ` no `.env` diferente do seu fuso. Ajuste e rode `docker compose up -d`. |
| Jellyfin não abre o canal | Desligue **Auto-loop live streams** e confira se o M3U/XMLTV usam o IP e a porta corretos. |
| `docker compose` diz "no configuration file provided" | Rode o comando na raiz do projeto, onde está o `docker-compose.yml`. |
| Erro `IOERR_SHORT_READ` no SQLite | Houve escrita no banco pelo host com containers no ar. Pare tudo e restaure um backup de `data/`. |

Ainda com problema? Abra uma
[issue](https://github.com/michelmlg/antenna/issues) com a versão, o sistema e os logs do
container `playout`.
