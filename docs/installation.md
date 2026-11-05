# Instalação

O Antenna roda como um conjunto de containers (`docker compose`). Funciona igual em Linux,
Windows e macOS.

## Requisitos

| Item | Mínimo recomendado |
| --- | --- |
| Sistema | Qualquer host com **Docker** e **Docker Compose v2** (PC, mini-PC, NAS, servidor doméstico) |
| CPU | 2 núcleos x86-64 modernos. Vídeos do YouTube são **transcodificados** pelo FFmpeg em tempo real |
| Memória | 1 GB livre para os containers |
| Disco | Algumas centenas de MB. O Antenna **não baixa** vídeos; só guarda metadados e o banco SQLite |
| Rede | Acesso à internet (YouTube) e à sua rede local (clientes) |

> [!TIP]
> Arquivos locais em H.264 são enviados sem recodificar (_copy_) e quase não usam CPU.

## Instalação com Docker Compose

```bash
git clone https://github.com/michelmlg/antenna.git
cd antenna
cp .env.example .env        # ajuste portas, fuso etc.
docker compose up -d --build
```

A primeira _build_ baixa FFmpeg e `yt-dlp` e leva alguns minutos. O banco
(`data/antenna.db`) é **criado automaticamente** no primeiro boot da API, e as atualizações
de schema também são aplicadas no boot. Não há nenhum passo manual de banco.

Confira se tudo subiu:

```bash
docker compose ps
```

Os containers `api` e `playout` devem aparecer como `healthy`.

## Endereços

| O quê | Endereço |
| --- | --- |
| Painel | `http://<ip-do-servidor>:3000` |
| HLS (mesma origem do painel) | `http://<ip-do-servidor>:3000/hls/antenna/index.m3u8` |
| RTSP (VLC) | `rtsp://<ip-do-servidor>:8554/antenna` |
| Lista M3U (IPTV) | `http://<ip-do-servidor>:3000/api/v1/iptv/channels.m3u` |
| Guia XMLTV (EPG) | `http://<ip-do-servidor>:3000/api/v1/epg/guide.xml` |

Se mudar `CHANNEL`, `WEB_PORT` ou `RTSP_PORT` no `.env`, ajuste o nome e a porta nessas
URLs. A tela **Assistir** do painel mostra os endereços já prontos para copiar.

## Primeiros passos

1. Abra o painel e vá em **Gêneros → Novo gênero**.
2. Adicione uma **fonte**: um canal do YouTube, uma busca ou um link avulso. Clique em
   **Sincronizar** para popular o acervo.
3. Em **Grade**, arraste o gênero da biblioteca para um dia e horário.
4. Em **Início**, clique em **Iniciar**. O canal entra no ar e o player mostra o stream.

O [guia do painel](user-guide.md) explica cada tela e os conceitos em detalhe.

## Atualizando

```bash
cd antenna
git pull
docker compose up -d --build
```

O código fica **dentro das imagens**; só `data/` e `media/` são montados. Por isso, toda
atualização de código exige _rebuild_. Seus dados são preservados e o schema do banco é
migrado no boot.

> [!IMPORTANT]
> Faça um [backup](operations.md#backup) de `data/` antes de atualizar entre versões 0.x.
> A API e o schema ainda podem mudar.

## Removendo

```bash
docker compose down        # para e remove os containers (dados preservados)
```

Para apagar tudo, remova também as pastas `data/` e `media/` (ou as definidas em
`DATA_DIR` e `MEDIA_DIR`).
