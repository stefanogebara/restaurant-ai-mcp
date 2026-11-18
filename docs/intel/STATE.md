# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-11-16. **Achado que precede o git desta
> janela, e que muda como ler todo o resto deste arquivo:** o clone desta
> sessão veio **raso** (`git rev-parse --is-shallow-repository` = `true`);
> antes de `git fetch --unshallow` a janela "desde 2026-09-07" aparentava
> **zero commits entre 07/09 e 09/11** — um congelamento de dois meses que
> não existe. Depois do unshallow, `main` tem 2954 commits, e há 140
> commits não-merge entre 07/09 e 09/11. Isso importa porque **essa janela
> já foi lida, a fundo, por seis rodadas de `/intel` que ninguém mesclou**:
> `intel/2026-09-14` → `2026-09-21` → `2026-09-28` → `2026-10-26` (PR #214)
> → `2026-11-02` (PR #218) → `2026-11-09` (PR #286), cada uma herdando a
> anterior, exatamente como a própria #218 recomendou fazer e a própria
> #286 repetiu. `docs/intel/` em `main`, porém, continua congelado no
> snapshot de 2026-09-07 — nenhuma das seis rodadas chegou a ser revisada
> ou mesclada. Esta rodada faz a mesma coisa que as seis anteriores: parte
> da mais recente (`intel/2026-11-09`, PR #286) em vez de redigitar dois
> meses de arqueologia, e cobre só a janela genuinamente inédita: de
> `63585fc` (PR #284, 09/11 — onde a #286 parou) até `e0299bf` (PR #349,
> 16/11, `HEAD` de `main`). São 166 commits (112 não-merge, 54 merges),
> **inteiros dentro de uma única semana** (09–16/11, com 2026-11-14 como
> único dia parado) — não dois meses de trabalho, uma semana intensa depois
> de uma retomada. Fora de `main`: a cadeia de intel represada ganhou um
> **quarto elo em potencial** se esta rodada também não for mesclada — ver
> "O que está em voo". Reescrito a cada `/intel`. Fonte: o git e o GitHub,
> não o config.

## O parágrafo

A semana (10–16/11) tem um gatilho claro: em 11/11, uma auditoria
("auditoria-nov11-entrega", PR #328, co-autoria Claude Opus 5.5) reproduziu
contra um Postgres descartável — com as mesmas funções SQL da produção —
as jornadas "hóspede muda ou cancela" e "IA cria reserva", e achou **quatro
caminhos que pulam a regra central de reserva**: o portal do cliente mudava
e cancelava sem checar horário, capacidade, mesa ou estado; a voz ignorava
mesa cheia (reproduzido: 12 pessoas em 8 lugares, depois de passar pelo
WhatsApp); o validador lia horário em UTC e recusava a própria noite por
fuso errado; e **Google/parceiros nunca funcionaram, nunca** — o
`CreateBooking` do Google inseria sem `reservation_id` (coluna `NOT NULL`,
toda reserva falhava) e o webhook de parceiro procurava a chave numa
`public.api_keys` que não existe (403 sempre). Medido em 12/11: **zero
reservas** desses dois canais já existiram em produção. O resto da semana
(11–15/11, PRs #329–#344) é a correção sistemática de cada caminho: voz,
WhatsApp, portal, Google e parceiros passam a reservar e mudar por duas
funções SQL únicas (`book_guest_reservation`/`mutate_guest_reservation`),
com trava `FOR UPDATE` no restaurante contra reserva concorrente
(reproduzido e corrigido em #333: duas vozes simultâneas furando a
capacidade), checando fuso, antecedência mínima (#337, unificada em 1h por
PR #349 no fim da semana) e limite de grupo pela mesma regra em todos os
canais. Em paralelo, e antes disso, 10–11/11 foi uma segunda frente, de
outro agente (branches `codex/*`, sem co-autoria Claude): uma leva de ~25
PRs pequenos endurecendo o fluxo de recibo de voz (ortografia ditada,
confirmação por teclado, onboarding em folha única) — território adjacente,
não o mesmo bug. E, fechando a semana (14–16/11), duas frentes de
ferramenta: `audit:phantom-columns` ganhou um segundo tipo de checagem —
comparar o **corpo das funções SQL** com a produção, não só a existência de
tabela (achou 3 das 23 funções com diffs de espaço/comentário, e uma
função mergeada em 11/11 que nunca tinha sido aplicada — só o smoke test
pegou) — e a ElevenLabs ganhou limpeza de órfãos: agentes de restaurantes
que não existem mais, e ferramentas que nenhum agente vivo referencia,
ambos só com prova, nunca por força bruta. No meio disso, um vazamento de
custo: o `ignoreCommand` da Vercel não via a regra "só produção constrói"
(decidida em 23/09), e ramos de agente geraram ~12 builds pagos de
pré-visualização em 10–11/11 antes da correção (#320).

## O que shipou

- **A auditoria que achou os quatro caminhos, e por que GOOGLE/PARCEIROS
  nunca existiram de verdade** (PR #328, 11/11): reproduzido em Postgres
  descartável com as funções de produção (`scripts/auditoria-reservas/
  run.sh`). Portal muda/cancela sem regra; voz ignora mesa cheia; validador
  lê horário em UTC (19h em São Paulo virava 22h, recusando a própria
  noite); Google `CreateBooking` inseria sem `reservation_id` (sempre
  falhava) e sem olhar horário/capacidade; webhook de parceiro batia numa
  tabela (`public.api_keys`) que não existe (sempre 403). **Zero reservas
  do Google ou de parceiro já existiram em produção** — não é regressão, é
  "nunca funcionou".
- **Regra única de reserva, por canal, PR por PR** (#333 `reserva-atomica`,
  #335 `reserva-parceiros`, #337 `voz-limite-antecedencia`, #338
  `voz-checar-disponibilidade`, #340 `whatsapp-limites`, #341
  `google-disponibilidade`, #343 `disponibilidade-regra-unica`, #345
  `pagina-horarios`, integrações `portal-regra-central`/`validador-fuso-
  restaurante`/`voz-propria-prova`/`voz-email-espera`/`voz-capacidade-
  canais`/`whatsapp-codigo-completo` em 11/11): `book_guest_reservation`
  trava o restaurante (`FOR UPDATE`) e confere horário, fuso, antecedência,
  limite de grupo e lugares de **todos os canais** (incluindo `pending`)
  antes de inserir; `mutate_guest_reservation` faz o mesmo para mudança e
  cancelamento. Reproduzido com script de barreiras
  (`c4-criacao-concorrente.cjs`): duas vozes na mesma mesa, 12 lugares num
  salão de 8 — corrigido. Google agora reserva por essa função com origem
  `google`, chave de idempotência `google:v1:<sha256>`, hora local do
  restaurante; parceiro agora autentica por `verifyApiKey` (hash em
  `restaurant.api_keys`, não a tabela inexistente) com permissão
  `reservations:import`. Antecedência mínima de 1h unificada por canal no
  fim da semana (#349 `aviso-minimo`).
- **Checagem de migração passa a comparar função SQL, não só tabela** (#336
  `auditoria-funcoes`, 14/11): `scripts/lib/migration-functions.js` extrai a
  última definição de cada função em `supabase/migrations` e compara com
  `pg_proc.prosrc` via `public.audit_function_sources(text[])` (só
  `service_role`, API REST — CI não tem acesso a `pg_catalog` direto).
  Gatilho real: em 11/11 uma função de confirmação por teclado foi
  mergeada e nunca aplicada em produção — só o smoke test pegou; as
  funções de reserva dos PRs #333/#335 tinham sido conferidas só à mão, por
  md5. Medido em 14/11: 19/23 funções idênticas, 3 só com diff de
  comentário/EOL, e `restaurant.confirm_event_booking` com duas variáveis
  não usadas removidas.
- **ElevenLabs: limpeza de órfãos, só com prova** (#342
  `apagar-agente-com-ferramentas`, #344 `limpar-ferramentas-orfas`, #346
  `sincronizar-todas-ferramentas`, #347 `apagar-agentes-orfaos`): apagar
  agente carrega consigo suas ferramentas (ordem agente-primeiro,
  ferramentas com `force`, resposta conferida); a sincronização de
  ferramentas agora compara as 7 reais (não só as 3 de hóspede); a limpeza
  de ferramentas órfãs lista por grupo e apaga só o que nenhum agente vivo
  referencia; agentes de restaurantes que não existem mais são apagados —
  só com prova, nunca por força.
- **Idioma e fuso passam a nascer corretos** (#329 `fuso-onboarding`, #330
  `idioma-agente`, #331 `sync-idioma-elevenlabs`, #332
  `voz-idioma-ferramentas`, 12/11): todo restaurante novo nasce no fuso da
  cidade (a coluna tinha default `UTC`) e no idioma do país, por um mapa
  só; o agente de voz passa a acompanhar essa configuração, e ferramentas
  de data antigas presas a hosts fixos podem ser atualizadas.
- **Vercel: pré-visualização nunca constrói, de verdade** (#320
  `vercel-sem-preview`, 11/11): a regra de time desde 23/09/2026 ("só
  produção constrói") estava configurada no projeto, mas o `ignoreCommand`
  de `vercel.json` passava por cima dela e `vercel-ignore-build.sh` só
  olhava caminhos alterados — ramos de agente tocando `api/`/`client/src/`
  geraram **~12 builds pagos de pré-visualização em 10–11/11**. O script
  agora pula quando `VERCEL_ENV` existe e não é `production`; sem a
  variável (fora da Vercel), vale a regra por caminho de antes. Testado
  contra um repositório git temporário de verdade, não mock.
- **Segunda frente, agente diferente, mesmo território adjacente — fluxo de
  recibo de voz** (~25 PRs `codex/*` sem numeração sequencial de commit,
  #289–#320, 10–11/11, sem co-autoria Claude — outro agente/sessão): voz só
  muda/cancela com confirmação por teclado explícita do titular
  (`native-guest-mutations-fail-closed`, #316 — recusa mutação por telefone
  sem prova, só permite consulta); ortografia ditada de código de reserva em
  PT/ES; onboarding em folha única; detalhes de chamada e navegação mobile
  dos Calls corrigidos; duração média de chamada só sobre amostra
  encerrada. Território vizinho ao da auditoria de reservas, não o mesmo
  bug — vale ler como simultâneo, não como parte do mesmo esforço.

## O que está em voo

- **A cadeia de intel represada ganhou um elo — e esta rodada seria o
  quarto se também não for mesclada.** `intel/2026-10-26` (PR #214, draft,
  aberta há três semanas), `intel/2026-11-02` (PR #218, draft, aberta há
  duas) e `intel/2026-11-09` (PR #286, draft, aberta há uma) continuam
  abertas, sem review, cada uma superada pela seguinte. **Recomendação
  explícita, repetida da rodada anterior e agora mais urgente — são três
  elos represados, não dois:** fechar #214, #218 e #286 sem merge quando a
  PR desta rodada for revisada; ela herda e supera as três. O mecanismo "a
  próxima rodada herda a anterior" só funciona enquanto alguém eventualmente
  revisa e mescla uma — não revisar nenhuma deixa este backlog crescer para
  sempre em paralelo a `main`.
- **PR #169** (`codex/phone-tenant-safety`, draft, autodeclarada "não
  mesclar" até confirmação manual de qual restaurante é dono legítimo de
  número duplicado) — território que pode já estar coberto: esta mesma
  janela tem um commit direto em `main`, não ligado a PR aberta,
  `dbf11e9` "route inbound calls only to unique phone owner" (07/11), que
  parece atacar exatamente esse problema. Vale conferir se #169 já está
  resolvida antes de continuar represando.
- **PR #165** (`codex/platform-insights-redesign`, draft, `dirty`) — sem
  mudança nos bloqueios já registrados (nota visual, OAuth de Preview,
  merge de CRM inseguro).
- **PR #140** (draft) — sem mudança; coexiste com versão já publicada por
  artefato estático. Fechar é chamada do Stefano.
- **PR #90** (`claude/e2e-racha-quebra-listagem`, não-draft, aberta há
  meses) — segue aberta e sem bloqueio declarado; candidato a merge rápido,
  como nas duas rodadas anteriores.
- **5 PRs de dependabot abertos** (`#198`, `#206`, `#215`, `#216`, `#348`)
  — nenhum mesclado; todos antecedem a semana de 166 commits e precisam de
  rebase.
- **Eval do Manager AI e G5 (onboarding em conversa)** seguem intocados:
  nenhum commit desta janela toca `onboarding-agent.js`/`agent-loop.js`; o
  arnês de 20 casos do Manager AI não rodou.

## O que morreu

- **O `known_gap` do `fly.toml` apontando para caminho de build inexistente
  — RESOLVIDO, mecânico.** `fly.toml` na raiz agora aponta para
  `api/_voice-server/Dockerfile` (confirmado lendo o arquivo agora: existe
  e bate com o diretório real). O commit é `efb1da1f` ("restore Fly image
  build after server move", 08/11) — fora desta janela de 166 commits, mas
  dentro do hiato que o clone raso tinha escondido, e que a rodada de
  `intel/2026-11-09` ainda registrava como aberto (não tinha alcançado
  esse commit). Fica para a seção de divergências: é fato verificável no
  código, candidato a sair de `known_gaps`.
- Fora isso, nada removido de propósito: a semana inteira foi correção de
  regra (reserva) e de ferramenta (auditoria, limpeza de ElevenLabs), não
  descarte de feature.

## Áreas quentes

`api/_lib/pos/service-completion-core.js` + as duas funções SQL novas de
reserva (`book_guest_reservation`/`mutate_guest_reservation` — acabaram de
absorver cinco canais numa semana), `api/google-booking/server.js` +
`api/external-booking-webhook.js` (nunca funcionaram até esta semana — sem
tráfego histórico para comparar, qualquer regressão é silenciosa),
`scripts/lib/migration-functions.js` + `public.audit_function_sources`
(novo, vale rodar a cada PR que toque função SQL), `api/_services/
elevenlabsAgentService.js` (limpeza de órfãos, território onde apagar
errado é destrutivo), `vercel-ignore-build.sh` (acabou de custar ~12 builds
pagos), e a própria fila de PRs represados (`#214`/`#218`/`#286` de intel,
mais `#169`/`#165`/`#140`/`#90` + 5 de dependabot) — crescendo há quatro
rodadas seguidas.

## Divergências com o config

1. **`known_gap` do `fly.toml` — checar para remoção.** Como registrado em
   "O que morreu": o caminho de build quebrado (`api/voice-server/
   Dockerfile`, sem *underscore*) que o `intel.config.json` registra desde
   agosto **não existe mais** no `fly.toml` atual — está correto
   (`api/_voice-server/Dockerfile`), desde o commit `efb1da1f` de 08/11.
   Fato verificável no git e no arquivo, sem ambiguidade. Não editado aqui
   (fora do escopo deste arquivo); fica registrado para quem tratar
   `intel.config.json` decidir a remoção da entrada.
2. **`CLAUDE.md` (fora do `intel.config.json`, registrado por não ter outro
   lugar) — a tabela de cron jobs continua desatualizada**, e agora por um
   motivo adicional: `api/cron/send-reminders.js` e os demais crons citados
   na tabela do `CLAUDE.md` não existem mais nesse caminho — foram
   consolidados em `api/_crons/*.js` desde a reforma de 36→3 despachantes
   (registrada na rodada de 2026-09-07). Confirmado agora que
   `api/_crons/send-reminders.js` ainda **não lê `whatsapp_provider`** antes
   de escolher o canal — o `known_gap` do roteamento hardcoded de WhatsApp
   (reminders sempre Twilio, campanhas sempre Meta) **permanece aberto**,
   sem mudança nesta janela. Fora do escopo deste pipeline corrigir a
   tabela do `CLAUDE.md` — só registrar que a divergência persiste e
   ganhou mais uma camada (caminho de arquivo, não só rota/cadência).
3. **Achado novo, candidato a entrar em `known_gaps` — decisão de quem
   tratar o config, não mecânica:** a auditoria de 11/11 (PR #328) provou
   que os canais Google e parceiro de reserva **nunca funcionaram em
   produção** (zero reservas, bugs desde a criação) — isso é mais forte do
   que o `known_gap` atual sobre "reserva externa pode chegar sem
   telefone", que supõe que a reserva ao menos se cria. Ambos os caminhos
   foram corrigidos nesta semana (ver "O que shipou"), então o gap em si
   pode já estar resolvido — mas vale conferir em produção com tráfego
   real antes de fechar, já que nunca houve volume histórico para
   comparar.
