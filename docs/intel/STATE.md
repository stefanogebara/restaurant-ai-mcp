# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-10-26. Janela: desde `edda6b0` (04/09,
> exclusive, já coberto pela rodada anterior) até `f6ab5db` (HEAD de `main`,
> 21/10) — 61 commits não-merge (78 no total, contando merges). Fora de
> `main`: 9 PRs abertos (3 de dependabot, 2 drafts antigos de agosto/setembro,
> **3 rodadas inteiras de `/intel` represadas** — ver "em voo") e ~45 branches
> remotas sem PR aberto, a maioria já absorvida por squash-merge sob outro
> nome de branch ou abandonada. Reescrito a cada `/intel`. Fonte: o git e o
> GitHub, não o config.

## O parágrafo

Seis semanas, quatro frentes, e por baixo delas um problema operacional que a
própria ferramenta de intel documentou contra si mesma. A primeira frente é o
piloto do Racha na Olímpia: em 12/09 a ponte `api/racha-notify.js` que devia
alertar o fundador sobre eventos de dinheiro (desvio de conciliação, disputa,
estorno falho) **recusava todo alerta com 400** porque só aceitava o schema do
aviso de recebedor — três rodadas no mesmo dia (`38e9428`, `664c801`,
`f89f4f6`) corrigiram a lista de eventos (os nomes certos vieram de um censo
no router do Racha, não de suposição) e um `200` que pulava os dois canais de
entrega parou de ser lido como "entregue". Em 27–30/09 a Olímpia ganhou uma
campanha de indicação escolhida à mão (piloto Racha, PR #161) e passou por
quatro rodadas de revisão de segurança (PRs #162, #164) porque o detector de
"sim" na confirmação de indicação lia negação como confirmação — "não pode
chamar", "chama ele não", "sim, mas ele não quer" todos liam como sim; a
correção final trocou heurística por lista FECHADA de mensagens inteiras
normalizadas, com todas as frases das duas rodadas de ataque gravadas em
teste. A segunda frente é a landing: em 25/09 o herói fotográfico foi
publicado em produção por uma rota de artefato estático
(`client/prepare-landing-output.cjs`, commit `d38c5b5`), substituindo o
`index.html` físico da raiz — mas o PR #140, aberto desde 06/09 com uma
implementação **diferente** do mesmo herói (componentes React
`PhotographicHero`/`LiveServiceCanvas`/`CinematicServiceStory`) e a lição das
"oito rodadas sem a nota mexer", nunca foi mesclado nem fechado; hoje as duas
versões coexistem como histórico, e não é óbvio sem olhar que a que está em
produção não é a do PR aberto — candidato a fechar sem merge, mas é chamada do
Stefano. A terceira, e a maior em volume, é a auditoria de "verdade na
interface": em 11–12/10, instruído a não parar a cada entrega e seguir para a
superfície seguinte, o pipeline rodou 14+ PRs (#173 a #197) varrendo quase
todo o `host-dashboard` atrás de número apresentado como fato que não vinha de
lugar nenhum. O padrão repetido, registrado em `tasks/lessons.md`
("Afirmação sobre o produto se rastreia até o mecanismo, não até um proxy"):
risco de churn mostrado como "100% de probabilidade" quando a função satura em
0–100 heurístico; valor futuro projetado por 2 anos sem desconto de afastamento
exibido como receita (R$ 23.400 para alguém com duas visitas); card de
WhatsApp dizendo "Conectado" para um número que a Meta não confirma; convite de
equipe anunciado como enviado sem o provedor ter aceitado; teste de WhatsApp
que virava pesquisa a cada clique; filtro de período que a lista ignorava
enquanto os números o aplicavam; paginação que concatenava `offset`/`limit`
como string (segunda página de 50 buscava 5.000 linhas); e dois endpoints
mortos por trás de tudo isso — `/api/revenue` (colunas que não existem desde
o schema atual) e o `customer-dna` global (lia `customer_behavioral_profiles`
sem `restaurant_id`) — fechados com 410 em vez de apagados. A quarta frente é
WhatsApp, em duas ondas de outubro: 16–19/10 endureceu a própria admissão de
reserva (`docs/plans/2026-10-16-whatsapp-booking-integrity.md`) — uma função
transacional no Postgres (`supabase/migrations/20261016184431_whatsapp_booking_integrity.sql`)
fechou uma condição de corrida de capacidade explorável por retry de IA ou
replay de webhook (PRs #201–204), e no dia seguinte (#205) fechou que
**qualquer um** com o `reservation_id` podia cancelar ou alterar a reserva de
**outro** hóspede só porque o número do telefone chegava como argumento do
modelo, não verificado contra o dono real. 20–21/10 atacou a confusão entre
número compartilhado da plataforma e número dedicado por restaurante: sessões
de entrada isoladas por receptor com recuperação de retry (#208), paginação
do limite de 10 linhas da Meta no seletor de restaurante do número
compartilhado — com 19 restaurantes elegíveis a primeira versão mandava as 19
numa lista só, inutilizável (#209), token da Meta tirado da URL do probe de
status para o cabeçalho `Authorization` (#212), leitura honesta de um
receptor dedicado já existente mesmo sem fluxo de provisionamento salvo
(#211), o toggle de "notificações" parou de escrever no registro central de
roteamento (#210), e o estado de conexão na tela parou de depender da leitura
de status de entrega (#213). Por baixo de tudo isso: três rodadas inteiras do
próprio pipeline de intel (09-14, 09-21, 09-28) nunca chegaram a `main` — as
duas primeiras (PRs #153, #155) foram fechadas sem merge, e a terceira (#163)
está aberta e sem revisão há 21 dias segundo o próprio corpo do PR, que já
inclui candidatos a `known_gaps` (fila do WhatsApp booking integrity não
cobre dashboard/web/voz/Google; confirmação de saída do WhatsApp segue
fire-and-forget) e uma correção mecânica de caminho que nunca chegou ao
`intel.config.json` real.

## O que shipou

- **Racha-notify deixa de recusar todo alerta de dinheiro** (12/09, três
  commits no mesmo dia: `38e9428`, `664c801`, `f89f4f6`) — a rota só aceitava
  o schema do aviso de recebedor (`status`) e devolvia 400 para
  `reconcile_drift`, `reconcile_heartbeat` (cuja ausência É o alarme),
  disputa, estorno falho e `CRON_SECRET` ausente; nenhum alerta de dinheiro do
  Racha jamais chegou a um humano. A segunda rodada corrigiu a lista de
  eventos (vinha de suposição sobre o literal do `kind`, não do censo real do
  router) e removeu cinco "eventos" que eram na verdade códigos de achado de
  conciliação. A terceira corrigiu o ramo do recebedor: um `200` com os dois
  canais de entrega pulados (Resend fora) fazia a Racha persistir a transição
  de estado como se tivesse entregue, matando o retry — dono de restaurante
  recusado no KYC nunca saberia.
- **Prospecção — dois acertos de mira antes do piloto** (#146, #148) — plural
  ("restaurantes", "cafés") não é mais rota de fuga do filtro de ICP singular;
  fila de prospecção que secava em 2 leads gerava silêncio indistinguível de
  dia bom, agora sinalizado.
- **Piloto do Racha na Olímpia + 2 rodadas de segurança na confirmação de
  indicação** (PRs #161, #162, #164; commits `49868c5` a `5366f86`) —
  campanha de lista fechada escolhida à mão, com template próprio e fora do
  filtro de ICP geral (indicado nasce já com consentimento de contato
  informado, não com a intro padrão "achei vocês pelo Google" — ponto de
  LGPD). O detector de confirmação passou por duas ondas de ataque adversarial
  e acabou como lista FECHADA de mensagens inteiras normalizadas (negação não
  se enumera: toda tentativa de listar formas de "não" perdia para uma nova
  forma). `registrar_responsavel` deixava de responder no handoff; corrigido
  para que sim/não claros com indicação pendente virem decisão determinística
  em `confirmacao-indicacao.js` em vez de cair no silêncio do fundador.
- **Landing: herói fotográfico em produção** (25/09, `d38c5b5` e
  correções `57e4c2c`/`e99d9f0`/`1d3d18c`) — publicado por rota de artefato
  estático que substitui o `index.html` físico da raiz, preservando as rotas
  React como fallback; regressão de navegação via `<Link to="/">` dentro do
  SPA (mantinha o roteador em memória e revelava a landing antiga) corrigida
  forçando reload do documento. Dia da cena de demo alinhado com a história de
  Marina (era "Sábado" em uma tela, quinta-feira nas outras).
- **A auditoria de verdade na interface, 14+ PRs em dois dias** (#173–#197,
  11–12/10; lista completa em `tasks/todo.md`) — tema único, documentado em
  `tasks/lessons.md` ("Uma entrega isolada não encerra uma reforma contínua"):
  nenhuma tela mostra número sem fonte rastreável. Pontos mais sérios:
  - `d0cfecc` (#189) — tabela de clientes projetava valor futuro bienal sem
    desconto por afastamento como se fosse receita (R$ 23.400 para duas
    visitas); rota legada de tendências LTV (colunas inexistentes, zero
    consumidor na interface) fechada com 410.
  - `5d20df2` (#184) — `/api/revenue` legado (colunas `total_revenue`,
    `service_date`, `is_deleted` que não existem no schema atual) fechado com
    410 após autenticação; sem consumidor montado na interface.
  - `402f4e9` (#186) — endpoint global de `customer-dna` fechado com 410: lia
    `public.customer_behavioral_profiles`, tabela sem `restaurant_id`, e
    vazava DNA de cliente entre restaurantes por desenho, não por bug.
  - `7540fc1` (#181) — risco de churn exibido como "100% de risco" quando a
    função é heurística saturada 0–100, não probabilidade; e-mail de
    retenção sem validar cliente/restaurante antes de enviar.
  - `f58983b` (#188) — toque e arraste na planta de mesas eram o mesmo gesto:
    um toque sem mover a mesa ainda disparava o salvamento de posição.
  - `e1211dd`/`a40631f`/`6d4e70a` — paginação de chamadas concatenava
    `offset`/`limit` como string (segunda página de 50 buscava 5.000 linhas);
    filtro de período ignorado pela lista mas aplicado nos números; gasto
    "estimado" trocado por valor fonteado de visitas concluídas em vez de
    projeção.
  - `f319b77` (#185) — convite de equipe anunciado como enviado mesmo sem o
    provedor confirmar aceite; token de convite não volta mais na API.
  - `f782fbe` (#156, 25/09) e as revisões de 11/10 (#173–#176) — teste de
    envio de WhatsApp virava pesquisa a cada clique (polling sem checar
    entrega pendente); conexão não provava roteamento real contra o registro
    central antes de liberar o link de conversa.
- **WhatsApp — integridade da reserva** (PRs #201–#204, 16/10;
  `docs/plans/2026-10-16-whatsapp-booking-integrity.md`,
  `supabase/migrations/20261016184431_whatsapp_booking_integrity.sql`) —
  chave de retry derivada do servidor (nunca do modelo), função Postgres só
  para service-role que serializa admissão por restaurante (checa horário,
  último seating, janela de antecedência e capacidade ativa antes de
  inserir uma vez); retry do modelo passa a receber os dados da reserva já
  committada em vez de criar duplicata. A própria PR documenta o que não
  resolve: sessões por telefone podem reter o restaurante errado, canais
  fora do WhatsApp não passam por essa trava, capacidade agregada não garante
  mesa combinável, confirmação de saída não é durável.
- **WhatsApp — posse do hóspede nas ferramentas de reserva** (`6b09653`, #205,
  19/10) — `reservation_id` sozinho não autoriza mais consulta, cancelamento
  ou alteração; as três ferramentas exigem que o telefone autenticado do
  remetente (normalizado) bata com o telefone salvo do hóspede, e um
  argumento de telefone vindo do modelo não pode mais sobrescrever essa
  checagem. `UPDATE` agora é condicionado ao telefone exato e status anterior,
  e exige linha retornada antes de reportar sucesso.
- **WhatsApp — receptor dedicado vs. compartilhado, segunda onda** (PRs
  #208–#213, 20–21/10) — sessões de entrada isoladas por receptor com retry
  seguro (#208); paginação do seletor de restaurante do número compartilhado,
  que mandava 19 linhas numa lista da Meta com limite de 10 (#209); token da
  Graph API tirado da URL do probe de status para o cabeçalho
  `Authorization`, com timeout de 5s (#212); leitura honesta de um receptor
  dedicado já ativo sem fluxo de provisionamento salvo, sem construir
  `wa.me` sem número E.164 verificado contra a WABA (#211); toggle de
  notificações de reserva parou de escrever `restaurant_registry.is_active`
  e de fazer upsert com idioma/receptor errados por omissão no SELECT
  (#210); estado de conexão na tela parou de desaparecer quando só a leitura
  de status de entrega falhava (#213).

## O que está em voo

- **Três rodadas inteiras de `/intel` represadas** — PR #153 (09-14, 36
  itens) e PR #155 (09-21, 17 itens) foram **fechados sem merge**; PR #163
  (09-28, 28 itens) está **aberto há 21 dias sem review, comentário ou commit
  humano** segundo o próprio corpo do PR, na quinta rodada seguida na mesma
  branch. Resultado prático: nada do que essas três rodadas encontraram
  (Square kiosk com voz agêntica embutida tocando `api/square.js`, default de
  `queueing_config.enabled` da ElevenLabs mudando sem decisão do repo, a
  correção de caminho do cron abaixo) chegou a `intel.config.json`/`INTEL.md`
  em `main`. Decidir se mesclar, rebasear ou descartar essas três rodadas é
  chamada do Stefano — ver "Divergências".
- **PR #169** (`codex/phone-tenant-safety`, draft desde 05/10, 21 dias) —
  trava autosserviço do número compartilhado e corrige roteamento ambíguo do
  webhook do Twilio, mas o próprio PR se declara "não mesclar": um censo
  somente leitura achou um número ativo atribuído a 2 restaurantes ao mesmo
  tempo, e a migration deliberadamente deixa esse número sem dono até alguém
  confirmar manualmente qual dos dois é o legítimo e fazer uma chamada de
  teste real.
- **PR #165** (`codex/platform-insights-redesign`, draft desde 30/09, 26 dias,
  `mergeable_state: dirty`) — reforma de 189 arquivos (Insights, Analytics,
  Dashboard, Voz, CRM/DNA de clientes) que o próprio PR trava: crítica visual
  independente deu 5.5–7.5/10 contra a barra de 9/10 exigida, o OAuth do
  Google na Preview protegida redireciona para `seatable.one` em vez de ficar
  na Preview (impedindo inspeção autenticada), e o merge de CRM é
  explicitamente marcado como inseguro para dado real (escritas não-atômicas,
  upsert diário de churn pode sobrescrever identidade mesclada).
- **PR #140** (`feat/landing-fotografica-e-teste-whatsapp-9ca7iq`, draft desde
  06/09, 50 dias) — implementação em componentes React do mesmo herói
  fotográfico que já foi ao ar por outra rota (artefato estático, `d38c5b5`,
  25/09). As duas versões não são o mesmo código. Risco concreto de trabalho
  morto ou de regressão se alguém mesclar isso por engano sobre a versão já
  publicada; decidir se fechar sem merge é chamada do Stefano, não mecânica.
- **PR #90** (`claude/e2e-racha-quebra-listagem`, aberto desde 26/08, 61 dias,
  não-draft) — corrige a suíte e2e inteira sendo incoletável por um spec do
  Racha lendo `.env` do Windows local; 42+/8-, 4 arquivos, isolado. Nenhum
  bloqueio declarado; parece só esquecido.
- **4 PRs de dependabot** abertos (#168, #198, #199, #206) — bumps de rotina
  em `producao`/`desenvolvimento`, raiz e client; o mais antigo é de 05/10.
- **Eval do Manager AI** e **G5 — onboarding em conversa** seguem como nas
  rodadas anteriores: nenhum commit desta janela tocou
  `onboarding-agent.js`/`agent-loop.js` nem rodou o arnês de 20 casos.

## O que morreu

- **`/api/revenue` (legado)** — fechado com 410 após autenticação (`5d20df2`,
  #184). Usava colunas que não existem no schema atual (`total_revenue`,
  `service_date`, `is_deleted`); sem consumidor montado na interface; a leitura
  financeira real já era `/api/revenue-stats`. Handler recuperável no
  histórico git; nenhuma linha de banco foi apagada.
- **Endpoint global de `customer-dna`** — fechado com 410 (`402f4e9`, #186).
  Lia `public.customer_behavioral_profiles` sem `restaurant_id`; vazava perfil
  comportamental de cliente entre restaurantes por desenho da rota, não por
  bug pontual.
- **Rota legada de tendências LTV** — fechada com 410 dentro do mesmo PR
  #189 que corrigiu a tabela de valor do cliente; usava colunas inexistentes
  e não tinha consumidor.
- Nada de produto foi descontinuado por decisão de roadmap nesta janela — as
  três mortes acima são todas de código morto/inseguro fechado durante a
  auditoria de verdade, não retirada de feature em uso.

## Áreas quentes

`tasks/todo.md` + `tasks/lessons.md` (o registro vivo da auditoria de
verdade — qualquer tela de `host-dashboard` ainda não listada lá é suspeita
por omissão), `api/_lib/prospecting/confirmacao-indicacao.js` +
`api/_lib/prospecting/indicacao.js` (detector de confirmação — lista fechada,
qualquer adição de frase nova sem passar pelo teste adversarial é regressão),
`api/racha-notify.js` (três rodadas de correção no mesmo dia é sinal de que o
contrato do outro lado não está documentado aqui), `supabase/migrations/
20261016184431_whatsapp_booking_integrity.sql` + `docs/plans/
2026-10-16-whatsapp-booking-integrity.md` (a própria PR lista o que não
cobre: dashboard/web/voz/Google sem a mesma trava, confirmação de saída
fire-and-forget), `api/whatsapp-settings.js` + `client/src/pages/
WhatsAppSettingsPage.tsx` + registro central de roteamento (cinco PRs em dois
dias no mesmo arquivo de settings é sinal de superfície ainda instável, não
fechada), os três PRs de intel represados (`#153`, `#155`, `#163`).

## Divergências com o config

1. **`known_gaps` aponta para um caminho de arquivo que não existe —
   mecânico, verificável agora.** A entrada sobre o duplo caminho de
   WhatsApp para lembrete/campanha cita `api/cron/send-reminders.js`; esse
   arquivo não existe mais desde a consolidação de crons do PR #135 (rodada
   anterior, 07/09) — o caminho real é `api/_crons/send-reminders.js`
   (confirmado: `ls api/cron/send-reminders.js` falha, `ls
   api/_crons/send-reminders.js` existe). O próprio PR #163 (intel 09-28, não
   mesclado) já encontrou e corrigiu exatamente essa linha, mas a correção
   está presa no PR represado — por isso o texto em `main` continua errado.
   Aplicável sem julgamento: é troca de caminho de arquivo, não de conteúdo
   do gap.
2. **Três rodadas de intel não chegaram a `main`, logo nada que elas
   encontraram está em `intel.config.json`/`INTEL.md` hoje.** Não é uma
   divergência de conteúdo (não há como comparar o que nunca chegou), é uma
   divergência de processo que vale registrar aqui porque explica por que
   este `STATE.md` não cita nada de Square kiosk, ElevenLabs
   `queueing_config` ou os outros achados de 09-14/09-21/09-28 — eles existem
   só nas branches/PRs `intel/2026-09-14`, `intel/2026-09-21` e
   `intel/2026-09-28`, não no config real. Decidir como resolver esse
   represamento (mesclar #163 como está, rebasear, ou descartar e recomeçar)
   é chamada do Stefano.
3. Nenhuma linha de `bets` ou `settled` foi tocada ou contradita por commit
   desta janela — a auditoria de verdade mexeu em apresentação de dado já
   existente, não em arquitetura ou decisão de produto registrada. Nenhum
   `known_gap` além do item 1 foi fechado por um commit desta janela
   especificamente (o teste de payload de criação de agente ElevenLabs que
   responderia a outro `known_gap` já existia antes de `edda6b0`, fora desta
   janela — não é crédito desta rodada).
