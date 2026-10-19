# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-10-19. Janela: desde o commit de intel anterior
> nesta branch (`d3b79919`, sessão de 2026-10-12, PR #163 ainda não mergeado)
> até hoje (`dcb7e2ec`), via merge de `main`. Reescrito a cada `/intel`. Fonte:
> o git e o GitHub, não o config.

## O parágrafo

**O achado operacional é, pela quinta vez, o mesmo, e agora passou de "represado"
para "esquecido": o PR #163 está aberto há 21 dias desde a primeira promessa de
"pronto pra revisão" (05/10), com zero review, zero comentário humano, zero commit
entre 12/10 e hoje.** Esta rodada repete a decisão das quatro anteriores — não abrir
um sexto PR paralelo, continuar na mesma branch `intel/2026-09-28` — e mescla os 22
commits que `main` ganhou nesse meio-tempo. Fora do `/intel`, a semana foi das mais
produtivas do repositório: um sprint sustentado de "verdade na interface" (14 PRs,
10-12 a 10-16, majoritariamente `codex/*` mergeados no mesmo dia de abertura) que
reescreveu LTV/valor do cliente, aposentou dois endpoints que liam coluna inexistente
havia tempo (`/api/revenue` legado e o endpoint global de `customer-dna`), corrigiu
estados de waitlist/floor-plan/reports no mobile para não fingir dado que não existe,
e terminou numa correção de segurança concreta: a reserva por WhatsApp tinha uma
condição de corrida de capacidade e podia duplicar por retry de modelo ou replay de
webhook — corrigida com uma função transacional no banco (idempotência + checagem de
capacidade sob a mesma transação, migration `20261016184431_whatsapp_booking_integrity.sql`,
PRs #201-204). A própria implementação documenta o que ainda falta, em
`docs/plans/2026-10-16-whatsapp-booking-integrity.md`: os caminhos de reserva por
dashboard, web, voz e Google **não passam pela mesma função** e continuam sem a
mesma proteção, e a confirmação de WhatsApp de saída continua "fire-and-forget",
sem recibo durável. No dia seguinte (16/10), um PR novo e ainda aberto (#205) fechou
uma segunda falha na mesma área: até então, saber o `reservation_id` bastava para
cancelar ou modificar a reserva de **qualquer** hóspede pelo WhatsApp — agora as três
tools exigem que o telefone autenticado do remetente bata com o telefone gravado.

## O que shipou

- **Sprint de verdade na interface, 14 PRs em 4 dias (10-12 a 10-16, `codex/*`,
  merge no mesmo dia de abertura de cada um)** — `fix(revenue)`: `/api/revenue`
  aposentado com 410 autenticado (usava colunas que não existem mais no schema
  atual); `fix(customers)`: endpoint global `customer-dna` aposentado e isolado
  por wiki/tenant; `fix(ltv)`: página de valor do cliente reconstruída —
  projeção rotulada como estimativa (não receita coletada), moeda explícita,
  botão de envio em massa removido, ação de trends obsoleta aposentada (também
  lia coluna que não existe); `fix(team)`: convites confiáveis + gestão mobile;
  `fix(floor-plan)`: canvas mobile usável, toque sem escrita indevida;
  `fix(waitlist)`: estado de espera e timer mostrados com honestidade (sem
  fingir "ativo" quando está gated); `fix(reports)`: relatório mobile com
  período delimitado, PDF entregue de forma privada; `fix(dashboard)`: churn
  mostrado como score, não como fato definitivo; `fix(proactive)`: rascunho de
  contato novo ancorado em fatos conhecidos (não inventa histórico);
  `fix(settings)`: fuso horário atual mostrado com veracidade; `fix(calls)`/
  `fix(customers)`: período, paginação e estado mobile alinhados entre Call
  Tracking e Customers; `fix(mobile)`: navegação inferior única (sem
  duplicação de menu). Tema comum, confirmado em `tasks/lessons.md`: "não
  declarar uma página pronta só porque não tem overflow" e "uma entrega
  isolada não encerra uma reforma contínua" — o próprio Stefano pediu
  continuidade superfície por superfície sem pausar a cada PR.
- **Reserva por WhatsApp deixa de ter condição de corrida de capacidade**
  (PRs #201-204, 16/10, migration `20261016184431_whatsapp_booking_integrity.sql`)
  — nova função transacional, `service_role`-only, dá identidade de idempotência
  estável a cada comando de reserva (retry de IA ou replay de webhook não cria
  reserva duplicada) e checa capacidade de assento sob a mesma transação (duas
  reservas concorrentes pelas últimas vagas não podem as duas vencer). Testada
  contra Postgres descartável nas duas ordens de lock, replay, cancelamento/
  reserva nova, e recusa por capacidade. Documentado explicitamente em
  `docs/plans/2026-10-16-whatsapp-booking-integrity.md` o que **não** está
  coberto: isolamento receptor→restaurante (P1 separado), os caminhos de
  dashboard/web/voz/Google que escrevem reserva direto sem passar por esta
  função, e a confirmação de saída do WhatsApp, que continua fire-and-forget
  sem recibo durável.
- **Correção mecânica em `intel.config.json`** — a linha de `known_gaps` sobre
  lembrete/campanha de WhatsApp hardcoded ainda citava `api/cron/send-
  reminders.js`, caminho que não existe desde a consolidação de crons do PR
  #135 (setembro); o arquivo real é `api/_crons/send-reminders.js`. A
  `BACKLOG.md#twilio-bulk-lembretes` já tinha essa âncora corrigida desde
  14/09 — só o `known_gaps` ficou com a referência órfã. Corrigida nesta
  rodada; o gap em si (roteamento hardcoded, sem checar `whatsapp_provider`)
  continua real e sem mudança.

## O que está em voo

- **PR #163→continuado (este trabalho)** — 21 dias desde "pronto pra revisão"
  (05/10), zero review humano, zero atividade entre 12/10 e hoje. Quinta
  rodada seguida registrando o mesmo bloqueio de processo.
- **PR #205** (aberto 16/10, 3 dias, `mergeable_state: clean`, não-draft):
  fecha a falha de autorização descrita acima (qualquer um podia
  cancelar/modificar reserva de outro hóspede sabendo só o ID). Ainda sem
  review — é o PR mais novo e mais claramente pronto da lista.
- **PR #169** (draft, aberto 05/10, agora **14 dias**, `mergeable_state: dirty`,
  zero commit desde a criação): continua bloqueado de propósito — carrega o
  mesmo número de telefone duplicado entre 2 restaurantes em produção, nunca
  resolvido, e ainda precisa reconciliar com o que o PR #177 (já mergeado em
  setembro) deixou em `api/phone-integration-simple.js`.
- **PR #165** (draft, aberto 30/09, agora **19 dias**, `mergeable_state: dirty`):
  WIP de redesenho de Insights, sem commit novo desde 10/10 (9 dias parado).
  Nota de crítica mais recente (6.5/10 desktop, 6.8/10 mobile, 5.5/10
  database-only) segue abaixo da barra de 9/10 que o próprio PR define como
  critério de merge. Provavelmente mais conflitante agora, dado que o sprint
  de verdade na interface tocou Reports/Customers/LTV em paralelo.
- **PR #140** (draft, aberto 06/09, agora **43 dias**): landing fotográfica,
  seguindo sem decisão do Stefano sobre se é intencional ou esquecida — sem
  mudança desde a última passada.
- **PR #90** (aberto 26/08, agora **54 dias**, `mergeable_state: unknown`):
  o item mais velho da lista, zero commit/comentário desde a criação. Pequeno
  (42+/8-), isolado, remove dois specs do Racha que zeravam a coleta e2e.
- **4 PRs de dependabot abertos**: #168 (05/10, 14 dias), #198 e #199 (13/10,
  6 dias), #206 (19/10, hoje) — nenhum revisado em nenhuma passada até agora.
- **7 issues `[design-drift]`** (#2-#8) — seguem abertas e paradas desde 25/05,
  agora **~147 dias**.
- **Eval do Manager AI** (PR #99) — segue bloqueado por `OPENROUTER_API_KEY`
  ausente neste ambiente; sem mudança.
- **BACKLOG.md em aberto, sem spike rodado:** `elevenlabs-queueing` (21/09),
  `ia-liga-pro-restaurante` (28/09), `elevenlabs-parallel-tool-calls` (28/09),
  `elevenlabs-on-openrouter` (12/10), `twilio-bulk-lembretes` (31/08),
  `ucp-catalogo-legivel`, `identidade-reserva-externa`, `tool-evento-privado`
  (24/08). Nenhum commit desta janela fecha algum destes — os arquivos que o
  sprint de verdade tocou (`ltv.js`, `guest-profile.js`, `message-sender.js`)
  foram por honestidade de exibição/fuso, não pela lógica que os spikes
  descrevem.

## O que morreu

- **`/api/revenue` (endpoint manual legado)** — aposentado com 410 autenticado;
  usava colunas que o schema atual não tem. `/api/revenue-stats` e o caminho
  de POS continuam intactos.
- **Endpoint global de `customer-dna`** — aposentado/isolado por tenant; ação
  de "trends" do LTV também aposentada (consultava coluna obsoleta).

## Áreas quentes

`docs/intel/*` — quinta semana seguida como área quente de **processo**: o
problema não é falta de trabalho (14+5 PRs reais entraram em `main` nesta
janela), é especificamente este PR de intel não ser revisado, agora por três
semanas corridas sem nenhum commit entre passadas.
`api/_services/whatsapp/*` — dois PRs de segurança/integridade em sequência
(idempotência+capacidade em #201-204, posse de hóspede em #205) na mesma
área; vale revisão extra no próximo toque, inclusive dos caminhos ainda não
cobertos (dashboard/web/voz/Google) que o próprio plano documenta como gap.
`api/phone-integration-simple.js` — segue precisando de reconciliação entre
o que o PR #177 (mergeado) já mudou e o que o PR #169 (draft, bloqueado)
ainda carrega sem resolver.

## Divergências com o config

Uma correção mecânica aplicada (ver "O que shipou": âncora órfã de
`api/cron/send-reminders.js` em `known_gaps`, corrigida para
`api/_crons/send-reminders.js` — fato verificável no filesystem, não
julgamento). Nenhuma linha de `bets` ou `settled` tocada.

**Candidato a `known_gaps` novo, não aplicado por exigir julgamento:** o
próprio `docs/plans/2026-10-16-whatsapp-booking-integrity.md` documenta, nas
palavras de quem fez o trabalho, que a proteção de idempotência/capacidade
da reserva por WhatsApp **não** se estende aos caminhos de dashboard, web,
voz e Google (que seguem escrevendo reserva direto, sem a mesma admissão) e
que a confirmação de saída do WhatsApp segue fire-and-forget, sem recibo
durável. Isso é um gap novo e concreto, mas decidir se vira linha de
`known_gaps` — e como fundir com o gap já existente de roteamento hardcoded
de WhatsApp — é chamada do Stefano, não deste pipeline.
