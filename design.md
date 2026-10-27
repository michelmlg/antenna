Objetivo: orientar a implementação de uma interface visual, moderna,
consistente e operacional para o Antenna, preservando a identidade dark
com acento âmbar e os contratos técnicos já existentes.
Este documento define como o frontend deve ser apresentado e
construído. Não autoriza remover funcionalidades existentes, alterar
contratos da API ou mudar o comportamento do playout sem uma decisão
explícita.

1. Direção visual
   O Antenna é um painel de operação de um canal de TV linear doméstico. A
   interface deve combinar a sensação de um player de mídia moderno com
   a clareza de um painel de controle profissional.
   Princípios
1. Visual primeiro: thumbnails, capas, imagens e previews devem
   ajudar a reconhecer o conteúdo rapidamente.
1. Hierarquia clara: o conteúdo principal e a ação mais importante
   de cada tela devem ser identificáveis em poucos segundos.
1. Densidade controlada: mostrar informação suficiente para operar
   o sistema sem transformar a interface em uma tabela apertada.
1. Dark sem monotonia: preservar o fundo escuro e o âmbar, criando
   profundidade com superfícies, bordas sutis, espaçamento e contraste
   --- não com muitas cores novas.
1. Estado sempre visível: transmissão, conexão, sincronização,
   salvamento e erros devem ter feedback claro.
1. Consistência: uma mesma ação ou entidade deve parecer e se
   comportar da mesma forma em todas as telas.
1. Sem decoração inútil: não adicionar gráficos, métricas, badges
   ou animações sem função real.
   Personalidade

- Moderna, visual, focada em mídia e operação.
- Superfícies escuras e discretas, com imagens coloridas como
  principal fonte de riqueza visual.
- Âmbar usado para ações primárias, seleção e estado ao vivo --- não
  como cor de todos os elementos.
- Cantos moderadamente arredondados, bordas discretas e tipografia
  legível.
- Animações curtas e funcionais; evitar efeitos exagerados,
  glassmorphism excessivo e gradientes decorativos.

2. Identidade visual e tokens
   Identidade v3 (azul-ardósia + âmbar, minimalista). Os valores ficam
   centralizados no tema do Tailwind; não espalhar hexadecimais pelos
   componentes.

| Token   | Valor   | Uso                                                  |
| ------- | ------- | ---------------------------------------------------- |
| base    | #0F141B | Fundo geral da aplicação                             |
| panel   | #151B24 | Sidebar, cards, modais                               |
| raised  | #1C2430 | Campos, hover, itens dentro de cards                 |
| line    | #263040 | Bordas e divisórias                                  |
| element | #374151 | Controles neutros (switch desligado, segmento ativo) |
| fg      | #E5E7EB | Texto principal                                      |
| sub     | #9CA3AF | Texto secundário                                     |
| dim     | #6B7280 | Metadados e dicas                                    |
| brand   | #FFC83D | Ação primária, navegação ativa, seleção, foco        |
| live    | #F05252 | Selo AO VIVO (luz de estúdio)                        |
| danger  | #F05252 | Erros, conflitos e ações destrutivas                 |
| ok      | #34D399 | Saúde/sucesso                                        |

Marca: `components/Logo.tsx` (torre em "A" com ondas, `currentColor`),
também como marca d'água do canal no player.

Aplicação das cores

- base forma o plano principal; panel separa áreas funcionais, sem
  card dentro de card sem necessidade; raised é o nível interativo.
- brand deve ser aplicado de forma seletiva: botão primário, item de
  navegação ativo e seleção. AO VIVO usa live, não brand.
- dim não deve ser usado para texto essencial.
- Transparências podem usar modificadores do Tailwind, como
  bg-brand/10 e border-line, sem inventar tons hexadecimais. A cor do
  gênero é dado do usuário: tons derivados vêm de `lib/color.ts`
  (`alpha`, `readableOn`).
- Movimento: interações curtas e consistentes (botão primário sobe 1px
  com brilho âmbar no hover, pressionar encolhe 3%, indicadores de
  tabs/segmentos deslizam, modais e menus entram com pop-in). Tudo
  respeita prefers-reduced-motion.
- Para erro, sucesso e aviso, usar tokens semânticos centralizados no
  tema. Não reutilizar âmbar como se fosse erro. Essas cores
  semânticas são exceções funcionais e devem ser usadas com moderação.
- Não comunicar estados exclusivamente por cor: combinar cor com
  texto, ícone ou forma.
  Profundidade e superfícies
  Construir hierarquia com poucos níveis:

1. Canvas: background.
2. Navegação e painel: surface ou uma variação semântica
   centralizada.
3. Item interativo: superfície ligeiramente destacada via
   tokens/transparências e borda sutil.
4. Hover/seleção: realce discreto; o âmbar é reservado para seleção
   importante e ação primária.
   Evitar bordas fortes em todos os elementos, sombras pesadas e cartões
   aninhados desnecessariamente.
5. Tipografia, ícones e espaçamento
   Tipografia
   Definir uma escala reutilizável para:

- Título da página: text-xl ou equivalente, peso semibold.
- Título de seção: text-base ou text-lg, peso semibold.
- Título de conteúdo: text-sm ou text-base, peso medium/semibold.
- Texto de interface: text-sm.
- Metadados: text-xs, mantendo contraste legível.
- Valores operacionais e horários: números alinhados e fáceis de
  comparar.
  Evitar que toda a interface use texto minúsculo. Títulos, nomes de
  vídeos e ações importantes devem permanecer legíveis. Usar truncamento
  apenas quando necessário e oferecer acesso ao conteúdo completo por
  tooltip, detalhe ou outra interação apropriada.
  Ícones
- Usar lucide-react exclusivamente; nunca emojis como ícones de
  interface.
- Manter tamanhos consistentes: ícones de navegação e botões
  geralmente entre 16 e 20 px; ícones de destaque podem ser maiores.
- Botões apenas com ícone precisam de nome acessível e tooltip quando
  a ação não for óbvia.
- Reutilizar GenreIcon e o catálogo curado em lib/icons.tsx.
  Espaçamento
- Adotar escala baseada em múltiplos de 4 px.
- Usar espaçamento consistente entre título, descrição, filtros,
  conteúdo e ações.
- Preferir espaço interno suficiente para separar grupos de controles;
  não comprimir tudo para exibir mais itens.
- Evitar grandes áreas vazias sem intenção, especialmente abaixo do
  player.
- Usar alinhamentos comuns entre painéis e cabeçalhos.
  Cantos e bordas
- Campos, botões e badges: raio pequeno a médio.
- Cards e painéis: raio médio, com o mesmo padrão em todas as telas.
- Usar bordas sutis para separar superfícies, não para contornar cada
  elemento individualmente.
- Evitar misturar muitos raios, sombras e estilos de contorno.

4. Estrutura global da aplicação
   Navegação lateral
   Manter navegação persistente com as quatro áreas existentes:
1. No Ar
1. Grade
1. Gêneros
1. Operação
   Requisitos:

- Sidebar com largura consistente no desktop, ícone Lucide e rótulo
  legível.
- Marca Antenna compacta no topo; evitar gastar altura excessiva com
  branding.
- Item selecionado com fundo âmbar translúcido, texto de alto
  contraste e indicador visual discreto.
- Estados hover e focus-visible claros.
- Indicador de transmissão no rodapé pode permanecer, mas deve ser
  compacto e não competir com a navegação.
- Em telas estreitas, transformar a navegação em drawer ou padrão
  móvel apropriado; não simplesmente reduzir a sidebar até ficar
  ilegível.
  Cabeçalho da página
- Cabeçalho compacto com título da área e, quando necessário, ações
  contextuais.
- Não repetir informações que já estejam claramente visíveis no
  conteúdo.
- Relógio pode permanecer discreto; não deve competir visualmente com
  o título.
- O conteúdo deve começar com espaçamento consistente abaixo do
  cabeçalho.
  Área principal
- Usar layout fluido com limites de largura e proporções adequadas à
  tela.
- Evitar uma única coluna excessivamente larga quando o conteúdo pode
  ser dividido em áreas funcionais.
- Evitar que painéis importantes fiquem parcialmente escondidos por
  causa da altura do viewport.
- Considerar min-width: 0 em filhos de grid/flex para impedir
  overflow por textos ou players.

5. Tela "No Ar" --- principal prioridade visual
   A tela atual dá muito espaço ao player, mas deixa uma área vazia abaixo
   dele e comprime informações importantes no painel direito. O novo layout
   deve usar melhor a altura disponível e criar uma hierarquia mais clara
   entre transmissão, conteúdo atual e fila.
   Layout desktop
   Usar uma composição em duas colunas:

- Coluna principal (aproximadamente 2/3 da largura): player e
  informações do stream.
- Coluna lateral (aproximadamente 1/3): status, item atual,
  controles e fila.
- As proporções devem ser flexíveis e ajustadas ao espaço real; não
  fixar larguras rígidas que causem overflow.
- A coluna lateral deve ter scroll próprio quando a fila ultrapassar a
  altura disponível, preservando o acesso ao player e aos controles.
- O layout deve ocupar a altura útil da janela sem criar uma grande
  área vazia sob o player.
  Player
- Usar uma moldura de player limpa, sem camadas decorativas
  desnecessárias.
- Preservar a proporção 16:9 e preencher o espaço de forma adequada,
  sem distorcer o vídeo.
- O indicador AO VIVO deve ficar sobre o player no canto superior
  esquerdo, com fundo âmbar e texto legível.
- Os controles do player devem aparecer sobre uma camada inferior em
  degradê escuro discreto, apenas para garantir legibilidade.
- Controles como volume, reconectar e fullscreen devem ter área
  clicável adequada, tooltip e foco visível.
- Não manter controles permanentemente chamativos quando puderem ser
  discretos; o estado AO VIVO deve continuar fácil de localizar.
- Os estados connecting/live/stalled/offline devem alterar texto e
  indicador visual, sem depender exclusivamente de cor.
- Ao perder conexão, mostrar estado claro e ação de reconexão sem
  ocultar informação útil.
  Informações do stream
- Mostrar HLS e RTSP em uma área compacta abaixo do player, com
  rótulos claros.
- Usar tipografia monoespaçada ou tratamento visual próprio para URLs,
  permitindo copiar facilmente.
- Não deixar URLs e detalhes técnicos competir com o vídeo.
- Quando houver falha, apresentar a mensagem de erro próxima do estado
  relevante e evitar mensagens técnicas longas em vermelho sem
  hierarquia.
  Painel lateral: ordem visual
  Organizar o conteúdo nesta ordem:

1. Estado da transmissão: AO VIVO, offline ou reconectando; incluir
   status do worker se for relevante.
2. Conteúdo atual: thumbnail pequena ou arte relacionada, gênero,
   título, canal e tempo decorrido/restante.
3. Progresso: barra fina com posição atual e duração; garantir que
   a semântica de tempo seja clara para conteúdo ao vivo ou vídeo.
4. Controles principais: iniciar/retomar, parar e pular. A ação
   primária deve refletir o estado real do sistema. Não mostrar
   "Iniciar" como ação principal se o playout já estiver ativo.
5. Próximos na programação: fila visual com thumbnails, título,
   gênero e duração.
   Fila de próximos itens

- Cada item deve funcionar como uma linha/cartão compacto com
  thumbnail consistente, número da posição, título, gênero e duração.
- O título é o elemento textual prioritário; gênero e duração são
  metadados secundários.
- Usar thumbnail com proporção consistente (preferencialmente 16:9),
  sem deformar imagens.
- Reservar ícones de ação para ações reais, como tocar agora ou abrir
  o vídeo. Usar tooltip e rótulos acessíveis.
- A fila deve ter hover discreto e foco visível.
- O item em reprodução e o item selecionado devem ter tratamentos
  distintos.
- Evitar badges grandes repetidos em cada linha. Usar uma tag de
  gênero compacta.
- Manter a quantidade de informação útil sem fazer a linha ficar tão
  baixa que thumbnails e texto percam legibilidade.
- Se não houver próximos itens, mostrar um estado vazio explicativo e
  a ação útil disponível.
  Comportamento responsivo
- Desktop largo: player e painel lateral lado a lado.
- Tablet ou janela estreita: reduzir progressivamente a proporção da
  lateral; se a leitura ficar comprometida, mover a fila abaixo do
  player.
- Mobile: player primeiro, controles e estado logo abaixo, fila em
  seguida; evitar uma coluna lateral estreita.
- Não remover funcionalidades essenciais no layout móvel.

6. Tela "Grade"
   A grade é uma ferramenta de edição temporal. Sua prioridade é a
   legibilidade de horários e blocos, não a decoração.

- Manter as sete trilhas horizontais Dom--Sáb e a régua de horas
  sticky.
- Preservar dnd-kit, resize com snap de 5 minutos, mínimo de 5
  minutos e geometria em minutos.
- Arrastar gênero da biblioteca: o bloco cai com o INÍCIO no ponto de
  soltura (snap 5 min), com guia vertical na coluna alvo, horário na
  régua e cursor de cópia; o preview visível é o que grava (WYSIWYG).
- O selo "no ar" aparece somente no bloco em execução (dia + faixa
  contendo o minuto atual), nunca em todos os blocos do gênero.
- Diferenciar visualmente gênero, seleção, edição pendente e conflito:
  - gênero: cor já atribuída ao gênero, respeitando contraste;
  - selecionado: anel/contorno claro e consistente;
  - salvamento pendente: contorno tracejado ou indicador
    equivalente;
  - conflito: estado de erro claramente identificado, com texto ou
    ícone além da cor.
- Não usar gradientes fortes que reduzam a legibilidade dos títulos.
- Os blocos devem mostrar o nome do gênero quando houver espaço; em
  blocos pequenos, usar truncamento e tooltip.
- Não há painel lateral de propriedades: a edição é manipulando a
  grade (arrastar, alças) e os mini-botões do bloco selecionado
  (duplicar/excluir); atalhos de teclado cobrem o resto.
- Bloco de gênero removido (após aplicar um perfil): fundo
  desaturado, borda tracejada e tooltip explicando que o horário cai
  na seleção automática.
- A toolbar da grade é moderna e segmentada: undo/redo, perfis
  (salvar grade atual, aplicar, excluir, limpar grade), zoom com botão
  "auto" e ação primária de programar. Sem filtro de dia — as sete
  trilhas são sempre visíveis.
- Perfis de programação: salvar a semana atual com um nome e aplicar
  qualquer perfil para substituir a grade inteira (com confirmação);
  aplicar reseta o undo/redo local.
- O salvamento deve apresentar estados "salvando", "salvo" e "erro";
  erros devem permitir entender e corrigir o problema.
- Undo/redo e atalhos de teclado devem permanecer disponíveis e ter
  indicação visual quando apropriado.
- Em telas abaixo de 768 px, usar GradeMobile.tsx com chips de dia e
  agenda com campos de horário; não exigir drag-and-drop no mobile.

7. Tela "Gêneros"
   Esta tela organiza a biblioteca de conteúdo. Deve ser visual, orientada
   por thumbnails e facilitar a identificação de cada gênero.
   Visão geral

- Exibir gêneros em grid responsivo de cards.
- Cada card deve priorizar thumbnail ou composição de imagens
  representativas, nome, ícone, cor e quantidade/estado de conteúdo
  quando esses dados estiverem disponíveis.
- Não inventar estatísticas para preencher espaço.
- Manter ações de editar e abrir detalhes fáceis de encontrar,
  preferencialmente visíveis no hover e sempre acessíveis por teclado.
- Diferenciar gênero ativo e pausado com texto e estado visual.
- Usar proporções consistentes para thumbnails e evitar cards de
  alturas muito diferentes.
  Detalhes do gênero
  Organizar a gestão em seções claras:

1. Resumo do gênero: nome, ícone, cor e estado.
2. Fontes: canal, busca, busca dentro do canal e vídeo manual.
3. Sincronização: ação de sincronizar, estado em andamento e
   resultado da última execução, se disponível.
4. Conteúdo: grid de thumbnails com título, canal, duração e
   estado.
5. Mistura: editor visual dos ingredientes da mistura, preservando
   a semântica atual de escopo e contagem.
6. Simulador da fila: resultado legível e visual da seleção
   prevista.
   - O grid de conteúdo deve priorizar imagens, sem sacrificar ações de
     edição ou exclusão.
   - Filtros e ordenação devem ficar próximos da biblioteca.
   - Ações destrutivas devem ser confirmadas quando houver risco de perda
     de configuração ou conteúdo.
   - Formulários devem explicar validações junto ao campo relevante.
   - Não criar uma página separada para mídias ou programas sem decisão
     explícita: a gestão continua centralizada no gênero, conforme a
     arquitetura atual.
7. Tela "Operação"
   Esta tela deve ajudar a diagnosticar o sistema rapidamente.
   Hierarquia
8. Estado geral do playout.
9. Estado do worker e do stream.
10. Erros e alertas ativos.
11. Histórico de sincronizações e eventos.
12. Detalhes técnicos sob demanda.
    Padrões

- Usar cards de status somente para informações operacionais reais.
- Erros ativos devem ser fáceis de localizar, com mensagem
  compreensível, horário e contexto disponível.
- Diferenciar estado atual de histórico.
- Histórico deve ser legível, com data, origem, resultado e duração
  quando os dados existirem.
- Detalhes técnicos longos podem ficar recolhidos inicialmente, mas
  devem continuar acessíveis.
- Estados de carregamento e ausência de histórico devem ser tratados
  explicitamente.
- Não usar vermelho em toda a tela apenas porque existe uma mensagem
  de erro isolada.

9. Componentes compartilhados
   Continuar usando os componentes próprios em components/ui.tsx e
   ampliar o conjunto apenas quando necessário.

Os componentes devem oferecer API visual e comportamental consistente
para:

- Button: primary, secondary, subtle/ghost e danger.
- IconButton: ação por ícone, tooltip e nome acessível.
- Card/panel: superfície e espaçamento consistentes.
- Badge/status: rótulos compactos para estado.
- Input, select e textarea: label, ajuda, erro e disabled.
- Modal/dialog: título, descrição, ações e comportamento de teclado.
- Tooltip: para ícones ou textos truncados quando necessário.
- Toast/notification: sucesso, aviso e erro.
- Skeleton/loading: carregamento sem mudanças bruscas de layout.
- EmptyState: explicação breve e próxima ação útil.
- ConfirmDialog: confirmação proporcional ao risco.
- Thumbnail: proporção e tratamento de fallback consistentes.
  Não criar um novo componente para uma variação mínima se um componente
  existente puder ser estendido de forma limpa.

10. Estados de interface e feedback
    Toda operação assíncrona deve comunicar o que está acontecendo.
    Estados a considerar

- Inicial/carregando.
- Vazio/sem conteúdo.
- Sucesso.
- Erro recuperável.
- Erro que exige intervenção.
- Operação pendente.
- Desabilitado por regra de negócio.
- Desconectado/reconectando, no caso de transmissão.
  Regras
- Não deixar botões sem feedback após o clique.
- Desabilitar ações duplicadas enquanto uma operação não puder ser
  repetida com segurança.
- Preservar os dados preenchidos quando uma validação falhar.
- Mostrar erros perto do contexto que os originou.
- Usar toast para confirmação breve, não como único local para
  informações essenciais.
- Para ações otimistas, implementar rollback quando houver falha,
  respeitando o comportamento existente.
- Nunca representar um comando como concluído antes de o sistema
  confirmar seu resultado.

11. Responsividade
    A interface deve funcionar em diferentes larguras, e não apenas caber em
    uma captura de tela.

- Usar breakpoints consistentes com Tailwind e validar os limites
  reais dos componentes.
- Definir comportamento específico para navegação, player, fila,
  grids, formulários, tabelas e painéis.
- Evitar larguras fixas que funcionem apenas no viewport de
  desenvolvimento.
- Permitir scroll interno somente quando isso melhorar a usabilidade;
  evitar múltiplas áreas de scroll aninhadas sem necessidade.
- Em telas pequenas, priorizar leitura e ações essenciais,
  reorganizando o layout em vez de simplesmente encolher todos os
  elementos.
- Testar pelo menos 1440 px, 1024 px, 768 px e 390 px de largura.
- Verificar zoom do navegador e textos longos, especialmente títulos
  de vídeos e nomes de canais.

12. Acessibilidade

- Usar HTML semântico e controles nativos sempre que apropriado.
- Garantir navegação por teclado e foco visível via focus-visible.
- Associar labels aos campos.
- Fornecer nome acessível a botões que exibem apenas ícones.
- Manter contraste adequado em texto, bordas importantes e estados de
  foco.
- Não depender exclusivamente de cor para sinalizar erro, seleção ou
  status.
- Respeitar prefers-reduced-motion em animações não essenciais.
- Garantir que modais gerenciem foco e fechamento por teclado
  adequadamente.
- Evitar áreas clicáveis excessivamente pequenas.

13. Motion e microinterações

- Usar transições curtas e discretas para hover, foco, seleção e
  abertura de painéis.
- Animações devem esclarecer uma mudança de estado, não competir com o
  conteúdo.
- Não animar continuamente elementos decorativos.
- O pulso do indicador AO VIVO deve ser discreto e respeitar redução
  de movimento.
- Não animar a geometria da grade durante operações que possam
  prejudicar precisão de drag, resize ou leitura.
- Preservar estabilidade visual durante atualização de dados via SSE e
  TanStack Query.

14. Regras técnicas do frontend que não devem regredir

- Stack atual: React 18, Vite e Tailwind.
- Usar lucide-react para ícones.
- Usar TanStack Query e SSE para invalidação de dados, sem introduzir
  polling agressivo.
- A grade não deve usar refetchInterval que interfira em drag/undo.
- Preservar contratos da API e os schemas Zod em packages/shared.
- Preservar LivePlayer com hls.js e seus estados connecting,
  live, stalled e offline.
- Preservar reconexão automática com backoff e atualização de mídia
  via SSE.
- Preservar controles de playout e ações existentes.
- Preservar a geometria da grade em minutos, sem armazenar posições em
  pixels.
- Preservar conflito de agenda validado no servidor, incluindo
  tratamento de HTTP 409.
- Não introduzir uma segunda biblioteca de componentes sem
  justificativa e decisão explícita.
- Não duplicar estado remoto localmente sem necessidade.
- Não alterar regras de domínio, seleção, anti-repetição,
  sincronização ou programação como parte de uma melhoria visual.

15. Regras para agentes de programação por IA
    Antes de implementar uma tela:
1. Ler esta seção e a especificação da tela relevante.
1. Inspecionar os componentes e padrões já existentes.
1. Identificar o que pode ser reutilizado.
1. Apresentar um plano curto quando a mudança for ampla.
1. Implementar a melhoria sem reescrever áreas não relacionadas.
1. Manter funcionalidades, contratos, atalhos e estados existentes.
1. Executar build e testes disponíveis.
1. Revisar a interface em viewport largo e estreito.
1. Corrigir overflow, desalinhamentos, contraste, estados ausentes e
   feedback de ações.
   Não fazer

- Não redesenhar o sistema inteiro para corrigir uma tela pequena.
- Não trocar a paleta definida neste documento.
- Não adicionar dados fictícios, estatísticas inventadas ou controles
  que não funcionam.
- Não substituir imagens reais por placeholders quando os dados já
  oferecem thumbnails.
- Não adicionar gradientes, sombras, bordas ou animações apenas para
  "parecer moderno".
- Não remover funcionalidades para simplificar o layout.
- Não considerar concluído apenas porque o build passou.

16. Checklist de aceite visual
    Uma alteração visual só está pronta quando os itens aplicáveis forem
    verificados.

- [ ] Mantém a paleta e os tokens do Antenna.
- [ ] Tem hierarquia visual clara.
- [ ] Usa espaçamento, tipografia, bordas e raios consistentes.
- [ ] Prioriza thumbnails e conteúdo visual onde isso melhora a
      identificação.
- [ ] Não cria cartões aninhados ou decoração desnecessária.
- [ ] Implementa estados de carregamento, vazio, sucesso e erro
      relevantes.
- [ ] Todas as ações visíveis funcionam e dão feedback.
- [ ] Textos longos não quebram o layout.
- [ ] Não existe overflow horizontal acidental.
- [ ] Navegação por teclado e foco visível funcionam.
- [ ] Funciona em desktop e mobile.
- [ ] Build e testes aplicáveis passam.
- [ ] Contratos da API e comportamentos de domínio foram preservados.

17. Resultado esperado
    O Antenna deve parecer um produto de mídia bem acabado: escuro, visual e
    moderno, com thumbnails como elemento importante, âmbar usado com
    intenção, navegação previsível e informações operacionais fáceis de
    compreender.

A interface deve dar destaque ao que está no ar, tornar a fila fácil de
percorrer, transformar a grade em uma ferramenta precisa de programação
e fazer a biblioteca de gêneros parecer uma coleção visual de conteúdo.
A sofisticação deve vir da composição, da consistência e do feedback ---
não de excesso de efeitos.
