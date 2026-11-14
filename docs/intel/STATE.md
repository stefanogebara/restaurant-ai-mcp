# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-11-09. **Achado que precede o git desta
> janela: existe uma cadeia de rodadas de `/intel` não mescladas —
> `intel/2026-09-28` → `intel/2026-10-26` (PR #214) → `intel/2026-11-02`
> (PR #218) — cada uma herdando a anterior em vez de redigitar o trabalho,
> exatamente como a própria #218 recomendou fazer na próxima rodada. Esta
> rodada faz o mesmo: parte de `intel/2026-11-02`, que já cobre `main` até
> `f6ab5db` (21/10, janela do PR #214) com zero lacuna. A única janela de
> git real e inédita é, portanto, `f6ab5db`→`63585fc` — de 21/10 a 09/11,
> 19 dias, dos quais os primeiros 16 (21/10–06/11) são **congelamento
> total confirmado pelo próprio #218** (zero commit em `main`) e os últimos
> 3 (07–09/11) concentram 66 commits não-merge / 66 merges — a maior
> explosão de atividade desta série inteira, toda em segurança de voz e
> telefonia. Fora de `main`: os mesmos PRs represados de sempre, mais esta
> própria cadeia de intel represada, agora com dois elos.** Reescrito a
> cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

O congelamento de três semanas que o `/intel` de 02/11 registrou terminou
em 07/11 com a pior categoria de achado: um vazamento de dado entre
inquilinos, real, em produção, por dois mecanismos empilhados. O PR #219
("Close cross-restaurant access to voice and call data") corrigiu os dois.
Primeiro, `api/_lib/auth.js` derivava `restaurant_id` do JWT preferindo
`user_metadata` — campo que o próprio usuário autenticado pode editar via
API padrão do Supabase Auth — e só caía para a consulta no banco se esse
campo estivesse vazio. Qualquer dono de restaurante podia, em tese, escrever
o `restaurant_id` de outro inquilino no próprio token e ler as chamadas e
transcrições de voz de uma casa que não é a sua. Segundo, e independente do
primeiro: a tabela `public.agent_conversations` (transcrição de chamada e
telefone de quem ligou) tinha RLS habilitado mas com uma policy
`authenticated_read_conversations` que concedia leitura a **qualquer**
usuário autenticado via PostgREST direto — sem gate de `restaurant_id`
nenhum, nem olhando para o problema do JWT. A correção (migration
`20261107_agent_conversations_service_role_only.sql`) revoga todo grant de
`anon`/`authenticated` na tabela; a leitura passa a existir só pela API
service-role, que agora resolve o inquilino direto do banco (`decoded.role
= 'authenticated'` por default, nunca herdado do token). Isto é a mesma
classe de falha do `verify-session.js` registrado no `STATE.md` de
setembro — erro engolido em silêncio virando acesso cross-tenant — só que
em voz, não em Stripe, e com uma segunda causa (RLS sem gate) que o
`verify-session.js` não tinha.

O que vem depois de #219, em 61 PRs entre 07 e 09/11 (`#220`–`#284`), é a
limpeza de um projeto de produto que mora no mesmo território: Seatable
introduziu um **número de telefone de voz compartilhado entre várias
casas** (`ELEVENLABS_SHARED_PHONE`, lido por
`api/_lib/platform-phone-policy.js`), presumivelmente para casas novas ou
em demo que ainda não têm número Twilio dedicado. Esse desenho — uma linha,
N inquilinos, identidade resolvida por conteúdo da ligação/mensagem em vez
de número — é estruturalmente frágil, e a fiação de `api/_lib/shared-voice-
binding.js` (150 linhas, criada nesta janela) existe para não deixar a
ambiguidade virar vazamento: vincular a ferramenta certa à conversa certa
(#245), rejeitar autenticação legada na linha compartilhada (#246), falhar
fechado quando a posse do número Twilio é ambígua (#222), aceitar apelido
falado com desambiguação por cidade (#276), reconhecer texto de prévia sem
vazar para o restaurante errado (#247/#248/#249), e, no commit mais recente
desta janela (`8f7b8f5`, PR #284, ainda sem numeração de merge visível no
log), reservar explicitamente a linha compartilhada **antes** de qualquer
busca por inquilino dedicado — o inverso da ordem que causava a ambiguidade.
Ao lado disso, a mesma leva corrige: o servidor de voz da Fly (empacotamento
+ runtime do Node, #258 — nota de bordo: o `fly.toml` apontando para
caminho de build inexistente, registrado como `known_gap` desde agosto,
parece finalmente endereçado aqui, a confirmar no código); dashboards que
dependiam de Realtime passam a ter fallback por refresh (#283); e reservas
feitas por voz ganham rastreio de entrega de WhatsApp (#281) — o que fecha,
em parte, o `known_gap` dos dois caminhos de WhatsApp hardcoded e
divergentes (reminders sempre Twilio, campanhas sempre Meta), mas só para a
confirmação de reserva por voz, não para os crons.

## O que shipou

- **Vazamento cross-tenant de voz/chamada, corrigido em duas frentes** (#219,
  07/11): `api/_lib/auth.js` para de confiar em `user_metadata` do JWT (editável
  pelo usuário) para `restaurant_id` — resolve sempre contra o banco agora;
  `public.agent_conversations` (transcrição + telefone do ligante) tinha RLS
  habilitado mas com policy que liberava leitura a qualquer `authenticated`
  via PostgREST direto, sem olhar `restaurant_id` — revogado por completo
  (`20261107_agent_conversations_service_role_only.sql`), leitura só via API
  service-role. Mesma classe de erro do `verify-session.js` de setembro
  (campo de posse nunca checado), com uma segunda causa independente (RLS sem
  gate) que aquele incidente não tinha.
- **Número de telefone de voz compartilhado entre restaurantes — toda a
  fiação de segurança construída nesta janela** (`#220`–`#249`, `#270`,
  `#276`–`#280`, `8f7b8f5`/PR #284): `api/_lib/shared-voice-binding.js` (novo,
  150 linhas) e `api/_lib/platform-phone-policy.js` (novo, 16 linhas, lê
  `ELEVENLABS_SHARED_PHONE`) resolvem qual conversa/inquilino uma chamada ou
  texto na linha compartilhada pertence, com reforço progressivo: falhar
  fechado em posse ambígua de número Twilio (#222), ligar ferramenta a
  conversa verificada (#245), rejeitar auth legada na linha compartilhada
  (#246), aceitar apelido falado com desambiguação por cidade e colisão
  segura (#276), confirmar reserva no idioma certo do agente/restaurante
  (#277/#279/#280), e — no commit mais recente — **reservar a linha
  compartilhada antes de procurar inquilino dedicado**, invertendo a ordem
  de busca que causava a ambiguidade original. Streams de voz do Twilio
  passam a carregar concessão de inquilino vinculada à própria chamada
  (#270, "Secure Twilio voice streams with call-bound tenant grants").
- **Ciclo de vida de chamada ElevenLabs corrigido** (#221, #228, #229,
  #232–#236, #239–#244): sincronização e retry de pós-chamada, idioma e
  sentimento preservados com fallback limitado, fuso horário correto nas
  listas de chamada, métrica de "completude" que mentia corrigida,
  transcrição retirada de respostas de listagem (só no detalhe), coluna
  inexistente removida de uma query de detalhe de chamada, ferramenta de
  data da ElevenLabs passa a ser escopada por restaurante (#228) e migração
  seletiva de ferramentas de data legadas presas a dois hosts fixos (#234).
- **Servidor de voz da Fly: empacotamento e runtime do Node corrigidos**
  (#258, "Fix Fly voice server packaging and Node runtime") — **conferido
  nesta rodada (via o spike de intel sobre preço da Fly.io, que leu o
  `fly.toml` real): NÃO resolveu o `known_gap`.** O arquivo na raiz do
  repo ainda aponta para `api/voice-server/Dockerfile`, caminho que não
  existe (o diretório real é `api/_voice-server/`). #258 corrigiu outra
  coisa (empacotamento/runtime do Node dentro do build), não esse caminho.
  O `known_gap` permanece aberto, sem alteração no `intel.config.json`.
- **Reserva por voz ganha rastreio de entrega de WhatsApp** (#281, "Track
  WhatsApp delivery on voice reservations") — toca o `known_gap` dos dois
  caminhos de WhatsApp hardcoded (reminders=Twilio, campanhas=Meta), mas só
  para a confirmação pós-reserva por voz; não resolve o roteamento dos crons.
- **Dashboards deixam de depender só de Realtime** (#283, "Refresh active
  dashboards without relying on Realtime") — fallback de atualização
  periódica quando a subscription falha ou não chega.
- **Verificação de propriedade de número Twilio e rejeição de reivindicação
  legada na linha compartilhada** (#284, commit mais recente da janela,
  ainda sem merge de PR numerado visível no log local até o fechamento desta
  rodada) — ver acima.

## O que está em voo

- **PR #214** (`intel/2026-10-26`) e **PR #218** (`intel/2026-11-02`) —
  ambas draft, `mergeable_state: clean`, zero review humano desde que
  abriram. Esta rodada (`intel/2026-11-09`) estende `intel/2026-11-02`.
  **Recomendação, repetida da rodada anterior e agora mais urgente — são
  dois elos represados, não um:** fechar #214 e #218 sem merge quando esta
  PR for revisada; ela herda e supera as duas.
- **PR #169** (`codex/phone-tenant-safety`, draft, agora 35 dias) —
  continua autodeclarado "não mesclar" até confirmação manual de qual
  restaurante é o dono legítimo de um número duplicado. **Isto é
  literalmente o mesmo território que #219–#284 acabaram de blindar** —
  vale checar se o #219 (correção de `auth.js`) ou a nova
  `shared-voice-binding.js` já resolvem o que o #169 pede, antes de
  continuar represando.
- **PR #165** (`codex/platform-insights-redesign`, draft, `mergeable_state:
  dirty`, agora 40 dias) — sem mudança nos três bloqueios já registrados
  (nota visual, OAuth de Preview, merge de CRM inseguro).
- **PR #140** (draft, agora 64 dias) — sem mudança; coexiste com a versão
  já publicada por artefato estático. Fechar é chamada do Stefano.
- **PR #90** (agora não-draft e `mergeable_state: clean`, 75 dias) — mudou
  de estado desde a rodada anterior (estava `unknown`); parece mergeável
  agora e continua sem bloqueio declarado — candidato a merge rápido.
- **5 PRs de dependabot abertos** (`#198`, `#206`, `#215`–`#217`) — a lista
  encolheu de 7 para 5 desde 02/11 (dois saíram da fila, provavelmente
  superados por bump mais novo), mas nenhum foi mesclado; todos tocam `main`
  antes da explosão de 61 commits de 07–09/11 e provavelmente precisam de
  rebase.
- **Eval do Manager AI** e **G5 — onboarding em conversa** seguem
  intocados: nenhum commit desta janela toca `onboarding-agent.js`/
  `agent-loop.js`; o arnês de 20 casos do Manager AI não rodou.

## O que morreu

Nada removido de propósito nesta janela — tudo foi correção de segurança ou
de mecanismo (auth, RLS, roteamento de telefone compartilhado), não
descarte de feature.

## Áreas quentes

`api/_lib/auth.js` (resolução de tenant — acabou de ter um incidente real),
`public.agent_conversations` (RLS — acabou de vazar), `api/_lib/shared-
voice-binding.js` + `api/_lib/platform-phone-policy.js` (novos, território
estruturalmente frágil por desenho — 1 número para N inquilinos — vai
continuar gerando PRs), `api/_voice-server/` (empacotamento Fly, a
confirmar), e a própria fila de PRs represados (`#214`/`#218`/`#169`/`#165`/
`#140`/`#90` + 5 de dependabot) — maior há duas rodadas seguidas, agora com
dois elos de intel empilhados em vez de um.

## Divergências com o config

1. **`known_gap` do `fly.toml` — checado nesta rodada, continua real.** O
   PR #258 ("Fix Fly voice server packaging and Node runtime") não resolveu
   o caminho de build quebrado: `fly.toml` na raiz ainda aponta para
   `api/voice-server/Dockerfile` (confirmado ao ler o arquivo durante o
   spike de intel sobre o aumento de preço de RAM da Fly.io, nesta mesma
   passada). Nenhuma mudança no `known_gaps` do config — ele já estava
   certo; a suspeita de resolução registrada na rodada anterior do
   `STATE.md` está descartada.
2. **Processo, de novo — agora com dois elos represados, não um:** a rodada
   de 02/11 (#218) já tinha recomendado fechar #214 sem merge quando #218
   fosse revisado. Nenhum dos dois foi revisado. Esta rodada estende #218 em
   vez de abrir uma quarta linha, pelo mesmo motivo que #218 deu para
   estender #214 — mas o represamento está crescendo, não encolhendo, e o
   próprio mecanismo de "a próxima rodada herda a anterior" só funciona
   enquanto alguém eventualmente revisa e mescla uma delas. **Recomendação
   explícita para o Stefano, não mecânica:** revisar e mesclar esta PR (ou
   a próxima) quebra a cadeia; não revisar nenhuma deixa o backlog de intel
   crescer para sempre em paralelo ao `main`.
3. **`#169` pode já estar resolvido por `#219`/`#284` e não ter sido
   fechado** — ver "O que está em voo". Não é divergência de config, mas
   vale registrar aqui para quem revisar esta rodada decidir.
