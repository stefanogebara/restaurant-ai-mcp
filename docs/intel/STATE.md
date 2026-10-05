# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-10-05. Janela: desde o checkpoint do `/intel`
> de 28/09 (`868d2c8`, base do PR #163) até hoje (`5dea113`). Reescrito a cada
> `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

**O achado do dia é, de novo, operacional — e é o mesmo achado de 28/09,
batendo pela terceira vez.** O PR #163 (28/09, 15 itens, verde,
`mergeable_state: clean`, 2 comments só de bot) nasceu `draft` prometendo
consertar o padrão dos PRs #153/#155 — e **repetiu o padrão**: zero commit,
zero review, zero clique em "Ready for review", **7 dias** até esta rodada
notar. `docs/intel/` em `main` ficou congelado na foto de 07/09 (194 linhas
de `seen.jsonl`) enquanto uma rodada inteira de trabalho — 15 itens julgados,
2 spikes promovidos a `BACKLOG.md` — vivia numa branch que ninguém mergeava,
pela terceira vez consecutiva. Esta rodada não abre um PR novo: **continua o
#163 na mesma branch** (`intel/2026-09-28`, renomeada aqui para refletir o
conteúdo acumulado), mescla o `main` atual sem conflito, e desta vez marca o
PR como **pronto para revisão** em vez de draft — é a única mudança capaz de
quebrar o ciclo, já que draft é exatamente o estado em que os três PRs
anteriores morreram. Fora do `/intel`, a semana de código (30/09) foi curta e
focada: quatro commits de correção em cascata no piloto de indicação da
Olímpia para o Racha (confirmação de indicação, três rodadas de revisão de
segurança endurecendo a mesma função) — mesmo padrão recorrente já registrado
em janelas anteriores (feature pequena, 3+ rodadas de correção de segurança
no mesmo dia). No mercado, a semana trouxe o primeiro concorrente brasileiro
nomeado atacando o canal exato do Seatable (IAMenu, ainda vaporware) e a
confirmação — via imprensa e BSP, não via documentação oficial da Meta — de
que a cobrança de mensagens de serviço do WhatsApp **entrou em vigor em
01/10** com tarifa concreta (R$0,035/mensagem após 1.000 grátis/mês), 34 dias
depois do prazo que a própria Meta prometeu para publicar o número.

## O que shipou

- **Olímpia — piloto de indicação do Racha, com correção de segurança em
  cascata** (4 commits, 30/09): `confirmacao-indicacao.js` deixa de deixar
  uma indicação pendente morrer no handoff ("é o responsável", "chamar esse
  número" não eram reconhecidos) e passa a ter uma lista FECHADA de frases
  que valem como "sim" — qualquer negação embutida ("não pode chamar", "sim,
  mas ele não quer") desarma o sim, só a mensagem inteira normalizada conta.
  Escopo restrito a indicação ainda pendente, só nas 48h depois da pergunta,
  veredito refeito sobre a ÚLTIMA mensagem da rajada. Veto de LGPD: o
  indicado só recebe o template específico de indicação (diz quem passou o
  número, oferece saída); sem esse template aprovado, nada sai e o contato
  fica com o fundador. Campanha de lista curada (piloto do Racha) passou a
  não ser barrada pelo filtro de nome do ICP ("Paróquia Bar" era lido como
  igreja). Suíte cresceu com testes para cada rodada de revisão.

## O que está em voo

- **PR #163→continuado** (este PR, antes draft desde 28/09): vira pronto
  para revisão nesta rodada — ver "O parágrafo".
- **PR #90** (aberto 26/08, agora **40 dias**, `mergeable_state: clean`,
  zero commit/comentário desde a criação): o item mais velho parado sem
  explicação continua parado. Pequeno (42+/8-), isolado, remove dois specs
  do Racha que zeravam a coleta e2e inteira.
- **PR #140** (draft, aberto 06/09, agora **29 dias**, `mergeable_state`
  virou **`dirty`** nesta janela): a landing fotográfica que o #157
  provavelmente tornou redundante (ver STATE.md de 28/09) agora também tem
  conflito de merge — mais um sinal de que ninguém vai retomar este PR como
  está. Continua sem decisão do Stefano sobre se é intencional ou
  esquecido.
- **PR #165** (novo, aberto 30/09, draft): redesenho de Insights/Analytics —
  **este é WIP saudável, não represado**: tem revisão de screenshot ativa
  (7,6/10 desktop, 7,5/10 mobile, meta declarada de 9/10), checklist de
  pendências explícito no corpo, e atividade até 03/10. Diferente dos
  outros drafts parados, este sabe que está incompleto e diz o quê falta.
- **4 PRs de dependabot abertos hoje de manhã** (#166–#168 mais o #154 de
  21/09, que segue aberto): nenhum revisado em nenhuma das quatro últimas
  passadas — agora **4 PRs de dependência em rotação sem revisão**.
- **7 issues `[design-drift]`** — seguem abertas e paradas desde 25/05,
  agora **133 dias**.
- **Eval do Manager AI** (PR #99) — segue bloqueado por `OPENROUTER_API_KEY`
  ausente neste ambiente.
- **BACKLOG.md#elevenlabs-queueing** (PROTOTIPAR 12/15, 21/09) e
  **BACKLOG.md#ia-liga-pro-restaurante** / **#elevenlabs-parallel-tool-calls**
  (PROTOTIPAR 11/15, 28/09) — seguem abertos, sem spike rodado.

## O que morreu

Nada removido de propósito nesta janela.

## Áreas quentes

`api/_lib/prospecting/confirmacao-indicacao.js` (3 rodadas de correção de
segurança em um dia — o padrão mais recorrente deste repo: feature nova da
Olímpia sai, revisão de segurança acha múltiplos achados, no mesmo dia),
`docs/intel/*` (área quente de **processo**, pela terceira semana seguida —
ver "O parágrafo"), `api/_lib/channels/meta-adapter.js` (segue descartando
webhook de status sem ler `pricing_category` — mais relevante agora que a
cobrança de 01/10 aparenta estar em vigor de fato).

## Divergências com o config

Nenhuma linha de `bets`/`known_gaps`/`settled` tocada por julgamento nesta
janela. Um ponto fora do `intel.config.json`, acumulando desde 28/09: o
`sub_products[1]` (Olímpia) continua ganhando mecanismo sobre mecanismo para
o piloto do Racha (indicação, confirmação, campanha de lista curada) sem que
isso esteja descrito no config — mecânico o bastante para registrar, não
para o `/intel` decidir sozinho se isso merece entrada própria em `bets` ou
`known_gaps`.
