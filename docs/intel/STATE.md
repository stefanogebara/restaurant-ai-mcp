# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-09-21. Janela: desde o último commit de intel
> (`b64f807`, PR #153 — nunca mergeado, ver abaixo) até hoje. **`main` não
> avançou nem um único commit em 7 dias**: `55404a8` (14/09) segue sendo a
> HEAD. É a semana mais parada do projeto desde que este pipeline existe.
> Reescrito a cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

Zero commits em `main` na semana. O que aconteceu não foi no código — foi na
fila de trabalho represada: o **próprio `/intel` de 2026-09-14 nunca foi
entregue**. Rodou até o fim (4 commits, 36 itens julgados, PR #153 aberto),
ficou verde em todos os checks (`mergeable_state: clean`, sem conflito com
`main` até hoje), e ninguém clicou em "Ready for review" — o PR nasceu
`draft` e morreu `draft`, 7 dias sem um commit ou comentário novo. Esta
rodada assumiu esse trabalho em vez de refazê-lo: peguei a branch
`intel/2026-09-14` como base (230 linhas de `seen.jsonl`, não as 194 que
`main` ainda mostra), então a janela real de candidatos novos desta passada é
só 14→21/09, não 07→21. **Recomendação mecânica, não julgamento:** feche o
PR #153 sem mergear — o PR desta semana já carrega os 4 commits dele mais o
trabalho novo, então mergear os dois seria duplicar o mesmo `seen.jsonl`.
Fora do `/intel`, a paralisia se repete: os dois PRs represados de semanas
atrás (`#90`, limpeza de e2e do Racha, agora **26 dias** parado; `#140`,
landing fotográfica em draft, **15 dias**) não tiveram nenhum commit ou
review novo — CI verde nos dois, ninguém decidiu. E os PRs de dependabot
giraram sem ninguém olhar: os quatro de 07/09 (`#141`–`#144`) fecharam em
14/09 (superados por `#149`–`#152`), um desses (`#150`) já fechou de novo em
21/09 (superado por `#154`) — quatro PRs de dependência abertos agora mesmo
(`#149`, `#151`, `#152`, `#154`), todos verdes, nenhum revisado. Sete issues
abertas, todas rotuladas `[design-drift]`, todas paradas desde 25/05 — nada
tocou essa fila em quatro meses.

## O que shipou

Nada nesta janela. O último código que entrou em `main` foi o pacote de 5
commits do dia 14/09 (racha-notify + ICP + fila seca), já registrado no
`STATE.md` anterior (agora dentro deste mesmo arquivo, seção anterior à
reescrita — ver histórico do PR #153 se precisar do texto original).

## O que está em voo

- **PR #153** (draft, aberto 14/09, **7 dias**, `mergeable_state: clean`,
  zero commit/comentário desde a criação): o `/intel` de 2026-09-14 completo
  — 36 itens julgados, `STATE.md`/`INTEL.md`/`BACKLOG.md` reescritos. Nunca
  saiu de draft. Esta rodada (PR de 2026-09-21) já incorpora o trabalho dele;
  **feche o #153 sem merge** para não duplicar o `seen.jsonl`.
- **PR #90** (aberto 26/08, agora **26 dias**, não-draft, `mergeable_state:
  unknown`, base em `b33944b` — pré-data as três últimas janelas): remove os
  dois specs do Racha que zeram a coleta e2e inteira. Zero commit novo, zero
  review, três passadas seguidas. Segue parecendo pronto para merge — é o
  item mais velho parado sem explicação.
- **PR #140** (draft, aberto 06/09, agora **15 dias**): landing fotográfica +
  teste de WhatsApp + lição das oito rodadas. Sem atividade desde a criação.
- **4 PRs de dependabot abertos agora** (`#149` recriado 14→21/09 com
  versões mais novas do grupo `desenvolvimento`/client; `#151` grupo
  `producao`/raiz, inclui `@anthropic-ai/sdk`/`@sentry/node`/
  `@supabase/supabase-js`; `#152` grupo `desenvolvimento`/raiz,
  `@playwright/test`+`jest`; `#154` grupo `producao`/client, 10 updates
  inclui `@remotion/player`/`@sentry/react`/`@tanstack/react-query`) — todos
  verdes, `mergeable_state: null`. Os quatro originais de 07/09 já fecharam
  (superados) e um dos rotacionados (`#150`) já fechou de novo hoje.
- **Eval do Manager AI** (20 casos, PR #99) — segue parado, mesma barreira de
  credencial (`OPENROUTER_API_KEY`), quarta passada seguida sem mudar.
- **G5 — onboarding em conversa** — nenhum commit em nenhuma das últimas
  janelas tocou `onboarding-agent.js`/`onboarding-draft.js`/`agent-loop.js`.
- **7 issues `[design-drift]`** abertas e paradas desde 2026-05-25 — nenhuma
  tocada nesta janela nem nas anteriores; nenhuma é de segurança/arquitetura.

## O que morreu

Nada — não houve remoção de feature nem descarte nesta janela (não houve
código nenhum).

## Áreas quentes

Nenhuma mudou de código esta semana — seguem as mesmas de 14/09:
`api/racha-notify.js`, `api/_lib/prospecting/lead-qualifica.js`,
`api/_lib/prospecting/fila-seca.js`. Área quente *de processo*, nova desta
passada: a fila de PRs represados (`#153`, `#90`, `#140`) — três PRs prontos
ou quase prontos, verdes, esperando uma decisão humana que não veio em até
26 dias.

## Divergências com o config

Nenhuma — sem commit em `main`, não há fato novo do git para confrontar
contra `bets`/`known_gaps`/`settled`. As duas divergências registradas pela
passada de 14/09 (descrição incompleta de `sub_products[1]` sobre
`racha-notify.js`; `CLAUDE.md` com rotas de cron desatualizadas) continuam
como estavam — ver o corpo do PR #153 ou o `git show
origin/intel/2026-09-14:docs/intel/STATE.md` se precisar do texto exato.
