# Onboarding do Aha — a ponte que cumpre a promessa do demo

**Data:** 2026-08-24 (noite) · **Sucede:** `.claude/plans/2026-08-24-demo-conversa/` (funil do demo, completo)
**Status:** G0→G4 COMPLETAS e mergeadas (#63, #65, #68, #71, #73). Resta o
norte G5 (Onboarding em Conversa) e a decisão D4.

**Achados que só apareceram implementando** (nenhum estava na auditoria):
- O mapper de horários do prefill lia `.open`/`.close`; o demo grava
  `.open_time`/`.close_time` → TODO horário prefillado caía nos defaults
  12:00–23:00 em silêncio. (G0)
- A suíte inteira do `complete.js` rodava com `userId` null (o mock tinha
  `id`, o código lê `sub`) — a escrita do config NUNCA era exercitada, e o
  endpoint devolve 200 mesmo pulando ela. (G0)
- O guarda de contrato de colunas só lia o literal `restaurantConfigData`;
  campo atribuído depois escapava — a classe de bug que ele existe para
  pegar. (G2)
- `syncKnowledgeBase` era fire-and-forget: na Vercel a lambda congela após a
  resposta, então o documento de conhecimento do agente provavelmente nunca
  era gerado. Mais grave depois da G2, que é quem leva persona e cardápio do
  demo para dentro do agente. (G3)
- **Duas acusações de "código morto" da auditoria eram falsas**:
  `/api/demo/convert` (o Welcome chama a cada load) e
  `api/onboarding/extract.js` (extrator do chat). Ler código e mexer no
  código descobrem coisas diferentes — apagar por leitura estática é como se
  perde peça viva. (G2, G4) D3 resolvida (norte = G5 Onboarding em Conversa). D4 aberta. Bônus do G0: mapper de horários do prefill lia .open/.close (tudo caía nos defaults) e a suíte do complete.js rodava sem userId (escrita de config nunca exercitada).

---

## 1. Tese

O demo agora entrega o aha ("sua IA fechou uma reserva na sua frente") e promete,
no card que o dono clica: *"Sua recepcionista IA já está configurada com tudo
isso"* e *"Seus dados continuam aqui"*. A ponte demo → conta paga **inverte cada
uma dessas promessas**, verificado ao vivo (screenshots) + mapa completo do código:

1. **Login diz "Bem-vindo de volta"** a quem nunca teve conta — modo `signin`
   default (`Login.tsx:44`), signup é um link de rodapé, e NADA na tela reconhece
   o demo (nome do restaurante, reserva guardada). O momento de maior intenção do
   funil recebe a tela mais genérica do produto. Bônus: `trackSignupStarted` só
   dispara no modo signup → converts pelo tab default são invisíveis no funil.
2. **Passo 1 trava no país que já sabemos**: o prefill grava `country` mas nunca
   `country_code` (`Onboarding.tsx:207-208` vs `Step1Welcome.tsx:57`) → seletor
   vazio, cidade desabilitada, "País é obrigatório"; e ao escolher o país,
   `LocationSelector.tsx:164` **apaga a cidade prefillada**. As duas coisas mais
   óbvias que o demo sabe são as duas que o dono re-digita — sob um banner que
   diz "Preenchemos com os dados do seu demo".
3. **E-mail fake vira contato real**: demo sem contato tem
   `demo-xxxx@demo.seatable.one` na coluna email (F1); o prefill copia para o
   form (`Onboarding.tsx:211`), passa nas regex do front e do `complete.js`, e
   vira o e-mail transacional do restaurante — buraco negro.
4. **A cozinha vira 'other'**: três vocabulários incompatíveis
   (demo `casual_dining` _ · tiles `casual-dining` - · Google texto livre) —
   nenhum tile acende no Passo 1 e `complete.js:482-508` cai em `'other'`.
5. **O conhecimento do demo morre na ponte**: `ai_personality` (vibes/LLM),
   `menu`, `insights`, 5 reviews, `agent_language` (com fallback por prefixo de
   telefone que o `complete.js` NÃO reimplementa), `reservation_settings`,
   `vibe_tags` do caminho F4 — **tudo descartado**. O Passo 6 re-entrevista o
   dono sobre cozinha/clima/pratos que o demo já derivou. A recepcionista criada
   pelo `complete.js` nasce sem nada do que a do demo sabia.
6. **Nurture continua após o signup**: `/api/demo/convert` (F6/#57) só é chamado
   no `/welcome` — e o caminho real de conversão nunca volta lá
   (`Onboarding.tsx:326` → dashboard direto). `demo_converted_at` fica null →
   os e-mails "seu demo expira" seguem indo para um CLIENTE PAGANTE.
7. **Conclusão silenciosamente quebrada**: `complete.js` retorna `200 success`
   mesmo quando ElevenLabs agent, registry (WhatsApp), subscription ou KB sync
   falham — "Bem-vindo a bordo!" sobre uma instalação sem agente de voz. E o
   clique mais comprometido do produto espera 3-10s num botão "Configurando..."
   sem estágio, sem teto de tempo.
8. **Trilha lateral vaza**: 3 CTAs da sidebar do demo ainda vão para `/login`
   sem token (`DemoSidebar.tsx:232,240,283`) — exatamente o clique "quero a
   feature travada, toma meu dinheiro" perde todo o prefill.

E do walkthrough visual do demo: o card de vendas exibe **uma review de 1
estrela em primeiro** (ordem crua do Google); demo criado à noite mostra
"Tudo em Dia — sem reservas futuras" logo após o aha (seeds em horários fixos
19:30-20:30 já passados); foto sem skeleton durante o load.

**Coordenação:** o PR #54 (outra sessão) refez o VISUAL do onboarding (Liquid
Glass v2) e plantou `warmPalette.test.ts` (83 asserções). Este plano não mexe em
paleta/tipografia — é fluxo, dados, copy e sistema. Qualquer JSX novo segue
DESIGN.md (tokens, sem font-bold em serif, sem emoji-ícone) para não quebrar o
teste-guarda deles.

**Restrição de verificação:** não posso criar contas nem digitar senhas
(regra dura) — a perna login→onboarding não ganha E2E meu; a verificação é
por testes de componente/unidade + walkthrough do Stefano num navegador logado.

---

## 2. Decisões do Stefano

**D3 — RESOLVIDA (24/ago, "sou fã de fazer num chat"):** o Stefano definiu o
norte — onboarding COMO CONVERSA: perguntas no chat, cards com opções, chain
of thought visível, diagramas/imagens, e o backend MONTANDO o restaurante em
tempo real enquanto conversa (buscando na web, refinando, analisando). O
`/onboarding-chat` atual não morre nem vira o produto: é um motor de fluxo
determinístico bem tipado (espinha de coleta de slots) SEM camada agêntica —
avaliado como fundação parcial na G5 abaixo. Nada de matar até a G5 decidir o
reuso.

**D4 — Copy Brasil:** o card do demo e o signup prometem "14 dias grátis", mas
`complete.js:876-905` dá ao Brasil plano **Free permanente** (fim em 2099).
Prometemos um trial pior que a realidade. Opções: (a) copy pt-BR vira "Grátis
para os primeiros restaurantes — sem cartão, sem prazo" (verdade atual, mais
forte); (b) mudar o billing BR para trial de 14 dias (mexe em dinheiro — só
com pedido explícito). Recomendo (a).

---

## 3. Fases

### G0 — Estancar (correções que shipam já, independentes de redesign)

- [x] 0.1 **Login abre em SIGNUP no `from=demo`** (`Login.tsx:44`): 1 linha +
      `trackSignupStarted` passa a enxergar converts.
- [x] 0.2 **`country_code` derivado no prefill** (demo guarda ISO em `country`):
      setar ambos; e `LocationSelector` **não apaga a cidade** quando o país
      selecionado é o mesmo que já estava no estado.
- [x] 0.3 **Nunca prefillar `@demo.seatable.one`** (`Onboarding.tsx:211`) e
      `complete.js` REJEITA e-mails desse domínio (defesa em profundidade).
- [x] 0.4 **Um normalizador de tipo só**: prefill converte para o vocabulário
      dos tiles (hífen), tile acende, `complete.js` aceita — cozinha real deixa
      de virar 'other'. Teste com os 3 vocabulários.
- [x] 0.5 **Convert dispara no caminho real**: ao final do `completeOnboarding`
      (sucesso), se `LS_PENDING_DEMO_TOKEN` existe → `POST /api/demo/convert`
      aguardado com teto (lição do #53), limpa o LS no success. Welcome mantém
      o retry dele como backstop.
- [x] 0.6 **Sidebar do demo usa `conversionHref`+stash** nos 3 CTAs.
- [x] 0.7 **Prefill não clobbera rascunho retomado**: efeito pula quando
      `restored.step > 1` OU aplica só em campos ainda default; e enquanto
      `isDemoLoading`, campos do Passo 1 ficam disabled (hoje dá corrida).
- [x] 0.8 **Preset de serviço não mente nem destrói**: tile só aparece
      selecionado se os horários atuais batem com o preset; clicar no preset
      pede confirmação implícita (não sobrescreve horários vindos do Google sem
      o usuário ver o que muda — mínimo: só sobrescrever se horários ainda são
      os defaults).
- [x] 0.9 **CNPJ só para Brasil** (`country_code === 'BR'`).
- [x] 0.10 **Modal de sucesso**: botão primário leva a `?launch=1` igual ao
      countdown.
- [x] 0.11 **20 chaves i18n faltantes** (cnpj.*, step0.*, menuUrl*, stale*,
      saveExit*, fixOnStep, FIELD_LABELS do onboardingErrorMessage) nos 3
      locales.
- [x] 0.12 **Demo UI (do walkthrough)**: reviews do card ordenadas por rating
      desc (a IA já trata reclamações no AIKnows — o card de vendas não abre
      com 1 estrela); seeds de "hoje" em horários relativos à criação (demo
      criado 22h ganha 22:30/23:00 ou amanhã); skeleton na foto.
- [x] 0.13 Comentário stale `Onboarding.tsx:439` + contradição
      `Step0Search.tsx:26-28`; props `restaurantId` mortas nos Passos 5/6.

### G1 — A ponte honesta (login que continua o aha)

- [x] 1.1 **Login demo-aware**: com `from=demo&token`, buscar
      `/api/demo/session` (público) e renderizar variante: headline
      **"Assumir o {restaurant_name}"**, sub "Crie sua conta grátis — seu demo
      e sua recepcionista ficam com você", Google como ação primária, painel
      esquerdo troca os 3 feature-bullets genéricos por um card do demo (nome,
      cozinha·cidade, "sua recepcionista está de plantão"). Sem token → tela
      atual intacta.
- [x] 1.2 Corrida `replaceState` × `extraRedirectParams` (`Login.tsx:60-75` vs
      `:126`): capturar params numa ref no mount, antes do scrub — o fallback
      de localStorage deixa de ser o único fio.
- [ ] 1.3 Copy D4 aplicada — BLOQUEADA na decisão do Stefano (posicionamento).

### G2 — Onboarding que respeita o demo (compressão de fluxo)

- [x] 2.1 **`complete.js` aceita `demo_token`** e lê o demo direto do banco
      (servidor→servidor, não client plumbing): carrega `ai_personality`,
      `scraped_data.menu/insights/top_reviews`, `agent_language` (com o
      fallback por prefixo de telefone), `reservation_settings`, `vibe_tags` →
      grava no config novo. A recepcionista real nasce sabendo o que a do demo
      sabia. (`syncKnowledgeBase` já seleciona `ai_personality` — hoje manda
      vazio.)
- [x] 2.2 **Convert F4 ganha prefill**: `scraped_data.manual` (cuisine, hours,
      vibes) entra no mapeamento do prefill — hoje o convert "restaurante novo"
      chega com só o nome.
- [x] 2.3 **Cidade/país param de ser re-perguntados**: Step 0 repassa a cidade
      digitada; `applyScrapedData` carrega city/country do resultado do Google.
- [x] 2.4 **`menu_url` prefillado** do enrichment quando existir.
- [~] 2.5 **ADIADO para a G5** (o Passo 6 É uma entrevista; a G5 reestrutura
      a conversa inteira — primar uma tela que será absorvida é trabalho
      jogado fora). Texto original: **Passo 6 primed**: a entrevista abre com o que o demo já sabe
      ("Seu demo me contou: cozinha X, clima Y, pratos Z — confirmo e pergunto
      só o que falta"), pulando tópicos já cobertos.
- [x] 2.6 **Banner de prefill honesto**: só afirma "dados do seu demo" quando
      ≥N campos vieram; senão copy neutra.

### G3 — Conclusão honesta (sistema)

- [x] 3.1 **Progresso em estágios** no submit do Passo 4: "Criando restaurante →
      Montando mesas → Configurando sua recepcionista" (SSE é overkill; basta
      etapas otimistas com os tempos reais + spinner, e teto de tempo com
      mensagem honesta).
- [x] 3.2 **`complete.js` devolve o placar**: `{voice_agent: ok|failed,
      whatsapp_registry: ok|failed, subscription: ok|failed}`; modal de sucesso
      mostra pendências reais ("Agente de voz ficou pendente — reativamos
      sozinhos / veja em Configurações") em vez de festa sobre instalação
      quebrada. Timeout no `createAgent` (Promise.race, teto explícito).
- [x] 3.3 **Guarda de restaurante duplicado**: `complete.js` só faz o UPDATE
      silencioso do config existente com flag explícita; Welcome ganha estado
      de erro real em vez de despejar dono existente num segundo onboarding.

### G4 — Arquitetura e limpeza

- [x] 4.1 Extrair do `Onboarding.tsx` (695 linhas): `useDemoPrefill()` e
      `useOnboardingDraft()` testáveis — os dois bugs de corrida (0.7) viram
      testes de hook.
- [x] 4.2 **NADA a apagar — a auditoria errou duas vezes.**
      `api/onboarding/extract.js` NÃO é órfão: é o extrator LLM do
      onboarding em chat (`lib/onboarding-chat/extractors.ts` faz
      `authFetch('/api/onboarding/extract')`) — justamente a peça
      texto-livre → slot que a G5 reusaria. Mantido, como o
      `/onboarding-chat` (D3). Os campos nunca escritos do `OnboardingData`
      também ficam: o `complete.js` os lê com fallback e removê-los é
      cosmético com risco de contrato não-zero.
- [x] 4.3 Testes: prefill (country_code, e-mail fake, tipo, F4), completion
      (placar de falhas, rejeição de e-mail demo, demo_token), Welcome (erro ≠
      onboarding). Vitest + Jest; sem E2E de login (restrição acima) — pedir
      walkthrough logado ao Stefano no fim.

### G5 — Onboarding em Conversa (o norte, definido pelo Stefano 24/ago)

A tese completa o círculo: se o demo é uma conversa, o onboarding é a MESMA
conversa continuando depois do signup. A visão dele: perguntas no chat, cards
de opção, chain of thought visível ("🔍 achei seu Instagram… ✓ cardápio com 23
itens"), diagramas/imagens, e o restaurante sendo montado no backend AO VIVO
enquanto se conversa — com busca na web, refinamento, análise.

**Arquitetura-chave que isso destrava — PROMOÇÃO em vez de ponte:** a linha do
demo em `restaurant_config` já É o estado de montagem. A conversa de
onboarding MUTA o config do demo em tempo real (horários confirmados, CNPJ,
cardápio, persona) e "concluir" vira **promover o demo a real** (attach do
user_id, is_demo=false, slug real) em vez de criar um restaurante do zero e
carregar campos por prefill. O problema inteiro da ponte de dados (seção "o
que atravessa, o que morre") deixa de existir por construção. Os seeds
fictícios continuam de fora (lição do #57) — promove-se o CONFIG, não os
dados de exemplo.

- [x] 5.1 Spike de fundação — FEITO, e derrubou a premissa (ver abaixo)
- [ ] ~~5.1 texto original~~: Spike de fundação: o que reusar — motor de fluxo tipado do
      `/onboarding-chat` como espinha determinística de slots obrigatórios
      (nunca esquecer telefone/e-mail) + `demo-chat`/persona como camada de
      voz + `enrich-restaurant`/scrape como ferramentas de pesquisa. Decidir
      reuso vs. reescrita COM código na mesa, não em abstrato.
### G5 — ARQUITETURA CORRIGIDA PELO SPIKE (24/ago)

**A premissa do plano estava errada.** Eu escrevi que o motor de
`lib/onboarding-chat/` seria a espinha determinística da G5. O spike mostrou
que ele é a peça MENOS reusável do repo para esta visão — e que a peça que
ninguém mencionou já é ~80% do contrato de UI/transporte:

**A fundação real é a stack do Manager AI**, já em produção:
`ManagerAIChatPage.tsx` + `ManagerRichMessage` + `ManagerMermaid` +
`ManagerChart` + `managerRichBlocks.ts`, servidos por `api/manager-chat.js`
(SSE de verdade, `maxDuration: 120`) sobre `_lib/manager-agent.js`
(`onPhase` + tradução de tools Anthropic→OpenRouter no `ai-client`).

- **Chain of thought JÁ é ao vivo e honesto.** Os frames `phase` são emitidos
  pelo handler EM VOLTA das chamadas de LLM, então chegam em tempo real. O
  contrato está escrito no código: *"Nunca inventa etapas: cada emissão
  corresponde a trabalho que aconteceu."* Zero transporte novo para
  "🔍 buscando no Places… ✓ 23 itens no cardápio".
- **Diagramas e gráficos na conversa JÁ existem** (mermaid + Recharts em
  fences, com skeleton enquanto a cerca está aberta). A planta das mesas
  proposta é um prompt novo, não um componente novo.
- **Mas o streaming de tokens é FAKE**: `OpenRouterClient._stream` faz um
  `_create` bloqueante e dispara o texto inteiro como um "token" só. As
  fases mascaram isso. Texto com efeito máquina de escrever exige reescrever
  `_stream` (~80 linhas, e conserta o Manager AI de quebra).
- **NÃO existe loop de agente no repo**: `manager-agent` e `prospect-agent`
  fazem UM round-trip de tool, pegam só o primeiro bloco `tool_use` e
  ignoram tools na resposta seguinte. O loop com teto de iterações (~60
  linhas) é o primitivo novo mais importante.

**O que sobra de `lib/onboarding-chat/`:** o `validateFlow.ts` e a lista de
campos obrigatórios. O motor vira **o segurança na porta do banco** — depois
de cada turno agêntico, responde "quais slots obrigatórios ainda faltam?" e
isso entra no system prompt. Não dirige a conversa; garante que telefone e
e-mail nunca sejam esquecidos. (Achado de bônus: `context` nunca muta depois
do `init()` — `advance()` devolve `state.context` verbatim — então o branch
`kind:'context'`, o único que poderia reagir a resultado de tool, é código
morto por construção. E o `RestaurantCard.tsx` existe e nunca foi ligado.)

**Riscos que o spike levantou (todos com precedente no repo):**
1. **Lambda de 60s × "montando ao vivo".** O repo JÁ perdeu essa briga:
   `restaurant-learning/research.js:95-122` desligou o gather de 3 tiers
   porque encadeava ~96s e o fire-and-forget derrubava a lambda
   (FUNCTION_INVOCATION_FAILED). Estrutural: a linha do demo é o estado
   durável, todo resultado de tool é persistido assim que volta, e pesquisa
   longa é job de fundo que a conversa consulta — nunca dentro do turno.
2. **`cleanup-expired-demos` apaga cliente real.** `is_demo = true` + 30
   dias = hard delete de config, reservas, mesas, assinatura, memória do
   gerente e agente de voz. Promoção parcial numa lambda que pode congelar é
   bomba-relógio de 30 dias. Flip atômico (RPC), predicado do cron ganha
   `demo_converted_at IS NULL`, e um teste que garanta que o cron nunca
   seleciona linha com `user_id` real.
3. **LLM escrevendo num schema com restrições duras.** `email` NOT NULL com
   CHECK e rejeição de `@demo.seatable.one`; `restaurant_type` com três
   vocabulários; `business_hours` em dois formatos; `user_id` UNIQUE. Erro
   de PGRST no meio da conversa é o pior lugar possível. Toda tool que
   escreve passa por UM validador tipado.

**Correção de escopo:** "🔍 achei seu Instagram" NÃO é implementável hoje —
`instagram/_lib/fetch-profile.js` exige OAuth do dono, não é scraping
público. Pesquisa web de verdade = Google Custom Search
(`restaurantIntelligence.js`), que está desligado pelo risco de timeout.

**Também já corrigido pelo spike (fora da G5):** o extrator LLM
concatenava o texto do usuário dentro do system prompt (#75).

### G5 — plano de fatias (revisado)

- [ ] 5.2 UI: EXTRAIR o shell de chat do `ManagerAIChatPage` para componente
      compartilhado e montar em `/onboarding-chat`. Não construir do zero —
      cards de fase, mermaid, charts e o parser de SSE já existem.
- [ ] 5.3 Backend: `api/onboarding/agent.js` copiando a estrutura do
      `manager-chat.js` (SSE + onPhase, maxDuration 120) + o LOOP de tools
      novo. Tools: scrape-restaurant, enrich-restaurant, enrich-cnpj,
      extract (generalizado) e as mutações incrementais na linha do demo.
      Governador de custo copiado do `prospect-agent` (`consumeLlmCall`).
- [ ] 5.6 Promoção atômica (RPC) + purga dos seeds + createAgent/registry/
      subscription levantados do `complete.js`, com o `setupScorecard` da G3.
- [ ] 5.7 Endurecer `cleanup-expired-demos` ANTES da promoção existir
      (risco 2).
- [ ] 5.4 Wizard atual vira fallback (link "prefiro formulário"), não morre no
      primeiro dia.
- [ ] 5.5 Diagramas/imagens na conversa: planta das mesas proposta (o
      FloorPlanView do #50 dá a peça pronta para "montei assim suas mesas —
      confirma?"), foto do Places, preview do link de reservas.

**Impacto nas fases anteriores:** G0 e G1 intactos (bugs vivos + a costura do
login servem qualquer onboarding). G2 continua valendo — a promoção (G5) é a
forma final, mas `complete.js` aceitar `demo_token` (2.1) é o passo
intermediário compatível e entrega valor já. G3 (conclusão honesta em
estágios) vira literalmente o chain of thought da G5 — mesmo trabalho, palco
diferente. G4 idem.

## 4. Ordem

G0 (1 PR, hoje) → G1 (1 PR) → G2 (2 PRs) → G3 (1 PR) → G4 (1-2 PRs) →
G5 (spike + fatias, com o Stefano no loop de design). D4 destrava 1.3.

## 5. Métricas

- signup_started deixa de subestimar converts (0.1).
- % converts que passam o Passo 1 sem erro de validação (hoje: ~0 por
  construção — todos batem no "País é obrigatório").
- % configs pós-conversão com `ai_personality` não-nulo (hoje 0).
- `demo_converted_at` preenchido ≤1min após completion (hoje: quase nunca).
- Nurture pós-signup: zero envios a convertidos.
