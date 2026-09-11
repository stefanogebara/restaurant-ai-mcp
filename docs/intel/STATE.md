# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-09-07. Janela: desde o último commit de intel
> (`0914f9e`/`e12595c`, PR #108, 2026-09-01) até `edda6b0` (2026-09-04), 29
> commits não-merge em `main`. Fora de `main`: dois PRs abertos (`#140` draft,
> `#90` parado há 12 dias) e quatro PRs de dependabot abertos hoje de manhã.
> Reescrito a cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

A semana não teve feature nova — teve uma auditoria que virou caçada, e a
caçada achou uma falha de segurança de verdade. O gatilho foi mecânico: o
PR #111 (31/08) construiu um verificador que compara todo `.select()`/`.from()`
do repo contra o `information_schema` real do Supabase, em vez de uma lista
escrita à mão de "problemas já conhecidos". Rodado, ele achou **72 referências
a colunas fantasma em 22 arquivos** — nomes de coluna que o código lê e que
não existem na tabela. Quatro rodadas de correção (PRs #114, #129, #131, #132)
fecharam a lista até zero, e no meio da terceira apareceu o achado sério:
`verify-session.js` pedia `customer_email` de uma coluna que não existe em
`restaurant_config` (a real é `email`); o `SELECT` falhava inteiro, o bloco de
posse era pulado e **qualquer usuário autenticado lia a sessão de checkout do
Stripe de qualquer outro dono** — e-mail, valor, plano — só por ter o
`session_id`. Corrigido e testado (7 testes, 3 provados vermelhos contra a
versão antiga). No mesmo lote: o agente de voz nunca lia a config do
restaurante (7 colunas erradas, `configForPrompt` sempre caía no fallback
genérico), as campanhas pós-visita nunca enviaram nada desde sempre
(`service_records` não tem `customer_email` nem `completed_at`), `whatsapp-
settings.js` sempre mostrava zero de uso, e `customer_history` — já registrada
como morta no `CLAUDE.md` — teve o mapeamento confirmado contra produção e o
erro parou de ser engolido em silêncio (o modelo de no-show continua tratando
todo cliente como novo; repontar para `customer_ltv` foi deixado como decisão
de produto, não bug). Em paralelo, a Olímpia teve sua própria rodada de
correção de mira: a regex de celular inventava número a partir de classe CSS
e float de JSON (10 de 19 sites testados davam falso positivo), a caça ficava
travada sem `SCRAPINGDOG_API_KEY` mesmo tendo um leitor grátis, e uma casa de
culto (2926 avaliações) quase recebeu intro comercial por entrar no ICP pelo
início do nome. Por baixo disso, duas frentes de custo do `CLAUDE.md` foram
atacadas de vez: 36 funções de cron viraram 3 despachantes (191→159 funções,
15min→11min de build) e o build passa a pular quando o commit não toca nada
servido (medido: 80,8% do CPU do ciclo). E a segurança de dependência foi
zerada — 50 vulnerabilidades (`npm audit fix`, sem `--force` exceto `sharp`) —
com scan automático configurado pela primeira vez.

## O que shipou

- **A auditoria de colunas fantasma, do gatilho ao zero** (#111→#114→#129→
  #131→#132): `schema-snapshot.json` (colunas reais de 17 tabelas, tiradas do
  `information_schema` de produção) substitui o allowlist manual de
  `audit:phantom-columns`. 72 referências corrigidas em 22 arquivos. A mais
  séria: `verify-session.js` deixava qualquer usuário logado ler a sessão de
  checkout do Stripe de outro dono (e-mail, valor, plano) — o `error` do
  Supabase nunca era lido, o `SELECT` falhava calado, o gate de posse nunca
  rodava. Também corrigido: o agente de voz nunca lia a config real do
  restaurante (7 colunas erradas em `elevenlabs-agent-create.js`); campanhas
  pós-visita e pedido de review no Google nunca saíram (`service_records` sem
  `customer_email`/`completed_at` — `completed_at` na verdade é
  `actual_departure`); contador de uso do WhatsApp sempre zero; `handoff_to_
  human` (do #109) respondia em inglês para cliente brasileiro porque o
  fallback de restaurante também lia coluna errada (`language`/`restaurant_
  slug` em vez de `agent_language`/`slug`). `customer_history` confirmada
  morta (schema `restaurant`, zero linhas, `restaurant_id` não existe) — LGPD
  deletion corrigido, erro passa a subir em vez de virar "cliente novo" em
  silêncio; repontar o no-show model para `customer_ltv` fica em aberto, por
  decisão.
- **Cron: 36 funções → 3 despachantes** (#135) — `api/_crons/` (não vira
  função própria) + `run.js`(60s)/`run-2min.js`/`run-5min.js`, agrupados por
  teto de `maxDuration`. 191→159 funções, build 15min→11min. `health.js`
  ficou standalone de propósito (não tem cron, mover quebraria `GET /api/
  cron/health`). **`vercel.json` mudou de rota **e** de cadência** — o
  `CLAUDE.md` ainda documenta caminhos diretos (`/api/cron/check-late-
  reservations` etc.) e frequências antigas; hoje `sync-conversation-data` e
  `validate-conversations` rodam de hora em hora (eram `*/15`), `send-
  feedback` também (era 30 min), e a tabela do `CLAUDE.md` nem lista boa parte
  dos 39 crons reais (a maioria da Olímpia). Não é `intel.config.json`, é
  `CLAUDE.md` — fica registrado aqui, não é deste pipeline corrigir.
- **Build pulado quando nada servido muda** (#128) — Ignored Build Step mede
  `vite build` (38s) contra o empacotamento de função (~13min de 191 funções);
  9 dos últimos 38 commits antes desta mudança eram só doc/lição/intel.
  Falha para o lado de construir (git raso, sem base, qualquer erro → builda).
- **Segurança de dependência zerada** (#117, #124, #133, #136 em sequência) —
  50 vulnerabilidades (20 raiz, 30 client) a zero via `npm audit fix` sem
  `--force` (exceto `sharp`, dev-only, bump maior testado à mão). Duas
  dependências fantasma achadas no caminho: `node-fetch` (só transitiva do
  SDK Anthropic, virou `fetch` nativo — o bump do SDK para 0.122 já tinha
  quebrado 4 rotas do ElevenLabs por isso) e `jsonwebtoken` (só transitiva do
  Twilio, autentica todo JWT do repo — um bump de SMS derrubaria login). Scan
  de dependência (`dependabot.yml`, agrupado por ecossistema) configurado pela
  primeira vez — o repo tinha três lockfiles e zero scan.
- **CodeRabbit revisando de verdade** (#116) — `auto_review.drafts` estava
  `false`; como todo PR desta esteira nasce draft, nada era revisado, sete PRs
  seguidos saíram verdes por "review skipped" — inclusive PRs mexendo em RLS
  e WhatsApp. Corrigido. Registrado no cabeçalho: o repo também está abaixo do
  corte de 10 estrelas que libera revisão automática por padrão do plano —
  isso não tem correção por YAML.
- **9 tabelas expostas via RLS fechadas** (#112) — 4 de fato tinham grant para
  `anon`/`authenticated` (das 9 que o advisor apontou). A mais séria:
  `restaurant.stripe_connect_accounts` era `SELECT` para qualquer usuário
  **logado**, vazando `stripe_account_id`/`payouts_enabled` dos 65
  restaurantes entre inquilinos.
- **CI: live-smoke falha rápido e sem vazar credencial** (#137) — estava
  vermelho em 100% das runs desde 02/09 por dois secrets faltando
  (`SANDBOX_EMAIL`/`SANDBOX_PASSWORD`), e a revisão pegou que a correção
  original vazava a senha para todo passo do job (`npm ci` incluído). Trocado
  por flag de presença; valor só chega aos passos de login.
- **e2e: 536 testes e 0 rodavam** (#90, ainda aberto — ver "em voo") — um spec
  do Racha lia um `.env` do Windows local no carregamento do módulo; `ENOENT`
  derrubava a coleta do Playwright inteira antes de qualquer teste existir.
- **Prospecção — três acertos de mira**: regex de celular parava de inventar
  número a partir de CSS/JSON (#113, 0%→100% de precisão em 19 sites reais);
  caça ao celular deixou de depender de `SCRAPINGDOG_API_KEY` como trava dura
  — leitor grátis primeiro, pago só quando o grátis não achou (#138, 82% dos
  sites abrem com o grátis); link de WhatsApp do Elementor reconhecido, dedup
  de intro cruza o lote inteiro (não só dentro da rodada — `+5511946310342`
  tinha recebido 7 intros em um mês), e ICP para de aceitar casa de culto pelo
  início do nome (#139).

## O que está em voo

- **PR #140** (draft, aberto 06/09, mergeable): landing fotográfica em três
  tempos (`PhotographicHero`/`LiveServiceCanvas`/`CinematicServiceStory`),
  teste de envio de WhatsApp que não vira pesquisa, e uma lição registrada —
  oito rodadas de crítica sem a nota mexer até resolver o laço estrutural
  (artefato repetido, CTA preso num mock) em vez da lista item a item. Achado
  lateral que vale registrar: o mock anterior repintava reservas planejadas
  como se fossem o estado real da noite — sem nenhum no-show numa página que
  vende exatamente a detecção disso.
- **PR #90** (aberto desde 26/08, 12 dias, não-draft, `mergeable_state:
  unknown` — base desatualizada, roda sobre `b33944b`, bem antes desta
  janela): remove dois specs do Racha que faziam a suíte e2e inteira falhar
  coleta (0 testes coletados) e que, sem configuração, disparavam contra o
  ambiente de produção de **outro produto**. Correção pequena (42+/8-, 4
  arquivos) e isolada; parece só esperando merge.
- **4 PRs de dependabot** abertos nesta manhã (09-07): #141–#144, bumps de
  rotina em `producao`/`desenvolvimento`, raiz e client.
- **Eval do Manager AI** (20 casos, PR #99 de duas semanas atrás) — arnês
  pronto, ainda não rodado; segue faltando `OPENROUTER_API_KEY` e login neste
  ambiente.
- **G5 — onboarding em conversa** segue como estava no `STATE.md` anterior:
  fundação escrita, endpoint que liga (`api/onboarding/agent.js`) e promoção
  atômica do demo ainda não existem. Nenhum commit desta janela tocou
  `onboarding-agent.js`/`onboarding-draft.js`/`agent-loop.js`.

## O que morreu

- Nada foi removido de propósito nesta janela — foi tudo correção de dado
  errado, não descarte de feature. A exceção é a lista de conhecidos-ruins do
  `audit:phantom-columns` (3 tabelas escritas à mão), substituída pelo
  `schema-snapshot.json` gerado do banco real.

## Áreas quentes

`api/_lib/audit/phantom-columns` (e o `schema-snapshot.json` que o alimenta),
`api/_lib/prospecting/*` (regex de celular, caça ao JSON, dedup entre
rodadas), `api/_crons/*` + `api/cron/run*.js` (a nova forma de todo cron), `.
github/workflows/live-smoke.yml`, `.github/dependabot.yml`, `api/verify-
session.js` (segurança — vale revisão extra no próximo toque).

## Divergências com o config

Nenhuma linha de `bets`, `known_gaps` ou `settled` foi tocada nesta janela por
decisão de julgamento — o que segue é o que dá para aplicar sozinho, por ser
o que o próprio texto do `known_gaps[6]` (customer_history) já previa:

1. **`customer_history` — buraco documentado só em `CLAUDE.md`, faltava em
   `known_gaps`; acrescentado agora, mecânico.** O `CLAUDE.md` já registrava
   a tabela como morta ("erra 42P01 em silêncio"), mas o `intel.config.json`
   não tinha essa entrada. PR #115 (2026-09-02) corrigiu metade do problema:
   o erro agora sobe para quem chama, em vez de virar `null`/"cliente novo"
   sem rastro, e a exclusão LGPD (`data-deletion.js`) passou a usar
   `.schema('restaurant')` e parar de filtrar por uma coluna (`restaurant_id`)
   que a tabela não tem. O que **não** mudou: o modelo de no-show ainda trata
   todo cliente como novo — o mapeamento para `customer_ltv` está pronto
   (`total_visits`, `last_visit_date`, `avg_party_size` existem lá) mas não
   foi aplicado, por ser decisão de produto e não bug. Acrescentado ao
   `known_gaps` do `intel.config.json` nesta passada — é adição de fato
   verificável no git, não remoção nem alteração de entrada existente.
2. **`CLAUDE.md` (fora do `intel.config.json`, registrado aqui por não ter
   outro lugar):** a tabela de cron jobs ficou desatualizada pelo próprio
   #135 desta janela — rotas mudaram de endpoint direto para `/api/cron/
   run?job=`, e pelo menos três cadências mudaram (`sync-conversation-data`,
   `validate-conversations`: `*/15`→hora em hora; `send-feedback`: 30min→hora
   em hora) sem que a doc acompanhasse. Fora do escopo deste pipeline
   (`docs/intel/` + `intel.config.json`) corrigir — só registrar que existe.
