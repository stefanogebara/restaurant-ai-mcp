# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-09-28. Janela: desde o último commit de
> intel de verdade em `main` (`55404a8`, 21/09 — base do PR #155) até hoje
> (`868d2c8`). **Esta rodada recuperou três semanas de trabalho represado**
> — ver "O parágrafo". Reescrito a cada `/intel`. Fonte: o git e o GitHub,
> não o config.

## O parágrafo

O achado do dia não é de mercado, é operacional: **o próprio pipeline do
`/intel` estava quebrado havia duas semanas, e ninguém tinha notado.** O
PR #153 (14/09, 36 itens, verde, `mergeable_state: clean`) nasceu `draft` e
morreu `draft` — zero commit, zero review, zero clique em "Ready for
review". O PR #155 (21/09) reconheceu isso, absorveu os 4 commits do #153
como base e produziu mais 17 itens — e **repetiu exatamente o mesmo
destino**: também `draft`, também parado, também sem ninguém olhar, 7 dias
até esta rodada. Resultado prático: `docs/intel/` em `main` estava
congelado na foto de 07/09 (194 linhas de `seen.jsonl`) enquanto duas
rodadas inteiras de trabalho — 53 itens julgados, `STATE.md` reescrito duas
vezes, um spike promovido a `BACKLOG.md` (`elevenlabs-queueing`) — viviam
em branches que ninguém mergeava. Esta rodada recuperou o conteúdo dos dois
PRs (a branch `intel/2026-09-21` já continha o `intel/2026-09-14` como
ancestral, então não há nada para duplicar) e **fecha os dois PRs sem
merge**, exatamente como cada um recomendava para o anterior — este PR já
carrega tudo. Fora do `/intel`, a semana de código foi a mais movimentada
desde o pacote de auditoria de 01/09: depois de 7 dias sem nenhum commit em
`main` (registrado no `STATE.md` da rodada de 21/09), a esteira Olímpia
recebeu uma rodada de correção de mira (diagnóstico formal de 30 dias: 36
respostas, 0 prévias, nota 1,55 — a taxa de conversão do funil de
prospecção estava, na prática, zerada) mais uma revisão de segurança em
cima dela (PR #162, 4 commits: falha de portão que deixava resposta
barrada seguir como "enviada", parqueamento incorreto em "recusou", veto de
privacidade), e a landing fotográfica represada desde 06/09 (PR #140, ainda
aberto) foi **superada por um esforço paralelo e diferente**: um "hero" de
produção construído sobre um conjunto de componentes de protótipo distinto
(`client/src/prototype/*`), publicado direto em `/` via PR #157 (squash,
sem draft) e três PRs de acabamento (#158–#160). O teste de conexão do
WhatsApp que nunca devia virar pesquisa — item central do #140 — **também**
saiu, mas pela PR #156, com o mesmo texto de commit. Ou seja: o conteúdo do
#140 chegou a `main` por um caminho totalmente diferente do PR que o
carrega, e o #140 provavelmente já é redundante — ver "O que está em voo".

## O que shipou

- **Olímpia — diagnóstico formal e correção de funil** (4 commits,
  27/09): áudio de lead nunca chegava ao Whisper porque o pacote `form-data`
  com `fetch` nativo mandava a string literal `"[object FormData]"` em vez
  do multipart real — **8 áudios de leads entre 06/08 e 07/09 voltaram 400
  em silêncio**, corrigido para `FormData`/`Blob` nativos.
  `dispatchFollowups` parava de mandar o próximo toque quando um anterior
  já tinha falhado (12 de 15 toques nível-3 iam para uma intro que nunca
  chegara). Pergunta sobre o produto ou objeção "já resolvido" passou a
  virar `criar_demo` sempre, `sendReply` passou a falhar fechado no
  claim-linter (frase fora do style pack saiu 4x), e a nota diária parou de
  penalizar conversa sem fala da Olímpia. Entrou o piloto de campanha do
  Racha: lista escolhida à mão, sem o piso de avaliações/nota do fluxo
  normal, sem template de reserva embutido.
- **Revisão de segurança da própria correção acima** (PR #162, mesmo dia):
  resposta barrada pelo portão de claims não seguia mais como "enviada" —
  agora vira `handoff` com motivo, entra no digest do fundador. Pedido de
  remoção de dado ou pergunta "de onde veio meu número" nunca mais vira
  prévia (veto de privacidade); "já resolvido" passa a parquear como
  recusa mesmo sem o detector de recusa disparar.
- **Landing fotográfica superada por um hero paralelo**: `d38c5b5`/PR #157
  publica um "restaurant hero" em produção usando componentes de
  `client/src/prototype/` (não os `PhotographicHero`/`LiveServiceCanvas` do
  PR #140), com três PRs de acabamento (#158 SPA→documento físico, #159
  alinhamento de dias do cenário de demo, #160 paleta do hero alinhada à
  demo de reserva). PR #156 corrige o mesmo bug do teste de conexão do
  WhatsApp que o #140 já corrigia (template fixo, idioma do agente, polling
  só com entrega pendente) — commit quase idêntico, PR diferente.

## O que está em voo

- **PR #90** (aberto 26/08, agora **33 dias**, `mergeable_state: clean`,
  zero commit/comentário desde a criação): ainda o item mais velho parado
  sem explicação — remove dois specs do Racha que zeravam a coleta e2e
  inteira (0 testes coletados) e que, sem configuração, disparavam contra
  produção de **outro produto**. Pequeno (42+/8-), isolado, parece só
  esperando um clique.
- **PR #140** (draft, aberto 06/09, agora **22 dias**): landing fotográfica
  + teste de WhatsApp + lição das oito rodadas. **Ficou redundante nesta
  janela** — o teste de WhatsApp já saiu por outro PR (#156, texto de
  commit quase idêntico) e a landing em produção hoje usa um conjunto de
  componentes diferente do que o #140 propõe (`PhotographicHero`/
  `LiveServiceCanvas`/`CinematicServiceStory` vs. o que foi ao ar via
  `client/src/prototype/*`). Não dá para saber sem o Stefano se isso é
  intencional (a landing do protótipo venceu por decisão) ou acidental (os
  dois esforços não sabiam um do outro) — **não arquivado por decisão
  própria, só registrado**.
- **PRs de dependabot em rotação sem revisão**: `#149`/`#151`/`#152`
  (recriados 14/09, agora **14 dias**) mais `#154` (21/09, **7 dias**) — os
  quatro originais de 07/09 já fecharam substituídos por esses; nenhum foi
  revisado em nenhuma das três últimas passadas.
- **7 issues `[design-drift]`** — abertas e paradas desde 2026-05-25, agora
  **126 dias**, nenhuma tocada em nenhuma janela registrada por este
  pipeline.
- **Eval do Manager AI** (PR #99, 20 casos) — segue bloqueado por
  `OPENROUTER_API_KEY` ausente neste ambiente, mesma barreira há semanas.
- **G5 — onboarding em conversa** — nenhum commit nesta janela tocou
  `onboarding-agent.js`/`onboarding-draft.js`/`agent-loop.js`.
- **BACKLOG.md#elevenlabs-queueing** (PROTOTIPAR 12/15, promovido em
  21/09) — segue aberto, sem spike rodado.

## O que morreu

Nada removido de propósito nesta janela — só correção de bug (Olímpia) e
substituição não-anunciada (landing: protótipo em vez de fotográfica).

## Áreas quentes

`api/_lib/prospecting/*` (Whisper multipart, follow-up, claim-linter,
piloto de campanha do Racha — cinco commits em dois dias, vale revisão
extra no próximo toque), `client/src/prototype/*` (a landing que
efetivamente foi ao ar), `docs/intel/*` (área quente de **processo**: dois
PRs seguidos do próprio pipeline morreram em draft — ver "O parágrafo").

## Divergências com o config

Nenhuma linha de `bets`/`known_gaps`/`settled` tocada por julgamento nesta
janela — sem candidato de mercado que exigisse decisão sobre elas antes da
leitura desta semana (ver `INTEL.md`). Um ponto **fora** do
`intel.config.json`, registrado aqui por não ter outro lugar: o
`sub_products[1]` ("Olímpia") ganhou nesta janela um mecanismo de campanha
por lista curada (piloto do Racha) que ainda não está descrito no config —
mecânico o bastante para registrar, não para o `/intel` editar sozinho
`bets`/`settled` sobre isso.
