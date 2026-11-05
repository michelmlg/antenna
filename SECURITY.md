# Segurança

## Modelo de uso

O Antenna foi projetado para rodar **dentro de uma rede local confiável**. Ele não tem
contas de usuário nem login, e assume que quem alcança o painel pode operar o canal.

- **Não exponha o painel nem as portas de mídia diretamente à internet.** Para acesso
  remoto, use uma VPN (WireGuard, Tailscale) ou um proxy reverso com autenticação na
  frente.
- **Defina `ADMIN_TOKEN`** no `.env` se outras pessoas na rede puderem abrir o painel. Com
  ele, toda rota que altera dados exige `Authorization: Bearer <token>`. Sem ele, qualquer
  pessoa que alcance a porta `3000` pode operar o canal.
- As portas internas (API `3001`, controle do playout `3100`, API do MediaMTX `9997`) **não
  são publicadas** pelo compose. Mantenha assim.
- O segredo `hlsCDNSecret` em `infra/mediamtx.yml` e `infra/nginx.conf` só dispensa a
  verificação por cookie do HLS para clientes como o Jellyfin. **Não é um mecanismo de
  autenticação.** Para usar um valor próprio, troque-o nos dois arquivos.

## Versões suportadas

O projeto está na série **0.x**. Só a versão mais recente da branch `main` recebe
correções.

## Reportando uma vulnerabilidade

**Não abra uma issue pública** para problemas de segurança.

Use o [reporte privado de vulnerabilidades do GitHub](https://github.com/michelmlg/antenna/security/advisories/new)
(aba _Security → Report a vulnerability_) e inclua:

- versão ou commit afetado;
- passos para reproduzir;
- impacto esperado e, se possível, uma sugestão de correção.

Como é um projeto pessoal, as respostas são feitas com o melhor esforço possível, sem prazo
garantido.
