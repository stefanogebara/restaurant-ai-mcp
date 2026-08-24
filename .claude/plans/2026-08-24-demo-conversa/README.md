# Demo em Conversa — a IA atende na frente do dono

**Data:** 2026-08-24 · **Sucede:** `.claude/plans/2026-07-10-demo-experience/` ("O Espelho")
**Status:** PROPOSTO — aguardando aprovação do Stefano nas 2 decisões da seção 2.

---

## 1. Tese

O plano "O Espelho" acertou no ativo (scrape do Google como moat) e errou no palco:
o demo hoje **mostra** os dados do dono de volta para ele (endereço, nota, reviews —
tudo que ele já sabe) e **nunca demonstra** a única promessa do hero: *"Ontem às 2 da
manhã, alguém reservou uma mesa. Sua IA atendeu."*

Walkthrough completo em produção (24/ago) confirmou:

- O wow card é um espelho, não um produto. A parte boa ("Sua IA já foi treinada") está
  abaixo da dobra, atrás de uma foto que o dono já viu mil vezes.
- **Caso restaurante novo é perigoso**: busca por nome inventado ("Cantinho da Vó
  Zilda", Pres. Prudente) fez o Google fuzzy-matchar OUTRO restaurante real ("Empório
  Quintal da Vovó") e o form **auto-selecionou** como se fosse o do dono
  (`DemoSetupForm.tsx:128`). O caminho manual entrega um demo 100% genérico depois de
  a página prometer "usa os dados reais do seu restaurante".
- **Gate de e-mail contradiz a landing**: duas dobras acima está escrito "Sem
  cadastro, sem e-mail. Clique e veja como funciona."
- O maior trunfo já existe e está enterrado: `/api/demo-chat` é **IA real**,
  multi-turno, persona `recepcionista`, responde com os dados do restaurante,
  resolve "sexta" para data concreta e confirma no formato fixo 📍📅🕗👥
  (`api/demo-chat.js:217-235`). A UI (`DemoWhatsAppSim.tsx`) também já existe —
  mas só aparece se o dono descobrir a aba "WhatsApp" na sidebar do demo.

**Reframe:** o demo não é um dashboard, é uma conversa. O dono fala com a
recepcionista IA dele *como se fosse um cliente*, ela fecha uma reserva com os dados
reais dele, e a reserva **cai no painel na frente dele** — "via WhatsApp · agora".
O scrape não é vitrine; é o que torna as respostas da IA assustadoramente específicas.
Este plano é uma **re-sequenciação** do que já existe, não uma reescrita.

Fluxo alvo:

```
/demo/setup
  nome + cidade → resultados (SEM auto-select) → "É este o seu restaurante?"
      ├─ sim → cria demo SEM e-mail → ATO 1: conversa em tela cheia
      └─ "meu restaurante é novo" → 3 perguntas → persona ao vivo → ATO 1
ATO 1  chat WhatsApp com chips; IA responde com os dados DELE; fecha reserva
ATO 2  transição → painel com a reserva recém-criada no topo ("via WhatsApp · agora")
CAPTURA (depois do aha) → WhatsApp do dono (IA manda mensagem real) ou e-mail
```

---

## 2. Decisões que precisam do Stefano ANTES da Fase 3/5

**D1 — Copy da oferta.** O plano 07-10 (seção 2) decidiu "2 meses por nossa conta",
nunca "teste grátis". O funil shipado diz "14 dias grátis"/"Começar Teste Grátis" em
~6 superfícies (e um fallback ainda diz "30-day"). Este plano padroniza TODAS as
superfícies do funil numa passada (Fase 5) — mas preciso da palavra final: **(a) "2
meses por nossa conta"** conforme o plano 07-10, ou **(b) manter "14 dias grátis"** e
atualizar o plano 07-10 como superado.

**D2 — WhatsApp real na captura.** A captura pós-aha ideal é "quer continuar essa
conversa no SEU WhatsApp?" → IA manda mensagem real (infra já existe:
`TestarNoMeuWhatsApp` + `/api/demo-send-whatsapp` + rate limits `demo_wa_*`). Mas o
intel registra: **sem caminho grátis de WhatsApp após 01/10** — cada lead vira
conversa paga. Proposta: manter web-chat grátis como default, WhatsApp real como
opt-in de alta intenção, e-mail como fallback. Confirmar se o custo por lead aceita.

---

## 3. Fases

### Fase 0 — Higiene (PR independente, shipa antes de tudo)

Bugs confirmados no walkthrough + varredura de 24/ago. Nenhum depende do redesign.

- [x] 0.1 Exit-intent e footer CTA do demo apontam para `/login` **sem o token** —
      converts perdem o prefill do onboarding (`DemoDashboard.tsx:520` e `:474`).
      Usar o mesmo `conversionHref` do `RealRestaurantCard` (`:393`).
- [x] 0.2 `DemoSlideIn.tsx:87` — `t('landing.share.message')` sem `{ url }`; a
      mensagem compartilhada termina em "Teste a demo: " sem link.
- [x] 0.3 `landing.pricingTeaser.*` e `landing.demoSetup.trust.line` não existem em
      nenhum locale → fallback pt-BR vaza para EN/ES. Criar as chaves nos 3 locales.
- [x] 0.4 `api/demo/index.js:118` — `'Aniversario'` → `'Aniversário'` (regra R10).
- [x] 0.5 ES `landing.hero.typingPrefix` "Tu IA respondio" → "respondió".
- [x] 0.6 Auto-select de resultado único no `DemoSetupForm.tsx:128` — REMOVER.
      (A confirmação explícita vira UX na Fase 1; aqui é só parar de assumir.)
- [x] 0.7 Verificado em código: reveal é framer-motion `whileInView` padrão com
      `once: true`; o blank no walkthrough era o pane headless em background
      (IntersectionObserver throttled), não bug de prod.
- [x] 0.8 Docblock stale de `RealRestaurantCard.tsx:10-12` (diz que o card some no
      F5; não some mais).
- [x] 0.9 `tasks/todo.md:7` diz que os presets são "Italian/Japanese/Mexican" —
      não existe Mexican; corrigir para brazilian/italian/japanese (+makoto oculto).

### Fase 1 — Entrada sem gate + confirmação de match

Objetivo: do submit ao primeiro turno de conversa em <10s, sem pedir nada além de
nome + cidade.

- [ ] 1.1 **Backend: criar demo sem e-mail.** `api/demo/index.js` `handleCreate`:
      `contact_email` vira opcional quando `scraped_data` presente (required passa a
      `{restaurant_name, city}`). Sem e-mail: não dispara welcome email; nurture cron
      já ignora demos sem `demo_contact_email` (verificar e cobrir com teste).
      Rate limit `demo-create` continua igual.
- [ ] 1.2 **Backend: endpoint de captura tardia.** `POST /api/demo/attach-contact`
      (`?action=attach-contact` no rewrite, padrão path-based por causa de adblock):
      `{demo_token, contact_email? , contact_name?}` → PATCH no registro + dispara o
      welcome email nesse momento. Validação de e-mail igual à atual; rate limit
      `demo-create`.
- [ ] 1.3 **Frontend: passo de confirmação.** `DemoSetupForm`: resultado(s) sempre
      renderizam card com foto + endereço + "É este o seu restaurante?" →
      [Sim, é esse] / [Não, o meu é novo →]. Zero resultados ou "não é esse" leva ao
      caminho da Fase 4 (não mais ao demo genérico mudo).
- [ ] 1.4 **Frontend: remover o passo de e-mail do setup.** Submit da confirmação →
      `POST /api/demo/create` (sem email) → `navigate('/demo/:token', {state})`.
- [ ] 1.5 Eventos de funil: `demo_match_confirmed`, `demo_match_rejected`,
      `demo_new_restaurant_path` (juntar aos `trackDemoFunnel` existentes).

**Aceite:** consigo ir de nome+cidade ao demo sem digitar e-mail; nome inventado
nunca vira restaurante de outro dono sem confirmação explícita.

### Fase 2 — Ato 1: a conversa como landing do demo

- [ ] 2.1 **`ConversaPrimeiro` (novo componente, ~tela cheia).** No primeiro load de
      `/demo/:token` (flag `sessionStorage` por token), o painel abre com um overlay
      de conversa: `DemoWhatsAppSim` promovido, com o painel desfocado ao fundo
      (Warm Glass, regras R1-R14). Header: *"Fale com a recepcionista IA do
      {nome} — como se você fosse um cliente."* Chips existentes já servem.
      Botão discreto "pular e ver o painel" (nunca prender o dono).
- [ ] 2.2 **Marcador estruturado de reserva.** `api/demo-chat.js` persona
      recepcionista: instruir a IA a terminar a mensagem de confirmação com a linha
      `[[BOOKED|YYYY-MM-DD|HH:MM|party|nome]]`. Backend faz strip da linha antes de
      devolver `reply` e retorna também `booking: {date, time, party_size, name} |
      null`. (Parse no servidor, não no cliente — cliente nunca vê o marcador.)
      Teste Jest do parse + do strip.
- [ ] 2.3 **Payoff.** Quando `booking` chega: overlay fecha em transição, a reserva
      entra no `useDemoState` no TOPO da lista com badge **"via WhatsApp · agora"**
      (novo campo `source` no tipo local), stats incrementam com micro-animação.
      Scroll âncora até a linha da reserva.
- [ ] 2.4 **Wow card reposicionado.** `RealRestaurantCard` + `AIKnowsCard` descem e
      são reenquadrados: título vira *"O que a sua IA usou para te responder"* —
      suporte da mágica, não abertura. `AIKnowsCard` sobe acima da foto.
- [ ] 2.5 **Guarda de custo.** Cap de turnos por sessão de demo no servidor (ex.: 20
      mensagens por demo_token/preset por hora — novo tier ou contador no tier
      `chat`); no cliente, após o booking a UI convida para o Ato 2 em vez de
      conversa infinita. `AI_MODEL_FAST` + 300 max_tokens permanecem.
- [ ] 2.6 Eventos: `demo_chat_opened`, `demo_chat_first_reply`,
      `demo_chat_booking_confirmed`, `demo_dashboard_revealed`.

**Aceite:** em um demo recém-criado, mandar "mesa pra 4 sexta às 20h" + nome resulta
em reserva visível no painel com badge, em menos de 3 turnos.

### Fase 3 — Captura DEPOIS do aha (depende de D2)

- [ ] 3.1 **Momento de captura único e pós-payoff.** Card após o booking no painel:
      *"Gostou? Recebe essa conversa no seu WhatsApp"* → input de telefone
      (`PhoneInput` existente) → `/api/demo-send-whatsapp` (rate limits `demo_wa_*`
      já existem). Fallback: "prefiro por e-mail" → `/api/demo/attach-contact`.
- [ ] 3.2 Welcome email: reescrever o stub "BISECT" (`api/demo/index.js:163-184`)
      em pt-BR/HTML com o link do demo. (EN/ES pelo locale do demo.)
- [ ] 3.3 Nurture (`api/cron/demo-nurture.js`): traduzir pt-BR e trocar o gancho —
      em vez de "seu demo expira", *"sua recepcionista atendeu você em X segundos —
      imagine no seu WhatsApp de verdade"*. Manter janela D3/D5/D7.
- [ ] 3.4 Religar `DemoBanner` (hoje dead code) com `daysLeft` que a API já retorna
      — urgência honesta, sem contador fake (regra do plano 07-10).
- [ ] 3.5 Exit-intent (12A-4): passa a oferecer a MESMA captura de WhatsApp (spec
      original), não "Start Free Trial"; mantém o token na URL de conversão.

**Aceite:** nenhuma pedida de contato antes do primeiro booking em chat; taxa de
captura medida por `demo_contact_captured` (canal wa/email como propriedade).

### Fase 4 — Restaurante novo como primeira classe

- [ ] 4.1 **Caminho "meu restaurante é novo"** (a partir de 1.3): 3 perguntas em um
      passo — tipo de cozinha (chips), horário (dois selects), vibe (chips:
      romântico/familiar/descontraído/sofisticado). Copy: *"Restaurante novo? Sua
      recepcionista pode existir antes do seu Google."*
- [ ] 4.2 Backend: `handleCreate` sem scrape aceita `{restaurant_name, city,
      cuisine_type, vibe, business_hours}` sem `contact_name`/`contact_email`;
      `ai_personality` derivada do vibe (reusar `vibe-to-persona-preset.js`).
- [ ] 4.3 `demo-chat` persona recepcionista com bloco de dados vindo dessas
      respostas (sem reviews): mesma conversa, mesmo payoff. A confirmação da IA
      menciona explicitamente o que o dono acabou de configurar.
- [ ] 4.4 O demo desses restaurantes NÃO mostra wow card de Google (nada de espelho
      vazio): no lugar, card *"Configurada por você agora — é assim que ela vai
      atender seu primeiro cliente."*

**Aceite:** dono de restaurante sem Google chega ao mesmo booking-no-painel sem ver
nenhum dado genérico/fake apresentado como dele.

### Fase 5 — Hero e landing re-sequenciados (depende de D1)

- [ ] 5.1 Hero CTA: "Veja ao vivo ↓" deixa de rolar para o iframe e vira link para
      `/demo/setup` (a conversa é o "ao vivo" agora). Manter headline A (2 da manhã)
      — é a melhor copy do site; A/B continua funcionando por `?headline=`.
- [ ] 5.2 Seção `#try-demo` (presets) demovida para depois do BeforeAfter, com copy
      honesta: *"Só quer olhar? Explore um restaurante de exemplo."* Presets seguem
      sendo o caminho "não quero digitar nada".
- [ ] 5.3 Passada única de copy da oferta (decisão D1) em: pricing teaser, CTA
      final, exit-intent, wow card, `/precos`, e-mails. Fonte única em i18n; matar
      fallbacks divergentes hardcoded.
- [ ] 5.4 Seção WhatsApp real (+55 11 5028-2009) sobe uma posição — é prova social
      viva; CTA dela alinhado com a captura da Fase 3.
- [ ] 5.5 Regras R9/R13 do plano 07-10 que seguem violadas: badge-pill sobre o H1
      (`HeroSection.tsx:102`) e bandeirinhas emoji nos presets — resolver na passada.

### Backlog consciente (fora deste plano)

- `POST /api/demo/convert` órfão (migração de reservas/mesas no signup) — religar
  quando o funil novo estabilizar; hoje o prefill do onboarding cobre o essencial.
- Preset `makoto` inacessível — decidir se vira 4º card ou morre.
- Enriquecimento fino do menu (Fasano retornou 1 prato) — melhorar prompt de
  `enrich-restaurant` com extração de pratos por review, tarefa separada.

---

## 4. Métricas de sucesso

Funil novo (eventos GA já existentes + novos):
`setup_view → match_confirmed → chat_opened → chat_first_reply →
chat_booking_confirmed → dashboard_revealed → contact_captured → signup`

- **Norte:** % de sessões de `/demo/setup` que chegam a `chat_booking_confirmed`
  (meta inicial: >25%) e captura pós-aha ≥ captura atual com gate (baseline: 100%
  dos demos criados têm e-mail hoje, mas o denominador é quem aceitou o gate —
  medir demos criados/sessão antes e depois).
- Latência: submit → primeira resposta da IA < 10s p75.
- Custo: mensagens de demo-chat/dia e tokens (cap da 2.5 limita o teto).

## 5. Verificação

- Jest: create sem e-mail, attach-contact, parse/strip do `[[BOOKED]]`, cap de
  turnos, nurture pulando demos sem e-mail. Vitest: confirmação de match,
  ConversaPrimeiro, pop-in da reserva, captura pós-aha.
- `npx jest --forceExit && cd client && npx vitest run` verde antes de cada push.
- Walkthrough manual em prod após cada fase: existente (Fasano), novo (inventado),
  preset, mobile (<lg usa PresetDemoSection — conferir que a conversa funciona no
  embed mobile).

## 6. Ordem de entrega

F0 (hygiene PR, hoje) → F1+F2 juntas (são o produto novo; ~1 PR cada, F2 depende de
F1) → F3 (após D2) → F4 → F5 (após D1). F1+F2 já podem ir a prod com captura antiga
intacta nas outras superfícies — o gate só sai do setup quando attach-contact existir
(1.2 antes de 1.4 no merge).
