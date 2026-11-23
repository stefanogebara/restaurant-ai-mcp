# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-11-23, a partir de `intel/2026-11-16` (PR
> #350, a mais recente da cadeia represada — ver "O que está em voo"). Janela
> cobrida aqui: `e0299bf` (16/11, onde a #350 parou) até `origin/main`
> (22/11), 41 commits (31 não-merge, 16 PRs mergeados), inteiros dentro de
> 16–22/11. Reescrito a cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

Duas frentes paralelas, não uma. A primeira: uma auditoria de latência em
produção (16/11, medição real em São Paulo) achou o Painel levando 2,8s
quente / ~10s frio, por geografia simples e nunca corrigida — funções Vercel
em `iad1` (Virgínia, o default, nunca fixado), banco em `eu-central-1`
(Frankfurt), voz em `cdg` (Paris), e cada carga de painel fazendo ~6 idas
sequenciais ao banco, cada uma cruzando o Atlântico (~90ms). Isso disparou
três PRs no mesmo dia (21/11): mover as funções para `fra1` ao lado do banco
(ida ao banco cai de ~90ms para ~2ms, medido antes/depois), cortar 5 chamadas
que o painel disparava e descartava, e corrigir sobreposição de mesas no
salão (duas telas desenhando a mesma grade com fatores de escala diferentes).
A segunda frente, maior: nove PRs (18–20/11, `codex/*`, #356→#364, ~240
arquivos) fecharam o ciclo de vida completo do depósito de reserva via Stripe
Connect — cotação emitida pelo servidor, autorização vinculada à reserva,
captura única na confirmação de no-show, reembolso idempotente com reversão
de transfer Connect, fila de liberação em cancelamento/mudança, reconciliação
por webhook e revisão periódica de autorizações expiradas — onde antes só
existiam os três endpoints soltos da Phase 10 do roadmap (`create-deposit-
intent`/`capture-deposit`/`release-deposit`). Tudo verificado contra Stripe
Sandbox real + Postgres/PostgREST descartáveis, não só escrito.

## O que shipou

- **Latência: `fra1` ao lado do banco** (#365, #366, #367, #368, 21/11):
  `vercel.json` ganha `"regions": ["fra1"]` — funções saem de `iad1` e vão
  para Frankfurt, ao lado do Supabase. O navegador em São Paulo fica ~80ms
  mais longe por chamada, mas o saldo é positivo porque há ~6 idas ao banco
  por carga de painel. **#366** elimina 5 chamadas que o painel disparava e
  descartava (waitlist com contagem `null` tratada como vazia; 5 widgets
  montando e chamando API fora de tela) + Sentry só carrega sob erro. **#367**
  corrige sobreposição de mesas no salão (`FloorPlanCanvas` com
  `TABLE_VISUAL_SCALE` divergente entre duas telas) e sobe as chegadas do dia
  para antes da planta. **#368** reestrutura o menu lateral de 13 itens para
  5 (Hoje/Salão/Recepcionista/Clientes/Ajustes) + abas no topo do grupo
  (`SectionTabs`); **Marketing sai do menu** — decisão de produto não
  registrada em `settled`/`known_gaps`, fica como pergunta no PR.
- **Depósito de reserva: ciclo completo via Stripe Connect** (#356→#364,
  18–20/11, ~240 arquivos): #356 preserva o plano escolhido entre
  preços→login→onboarding→Checkout. #357 retoma onboarding manual após
  reload e mostra origem do horário (Google autocomplete de endereço vs
  site) — **atenção: este "Google" não tem relação com o canal de reserva
  `api/google-booking/server.js`** que a auditoria de 11/11 corrigiu; são
  dois "Google" diferentes, não confundir em rodadas futuras. #358: onboarding
  retomável com estado persistido. #359: cotação de depósito emitida pelo
  servidor (não confiável do cliente), autorização vinculada à reserva,
  reconciliação de eventos de Checkout hospedado — **corpo do PR cita
  "legacy-link cutover checks are tracked separately" sem PR/issue
  correspondente encontrado**; é um "a fazer" solto, não amarrado a número.
  #360: Stripe Connect em aba própria "Pagamentos", verificação de conta no
  retorno, idempotência na criação. #361: reembolso idempotente + reversão de
  transfer Connect + reconciliação `account.updated`. #362: fila de liberação
  de autorização em cancelamento/mudança (edição sem mudança real não
  dispara). #363: confirmação de chegada + atendimento + ocupação de mesa numa
  transação só; no-show não cobra automaticamente — dono confirma valor para
  captura única; reconciliação por webhook + tentativa + revisão periódica de
  autorizações expiradas. #364: status do link de depósito visível no painel
  (aguardando/expirado) + link de reposição após expiração.

## O que está em voo

- **A cadeia de intel represada não encolheu — PR #350 (esta base) segue
  aberta, draft, sem merge, assim como #214, #218 e #286.** Nenhuma mudou de
  estado desde a rodada de 16/11. Mesma recomendação, agora com mais urgência
  (cinco elos, incluindo este, se também não for mesclado): **fechar #214,
  #218, #286 e #350 sem merge quando a PR desta rodada for revisada** — ela
  herda e supera as quatro.
- **PR #169** (`codex/phone-tenant-safety`, draft, "do not merge") — segue
  aberta, sem toque nesta janela. Continua em aberto se o commit `dbf11e9`
  (07/11, fora de ambas as janelas de 09–16 e 16–22/11) já resolveu o mesmo
  problema de número de telefone duplicado entre tenants — não verificado
  por nenhuma das duas últimas rodadas; vale conferir antes de represar de
  novo.
- **PR #165** (`codex/platform-insights-redesign`, draft, `dirty`), **PR
  #140** (landing fotográfica, draft) — sem mudança de estado.
- **PR #90** (`claude/e2e-racha-quebra-listagem`, não-draft, 536 testes e2e
  passam a ser coletados, eram 0) — candidata a merge rápido pela quarta
  rodada seguida, sem bloqueio declarado.
- **Dependabot:** `#198` (13/10), `#206` (19/10), `#215`/`#216` (02/11)
  seguem abertos sem merge. `#348` (16/11) foi **fechado sem merge**,
  provavelmente superado por `#369` (criado 23/11, 15 updates — fora desta
  janela, mas já no radar). Nenhum dependabot foi criado ou mergeado dentro
  de 16–22/11 estritamente.
- **Eval do Manager AI e G5 (onboarding em conversa)** seguem intocados.

## O que morreu

Nada removido de propósito nesta janela — é tudo construção (depósito) e
correção/otimização (latência, painel).

## Áreas quentes

A cadeia de depósito Stripe Connect inteira (webhooks, os endpoints de
depósito) — maior superfície nova da janela, território onde reembolso
duplicado ou autorização não liberada é dinheiro do dono do restaurante saindo
errado. `vercel.json`/região `fra1` — mudança de infraestrutura que afeta
toda chamada da plataforma; qualquer função assumindo `iad1` quebra em
silêncio. `FloorPlanCanvas`/`TABLE_VISUAL_SCALE` — duas telas desenhando a
mesma grade com escalas diferentes é o tipo de bug que volta. A fila de PRs
represados (4 de intel + `#169`/`#165`/`#140`/`#90` + 4 dependabot) — cresceu
por cinco rodadas seguidas sem review humana.

## Divergências com o config

Nenhuma nova nesta janela. O `known_gap` do roteamento hardcoded de WhatsApp
(`api/_crons/send-reminders.js` sempre Twilio, `campaignService.js` sempre
Meta, nenhum lê `whatsapp_provider`) permanece aberto, confirmado intocado
(último toque foi #180, 12/10, fora desta janela). `CLAUDE.md` não foi tocado
nesta janela — a divergência da tabela de crons persiste sem mudança.

**De julgamento, para o PR:**
1. A remoção de "Marketing" do menu lateral (#368) — decisão deliberada
   (campanhas migram para o Manager AI em vez de item fixo?) ou corte que
   precisa de rota alternativa? Sem registro em `settled`/`known_gaps`.
2. O "legacy-link cutover" do #359, sem PR/issue correspondente — vale abrir
   rastro explícito, ou é interno a uma conversa que já aconteceu fora do git?
