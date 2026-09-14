# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-09-14. Janela: desde o último commit de intel
> (`a722518`, PR #145, 2026-09-07) até `55404a8` (2026-09-14), 5 commits não-merge
> em `main` (+ 1 merge de PR). Fora de `main`: os mesmos dois PRs abertos da
> passada anterior, agora mais velhos (`#140` draft, `#90` parado há 19 dias) e
> quatro PRs de dependabot abertos hoje de manhã (`#149`–`#152`).
> Reescrito a cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

Semana quieta de verdade — sem feature, sem migration, só 5 commits, todos
correção. O fio que amarra três deles é uma auditoria de segurança do lado do
**Racha** (produto irmão, noutro repositório) que apontou a lente para cá: a
ponte `api/racha-notify.js`, que recebe alertas de dinheiro do Racha e devolve
WhatsApp/e-mail ao dono do restaurante, estava recusando quase tudo. Três
commits em duas rodadas (12–13/09, PR #147) destravaram, em ordem: (1) a rota
só aceitava o evento de status de recebedor — `reconcile_drift`,
`reconcile_heartbeat` (cujo contrato é "a ausência dela É o alarme") e os seis
eventos de dinheiro (disputa, estorno falho, retenção bloqueada) voltavam 400,
e do lado do Racha isso só virava uma linha de stderr, nunca uma página; (2) a
lista de nomes de evento que tentou consertar isso na rodada anterior estava
errada — cinco "eventos" listados eram na verdade códigos de achado de
conciliação/erro HTTP, e faltavam os sete nomes reais que a produção emite
(`dispute_opened`, `dispute_updated`, `dispute_funds`, `dispute_lost`,
`account_alert`, `unusable_money_event`, `refund_failed`) — e **200 deixou de
significar "entregue"**: sem canal nenhum funcionando a rota agora devolve 502
em vez de engolir a falha em silêncio; (3) o ramo do recebedor (KYC) ainda não
calculava `entregue` como os outros dois, e o radar de vendas tinha o mesmo
texto sem escape de HTML que o alerta de dinheiro já tinha corrigido. Read
duas rodadas de correção sobre a mesma linha, encontradas por revisões
distintas — o achado maior é estrutural: três revisões de segurança do lado do
Racha endureceram o *transporte* dessa chamada (timeout, fallback pra stderr)
e nenhuma leu o *receptor*, porque o receptor mora neste repositório e nenhuma
delas olhou para cá. Em paralelo, dois acertos de mira pequenos na Olímpia:
o filtro de ICP barrava `Ótica Diniz` mas deixava passar `Óticas Diniz Jaçanã`
— o `\b` da regex de bloqueio não sobrevivia a um plural, o mesmo buraco valia
para `Mercados`/`Escolas`/`Igrejas`/`Paróquias` — corrigido com `s?` antes da
fronteira de palavra (#146); e o cron de prospecção estava reportando `HTTP
200 {candidates: 0, sent: 0}` todo dia, indistinguível entre "a fila secou de
verdade" (medido em 13/09: 2 candidatos despacháveis contra um teto de 100 —
a base inteira foi raspada num surto de três semanas em julho e não voltou) e
"o cron travou" — agora entra no `health-alert` diário como estado nomeado
(#148). Fora do código: quatro PRs de dependência abriram nesta manhã
(`#149`–`#152`) e os dois PRs represados da semana passada — a limpeza de
specs do Racha que travam a suíte e2e inteira (`#90`, agora 19 dias) e a
landing fotográfica em draft (`#140`, 8 dias) — não tiveram nenhum commit novo
nem revisão: ninguém tocou neles.

## O que shipou

- **A ponte `racha-notify.js` parou de recusar e de mentir 200** (`#147`,
  três commits, 12–13/09): roteamento aberto para `reconcile_drift`,
  `reconcile_heartbeat` e os seis money-events de fundador (estavam todos
  atrás de uma exigência de `status` que só o alerta de recebedor manda);
  lista de nomes de evento corrigida contra os sete que a produção emite de
  verdade (a tentativa anterior tinha listado códigos de erro/achado por
  engano); alerta sem nenhum canal entregue agora devolve `502` em vez de
  `200` silencioso; `entregue` calculado nos três ramos (recebedor, dinheiro,
  radar), não só em dois; texto de terceiro (nome de casa, mensagem de
  driver) escapado antes de virar HTML nos dois formatadores. 50 linhas de
  teste novas entre os três commits.
- **ICP para de deixar plural furar o filtro** (`#146`, 13/09): `Ótica Diniz`
  era barrado, `Óticas Diniz Jaçanã` passava e recebeu intro comercial em
  07/09 — achado auditando o próprio disparo daquele dia. `s?` antes do `\b`
  fecha `Mercados`/`Escolas`/`Igrejas`/`Paróquias` sem soltar `Basilicata`
  nem `Bar da Escola`. 11 testes novos.
- **Fila de prospecção vazia ganhou um nome, em vez de se parecer com um dia
  qualquer** (`#148`, 14/09): medido em 13/09 com o filtro real do dispatch —
  2 candidatos despacháveis contra teto de 100, zero leads novos em 30 dias
  (a base foi raspada num surto de três semanas em julho). `HTTP 200
  {candidates:0, sent:0}` é indistinguível de cron saudável sem trabalho; a
  contagem entra no `health-alert` diário usando o mesmo `selectIntroCandidates`
  do dispatch — não um SQL próprio, que no dia da medição divergia (18 vs. 2).
  16 testes novos.

## O que está em voo

- **PR #90** (aberto desde 26/08, agora **19 dias**, não-draft,
  `mergeable_state: unknown`, base em `b33944b`, bem antes desta janela e da
  anterior): remove os dois specs do Racha que zeram a coleta e2e inteira e
  batem contra produção de outro produto sem configuração. Zero commit novo,
  zero review desde a passada de 07/09. Segue parecendo pronto para merge.
- **PR #140** (draft, aberto 06/09, **8 dias**, `mergeable_state: unknown`):
  landing fotográfica + teste de WhatsApp + lição das oito rodadas. Sem
  atividade nesta janela.
- **4 PRs de dependabot** abertos hoje de manhã (09-14): `#149`–`#152`, bumps
  de rotina nos grupos `producao`/`desenvolvimento`, raiz e `client/`.
- **Eval do Manager AI** (20 casos, PR #99) — segue parado, mesma barreira de
  credencial (`OPENROUTER_API_KEY`) das duas passadas anteriores.
- **G5 — onboarding em conversa** — nenhum commit desta janela tocou
  `onboarding-agent.js`/`onboarding-draft.js`/`agent-loop.js`. Mesmo estado
  de duas passadas atrás.

## O que morreu

Nada. Sem remoção de feature nesta janela — os cinco commits são todos
correção de comportamento existente (roteamento de webhook, regex de filtro,
observabilidade de cron), não descarte.

## Áreas quentes

`api/racha-notify.js` (três correções em dois dias, ponte entre produtos
distintos, ninguém dos dois lados olhava o receptor inteiro — vale revisão
extra no próximo toque), `api/_lib/prospecting/lead-qualifica.js` (regex de
ICP, segunda correção de fronteira de palavra em um mês),
`api/_lib/prospecting/fila-seca.js` (novo, observabilidade de fila vazia).

## Divergências com o config

1. **`sub_products[1]` descreve `api/racha-notify.js` como "webhook de KYC
   Pagar.me" — ficou incompleto.** Essa é a descrição de um só dos três ramos
   que o arquivo roteia hoje (287 linhas): o ramo de status de recebedor
   (KYC) é o único que a frase cobre. Os outros dois — seis tipos de
   money-event de fundador (disputa, estorno falho, retenção bloqueada) e o
   radar de sinal de vendas — já existiam antes desta janela, mas só
   funcionavam de verdade a partir do `#147` desta semana (antes, batiam
   contra uma exigência de campo que só o ramo KYC preenche e voltavam 400
   sem nunca chegar a um humano). Correção de texto, não de fato — fica
   registrado aqui para o Stefano decidir a frase; não editado sozinho por
   não ser adição inequívoca como o precedente do `customer_history`.
2. **Repetição do registro de 07/09, ainda sem correção — não é deste
   pipeline corrigir:** o `CLAUDE.md` segue documentando rotas diretas de
   cron (`/api/cron/check-late-reservations` etc.) e cadências que o `#135`
   (09/09, passada anterior) já trocou por `/api/cron/run?job=` com
   cadência agrupada por `maxDuration`. Confirmado de novo nesta janela: o
   `BACKLOG.md#twilio-bulk-lembretes` apontava para `api/cron/send-
   reminders.js`, caminho que não existe mais — o arquivo mora em
   `api/_crons/send-reminders.js` desde o `#135`. Corrigido mecanicamente
   nesta passada (âncora movida, gap confirmado ainda válido no novo
   caminho); é o tipo de correção que este pipeline pode fazer sozinho
   porque é caminho de arquivo, não julgamento de conteúdo.
