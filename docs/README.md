# Documentação do Antenna

Guias para instalar, usar, operar e contribuir com o Antenna.

## Para quem vai rodar o canal

| Guia | Conteúdo |
| --- | --- |
| [Instalação](installation.md) | Requisitos, instalação com Docker, primeiros passos, atualização e remoção |
| [Configuração](configuration.md) | Variáveis do `.env`, portas, fuso horário e token de administração |
| [Guia do painel](user-guide.md) | As telas, os conceitos (gênero, fonte, mistura, grade) e como montar a programação |
| [Assistindo ao canal](clients.md) | Navegador, VLC, Jellyfin e Plex (TV ao vivo + guia EPG) |
| [Operação e manutenção](operations.md) | Backup, atualização do `yt-dlp`, logs, saúde do canal e solução de problemas |

## Para quem vai mexer no código

| Guia | Conteúdo |
| --- | --- |
| [Arquitetura](architecture.md) | Componentes, fluxos, tratamento de falhas e decisões de projeto |
| [Contribuindo](../CONTRIBUTING.md) | Ambiente de desenvolvimento, verificações, convenções e estrutura do repositório |
| [Design system](design-system.md) | Direção visual, tokens e padrões do painel web |
| [`AGENTS.md`](../AGENTS.md) | Guia operacional para agentes de código (armadilhas reais de produção) |

## Políticas

- [Segurança](../SECURITY.md) — modelo de ameaça (LAN), `ADMIN_TOKEN` e como reportar vulnerabilidades.
- [Aviso legal](disclaimer.md) — relação com o YouTube e o `yt-dlp`, uso responsável.
- [Licença MIT](../LICENSE).
