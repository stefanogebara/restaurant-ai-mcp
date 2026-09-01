# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-08-31. Janela: desde o último commit de intel
> (`50f0e2c`, PR #61, 2026-08-25) até `a5d521b` (2026-08-31), 61 commits não-merge.
> Branch única: `main` — nenhum PR aberto, nenhuma branch remota além dela.
> Reescrito a cada `/intel`. Fonte: o git, não o config.

## O parágrafo

A semana foi o onboarding. O Stefano fechou o norte em 24/08 ("sou fã de fazer
num chat") e a G0→G4 da ponte demo→conta (13 correções de auditoria, login
que continua o aha, dados do demo atravessando pro config real, conclusão que
para de mentir sobre agente/WhatsApp/assinatura) já estava mergeada antes desta
janela. O que rodou agora foi a G5 — "Onboarding em Conversa" — e um spike
próprio **derrubou a premissa do plano**: a peça reusável não era o motor de
`lib/onboarding-chat/`, era a stack do Manager AI já em produção (SSE, chain
of thought ao vivo, mermaid/gráficos em fence). Dali saíram três primitivos
novos e testados — loop de agente com teto, portão de escrita por allowlist,
segurança de slots obrigatórios — mas o endpoint que os liga (`api/onboarding/
agent.js`) e a promoção atômica do demo a conta real ainda não existem. Em
paralelo, a Olímpia teve um incidente de verdade (48 leads queimados em 6h por
um cron sem kill switch) que expôs a mesma lacuna que os outros 8 crons já
tinham fechado, o Saipos ganhou o adaptador de leitura que o spike de 25/08
tinha deixado como próximo passo, e o Liquid Glass v2 terminou de zerar os
quatro desvios do checklist (cinza frio, serif com peso falso, emoji-ícone).

## O que shipou

- **Onboarding G0→G4 completas e mergeadas** (#63, #65, #68, #71, #73) — ponte
  demo→conta para de perder dado: `country_code` derivado, e-mail fake
  bloqueado, tipo de cozinha normalizado, `ai_personality`/cardápio/reviews do
  demo atravessando para o config real, conclusão devolve placar real
  (`voice_agent`/`whatsapp_registry`/`subscription: ok|failed`) em vez de
  `200 success` sobre instalação quebrada.
- **G5 — fundação do agente de onboarding em conversa**: `_lib/agent-loop.js`
  (loop com teto de iterações e de relógio, 15 testes, #78), `onboarding-
  draft.js` (portão de escrita por allowlist — nenhuma instrução plantada em
  site/cardápio de terceiros grava `user_id` ou `is_demo`), `onboarding-
  agent.js` (junta as duas peças + segurança de slots obrigatórios). Nenhuma
  ligada a um endpoint ainda.
- **Wizard vira alternativa, não é apagado** (#89, #91, #92): a folha única de
  confirmação passa a ser o caminho padrão; as 12 perguntas da entrevista
  saem porque o `scraped_data` do demo já responde 6 das 8 seções e a 7ª (tom
  de voz) virou 4 cartões de toque. Rascunho em andamento reabre o wizard
  onde a pessoa parou.
- **Limpeza consequente**: três endpoints da entrevista sem chamador apagados
  (#97), `_demo-handler-backup.js` removido.
- **Saipos ganha o adaptador de leitura** (#69) — o spike de 25/08 tinha
  confirmado a rota viva e deixado isto como próximo passo; `api/_lib/pos/
  saipos-adapter.js` + teste cobrem as três armadilhas que a doc não avisa
  (auth não documentada, array vazio é sucesso, 404/946 é estado vazio, não
  erro). Só leitura — `close-sale` não registra pagamento, decisão registrada
  no cabeçalho do arquivo.
- **Incidente real na Olímpia, 26/08**: `prospect-enrich` queimou 48 leads em
  6h (`sem_html: 8/8` seis rodadas seguidas — o scrape não abriu página) e não
  tinha `isCronEnabled`, um dos poucos sem o interruptor que os outros 8 crons
  já tinham. Corrigido com portão depois do `CRON_SECRET` e antes de qualquer
  raspagem paga; `?dry=1` passa por cima de propósito (#103).
- **Dois bugs de mira na prospecção**: fila ordenava por `reviews_count` sem
  aplicar a faixa de elegibilidade e mirava shopping centers e Coco Bambu, que
  nunca passariam o filtro de ICP (#96); filtro de categoria deixava academia
  passar pelo fim do nome (#70).
- **Segurança — senha do sandbox sai de 12 arquivos**: 7 scripts do
  reels-toolkit, 2 specs e2e e 2 scripts de smoke tinham a senha em texto
  puro (incluindo um padrão `process.env.X || '<hardcoded>'` que parecia
  parametrizado); passam a ler `SANDBOX_EMAIL`/`SANDBOX_PASSWORD` do ambiente
  e falham alto sem eles.
- **CI**: `secrets` dentro de `if:` derrubava a criação do job silenciosamente
  (live-smoke falhava 100/100 sem tocar um secret); Playwright ficava 24 min
  mudo em CI por falta de progresso impresso.
- **Liquid Glass v2 — os quatro desvios do checklist zerados**: cinza frio
  (`3bb1081`, `d944837`), peso falso no serif (`9460fd5`), emoji virando
  ícone (`d944837`), paleta quente com trava de catraca (`04c0a92`).
- **Manager AI ganha bateria de eval** (20 casos, #99) — escrita a partir de
  linhas reais do `manager-agent.js`, **não rodada**: falta `OPENROUTER_API_KEY`
  e login (JWT) neste ambiente. Arnês pronto, espera o Stefano rodar.

## O que está em voo

- **G5 segue aberta**: falta o endpoint `api/onboarding/agent.js` (SSE +
  `onPhase`, copiando `manager-chat.js`) ligando o loop já escrito; falta a
  promoção atômica (RPC) que muta o config do demo em vez de criar do zero;
  falta desligar `Step6TeachAI` do caminho padrão (5.9); falta mesas na folha
  (5.10); falta planta/diagramas na conversa (5.5).
  Correção de premissa do próprio spike: `lib/onboarding-chat/` — que o plano
  original previa como espinha — **não é reusado**; só sobra o validador de
  campos obrigatórios.
- **D4 — copy do trial no Brasil** (Free permanente vs. "14 dias grátis"
  prometido) segue bloqueada por decisão do Stefano.
- **Eval do Manager AI** — arnês existe, ninguém rodou a bateria ainda.
- Nenhum PR aberto, nenhuma branch em voo — tudo mergeado em `main`.

## O que morreu

- **A hipótese de que `lib/onboarding-chat/` seria a espinha da G5** — o
  próprio spike a derrubou; sobra só `validateFlow.ts`.
- **A entrevista de 12 perguntas no caminho padrão do onboarding** —
  substituída pela folha + `scraped_data` do demo.
- Três endpoints da entrevista sem chamador (#97) e `_demo-handler-
  backup.js`.
- Senha hardcoded do sandbox em 12 arquivos.
- O `sem_html`/`sem_numero` somados como um número só na métrica de
  prospecção — separados porque um zero que parece veredito não é.

## Áreas quentes

`api/_lib/onboarding-draft.js`, `api/_lib/onboarding-agent.js`,
`api/_lib/agent-loop.js`, `client/src/pages/Onboarding.tsx` +
`OnboardingChat.tsx`, `api/onboarding/complete.js`,
`api/cron/prospect-enrich.js`, `api/_lib/prospecting/*`, `tasks/lessons.md`
(post-mortems continuam entrando a cada correção).

## Divergências com o config

1. **`known_gaps` sobre Saipos estava desatualizado — corrigido.** O texto
   dizia *"Consumer, Saipos e Goomer têm zero ocorrências em código — só em
   docs de pesquisa"*. Isso deixou de ser verdade em 2026-08-25/26:
   `api/_lib/pos/saipos-adapter.js` (adaptador de leitura, testado) e
   `supabase/migrations/20260825_pos_provider_saipos.sql` (estende o `CHECK`
   de `pos_provider`) existem e passam nos testes. Reformulado no config para
   registrar o que existe (leitura, não fechamento de conta — `close-sale`
   não registra pagamento) e o que ainda falta (Consumer, Goomer, e nenhum
   dos dois é código, só é hipótese do dono). Aplicado sozinho — é o mesmo
   tipo de correção mecânica que `known_gaps[1]` e `known_gaps[3]` já
   tinham recebido em 2026-08-25, não uma mudança de `bets`/`settled`.
2. **`BACKLOG.md#saipos-portao` tinha uma nota órfã** — "escrever o
   adaptador de leitura, não existe nenhum" ficou como próximo passo depois
   do spike fechado; o adaptador já existe. Atualizado no lugar, sem reabrir
   o item (que segue FECHADO).
3. Nenhuma outra `bet` ou `settled` foi tocada. O `update-vercel-env.sh`
   (arma carregada contra `settled[0]`) continua sem correção — não houve
   commit tocando nele nesta janela.
