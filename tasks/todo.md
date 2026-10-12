# Insights — pontuação honesta e idioma (12/out/2026)

- [x] Nomear o risco como pontuação heurística, não porcentagem de probabilidade.
- [x] Localizar o texto sugerido para reengajamento sem prometer vantagem não autorizada.
- [x] Evitar que o título fique sob o menu em larguras intermediárias; revisar o modal por teclado.
- [x] Testar PT/EN/ES, build e tela autenticada sem enviar e-mails.
- [x] Corrigir o mesmo ponto de quebra do menu em Integrações, Clientes, Voz, Dashboard, Salão, Serviço e Configurações.
- [x] Confirmar o cliente no escopo do restaurante antes de criar ou enviar e-mail de retenção.
- [x] Substituir rascunhos editados ao trocar idioma, com aviso visível, para não montar e-mails mistos.
- [ ] Validar o lote em produção nas larguras de celular e tablet após o deploy.

Limite: o envio individual existente não será acionado durante a revisão.

Revisão: o algoritmo calcula uma pontuação saturada entre 0 e 100, não uma probabilidade; a interface agora mostra `/100`. O texto sugerido foi traduzido em três línguas e não oferece bebida ou desconto sem autorização. O modal de Insights tem nome acessível, foco inicial e fecha com Escape. O CRM também permite escolher o idioma antes do envio. O assunto, a saudação e o rodapé do e-mail seguem essa escolha. A recusa do provedor não aparece mais como sucesso. O backend valida cliente e e-mail dentro do restaurante antes de escrever campanha; canais não implementados são recusados. Os testes focados de interface e backend, TypeScript, ESLint, Jest completo (279 suítes/4.250 testes), Vitest completo (115 arquivos/1.028 testes) e build passaram antes do rebase; falta repetir o conjunto após o último ajuste e validar o deploy.

---

# Marketing — clareza e isolamento (12/out/2026)

- [x] Impedir leitura de métricas e envio de campanhas de outro restaurante.
- [x] Mostrar o nome real, o status localizado e datas na língua da interface.
- [x] Trocar a tabela densa por uma lista legível no desktop e no celular.
- [x] Revisar automações e formulário sem disparar mensagens reais.
- [x] Cobrir com testes, build e navegação; publicar apenas após os checks.

Limite: nenhuma campanha, automação ou mensagem será ativada ou enviada em produção durante a revisão.

Revisão: o histórico usa o nome salvo em `metadata.name`, traduz estados legados e não mostra um falso total de destinatários. O endpoint agora confirma a posse da campanha antes de ler métricas ou iniciar envio. O fluxo manual continua sem entrega confiável: o formulário omitia o canal WhatsApp, o backend assumia e-mail e o processador só buscava WhatsApp; por isso a criação foi pausada na interface e o atalho duplicado em Insights virou leitura + link. Automação permanece configurável sem alterações nesta rodada. Testes focados (6 backend, 6 frontend), Jest completo (280 suítes/4.252 testes), Vitest completo (112 arquivos/1.015 testes), TypeScript, build e ESLint focado passaram. Produção confirmou em 899 e 390 px: histórico legível, estado pendente e detalhe sem falso dado de entrega; automações examinadas sem ativação. Nenhum envio real.

---

# WhatsApp — prova de roteamento antes do teste (11/out/2026)

- [x] Ler o ponteiro do registro central no GET; não anunciar conexão apenas pelo estado salvo no restaurante.
- [x] Recusar ativação se o número estiver atribuído a outra casa, se a casa estiver inativa ou se já usar outro número.
- [x] Exigir roteamento confirmado para mostrar o link da conversa; orientar suporte quando registro e roteamento divergem.
- [x] Cobrir falhas e estados com testes, executar verificação completa e conferir a interface em navegador.

Limite: o cadastro automático de número novo permanece desligado em produção. Esta etapa não faz alterações na Meta nem comprova conversa recebida. Um índice único/lock durável no registro central e um número pertencente ao restaurante ainda serão necessários antes de abrir autosserviço.

Referência visual: `DESIGN.md` Liquid Glass v2 e guia de microcopy do Refero. Manter estado na cor semântica, ação burgundy e uma instrução clara no canvas; não criar uma nova página nem prometer atendimento sem prova.

Revisão: o GET agora compara o estado do restaurante com o ponteiro ativo no registro central. O código só aponta um número se ele estiver livre, a casa estiver ativa e não houver outro número; a atualização usa condição de valor nulo, mas não substitui o índice único/lock durável exigido para autosserviço. PIN e detalhes técnicos não saem no estado público. A interface mostra aviso âmbar e bloqueia o link de conversa quando o roteamento diverge. Navegador local conferiu os estados simulado ativo e sem roteamento, sem envio real. Build, sintaxe da API, 276 suítes/4.238 testes backend e 104 arquivos/993 testes frontend passaram. Não houve alteração de banco, Meta, envios ou reserva real. A validação de mensagem recebida permanece aberta até haver um número do restaurante conectado.

---

# WhatsApp — conexão sem promessa falsa (11/out/2026)

- [x] Bloquear novas adições self-service em produção até validar o caminho da Meta e um lock durável por restaurante.
- [x] Mostrar conexão assistida quando não há número; preservar a confirmação de um número já pendente.
- [x] Cobrir o bloqueio do backend e os estados da interface, inclusive a ausência de envio à Meta.
- [x] Revisar no navegador e executar a verificação completa do projeto.

Direção fixada: preservar canvas quente, títulos Instrument Serif e uma jornada vertical. O formulário de código continua para uma solicitação já iniciada. Para um número novo, uma instrução curta e o contato de suporte substituem o formulário de envio não comprovado. A entrega pelo remetente da plataforma fica separada do teste de conversa recebida.

Decisões: (1) guardar primeiro no backend, pois um cliente antigo ainda pode chamar a API; (2) expor a capacidade na leitura para a interface refletir o servidor; (3) não inferir conexão ativa a partir do teste de entrega. A coleção oficial da Meta documenta listar números da WABA e registrar um ID conhecido, mas não prova a chamada atual de adicionar número para esta conta.

Revisão: em produção, uma nova adição de número é recusada no servidor mesmo se a flag local for ligada. O modo mock também só abre em desenvolvimento/teste fora da Vercel. A interface lê `pode_iniciar` e falha fechado se um servidor antigo não enviar o campo; um número já pendente mantém o formulário de código. O estado assistido usa conteúdo direto no canvas e apenas um link de ajuda. Playwright em Chrome examinou desktop, celular e estado ativo: sem erro de página, rolagem horizontal ou botão de envio de código no estado assistido. Testes focados: 14 backend e 17 frontend. Verificação completa: build de produção passou (avisos antigos de chunks grandes), 276 suítes e 4.234 testes backend passaram (6 pulados), 104 arquivos e 991 testes frontend passaram; sintaxe dos arquivos da API e `git diff --check` passaram. Prévia local simula estados e bloqueia envios. Não houve chamada à Meta, OTP, mensagem nova ou conversa recebida.

---

# Hero na paleta das demonstrações (25/set/2026)

- [x] Fixar a direção: papel quente `#f3f0e9`, tinta oliva `#293222`, verde de ação `#3f4e32`; manter logo e tipografia.
- [x] Reorganizar o hero para usar essas cores e aproximar a fotografia da história da reserva.
- [x] Revisar desktop e celular, navegação ao rolar, movimento reduzido e testes.
- [x] Repetir a crítica visual independente em captura limpa; registrar ressalvas reais.
- [ ] Chegar a 9/10 em crítica visual independente; a direção estética continua aberta.
- [ ] Publicar esta melhoria incremental e validar o domínio de produção.

**Referência de decisão:** a própria seção de demonstrações publicada (papel/tinta/linha), a fotografia de restaurante já aprovada e o checklist do `DESIGN.md`. Verde-oliva fica como tinta e ação editorial neste artefato; confirmação continua com estado próprio nas telas do produto.

**Revisão desta rodada:** hero, primeira demo e imagem social compartilham a paleta. A nova foto mostra a cadeira infantil solicitada; a confirmação no desktop explicita que o pedido foi anotado. No celular, o filme da reserva apresenta Marina e o pedido antes da lista e ocupa a largura da tela. Quadros 0/36/46/52/58/90 foram inspecionados para evitar sobreposição. Build, sintaxe API, 4.091 testes de backend, 985 de frontend, `git diff --check` e navegação em 320–1440 px passaram. A crítica independente ainda ficou abaixo do alvo de 9/10 (última rodada: 7,4 em desktop e celular; melhor avaliação da rodada: 7,8/8,1). Pontos abertos: composição do hero convencional e fotografia mais forte que a prova do produto.

**Revisão pré-publicação:** ao selecionar Bar do Zé e Cantina Orla no desktop, o índice de casos sobrepunha a história. O índice agora permanece no fluxo abaixo de cada painel; as três escolhas foram conferidas em 390, 768 e 1440 px, sem sobreposição ou largura excedente. O cartão estreito de chegadas foi centralizado na coluna de demonstração.

---

# Landing "Da mensagem à mesa" — revisão de produção (25/set/2026)

- [x] Isolar a landing da árvore local com alterações não relacionadas.
- [x] Testar build, suíte de frontend e backend, navegação, demos e tamanhos 320/390/1440.
- [x] Corrigir a raiz da Vercel: `index.html` físico recebe a landing; `app.html` preserva as rotas React.
- [x] Mostrar a reserva concluída no primeiro demo; corrigir teclado e coerência da história de Marina.
- [x] Remover promessas não comprovadas de Pix/devolução automática, iFood e tempo de resposta fixo.
- [ ] Confirmar enquadramento da licença Remotion para uso do Player em produção.
- [x] Conferir a prévia Vercel do commit final em `/`, `/login` e `/demo/setup`.
- [ ] Fazer merge, conferir `https://seatable.one/` e rotas existentes, e registrar o resultado.
- [x] Conferir na prévia o retorno **via Link do React** de `/login` e `/precos` para `/`: ambos mostram a nova landing.
- [x] Alinhar o dia exibido nas três cenas animadas à história de quinta-feira e conferir desktop/celular.

**Revisão:** a primeira prévia compilou, mas `/` continuou na página antiga porque a Vercel priorizou o arquivo físico `index.html` sobre o rewrite. A landing em `/seatable-prototype.html` carregou sem erros de aplicação; a correção acima troca o documento físico da raiz e preserva o SPA como fallback. A crítica visual independente avaliou a composição em 7,5/10, sem bloqueio funcional nas capturas. Dívida estética: demos mais pálidos que o herói, metadados pequenos e página longa em celular.

**Regressão descoberta após o merge:** acesso direto a `/` já mostra a landing nova, mas um `<Link to="/">` dentro do SPA mantém o roteador em memória e revela a landing antiga. A rota `/` do SPA agora força reload do documento em produção; validar na prévia e no domínio antes de encerrar.

**Revisão de conteúdo no celular:** o painel animado dizia “Sábado” enquanto a história de Marina e as demais telas diziam quinta-feira. Os cabeçalhos das cenas de reserva (desktop/celular) e salão agora dizem quinta-feira. Build, 10 testes focados e capturas em 390/1280 px passaram sem overflow.

---

# Phase 14: Demo em Conversa (ATIVO)

**Plano completo:** `.claude/plans/2026-08-24-demo-conversa/README.md`
Reframe: o demo deixa de ser um dashboard-espelho e vira uma conversa — o dono fala
com a recepcionista IA dele como cliente, ela fecha uma reserva com os dados reais
dele, e a reserva cai no painel ("via WhatsApp · agora"). Re-sequenciação de peças
existentes (`/api/demo-chat`, `DemoWhatsAppSim`), não reescrita.

- [x] Decisão D1 (delegada, 24/ago): self-serve = "14 dias grátis" (o que o billing entrega); "2 meses por nossa conta" segue founder-led
- [x] Decisão D2 (delegada, 24/ago): web-chat grátis default; WhatsApp real opt-in (rate limits capam); e-mail fallback
- [x] F0 (#37) — PR de higiene (9 bugs confirmados; independe do redesign)
- [x] F1 (#38) — Entrada sem gate de e-mail + confirmação explícita de match ("É este o seu restaurante?")
- [x] F2 (#39) — Ato 1: conversa em tela cheia no primeiro load + marcador `[[BOOKED]]` + reserva pop-in no painel
- [x] F3 (#42) — Captura DEPOIS do aha (WhatsApp opt-in / e-mail fallback) + welcome/nurture pt-BR + DemoBanner religado
- [x] F4 (#41) — Caminho "restaurante novo" de primeira classe (3 perguntas → persona ao vivo)
- [x] F5 (#43) — Hero CTA → conversa; presets demovidos; passada única de copy da oferta

---

# Phase 13: Landing Page & Demo Overhaul

## Current State Analysis

The landing page already has strong foundations:
- Hero with split-screen WhatsApp + Dashboard sync animation (animated, not static)
- PresetDemoSection with 3 preset restaurants (Brazilian/Italian/Japanese; a 4th hidden `makoto` preset exists via URL only)
- WhatsApp widget with real BR number (+55 11 5028-9356)
- BeforeAfterSection (dark mode before/after comparison)
- DashboardWalkthroughSection (4-scene animated carousel — revenue/risk/AI/staffing)
- VoiceWidgetSection EXISTS but is NOT rendered in LandingPage
- FeatureCardsSection EXISTS but is NOT rendered in LandingPage
- VideoShowcaseSection EXISTS with placeholder videos (no real content)
- PricingSection (3 tiers, BRL support)
- Footer with FAQ accordion
- DemoSlideIn (60s auto-popup)

**What's missing**: Voice widget not on landing page, no real demo videos, no inline demo dashboard, no viral share prompt.

---

## Phase 13A: Hero Refinement
*Effort: S — Hero already has the split-screen animation*

- [x] 13A-1: Audit hero CTA — kill secondary button, single CTA scrolls to #try-demo
- [x] 13A-2: Verify headline A/B variants work with ?headline=a|b|c
- [x] 13A-3: PostHog tracking for headline conversion

---

## Phase 13B: Add Voice Widget to Landing Page
*Effort: S — Component exists, just not rendered*

- [x] 13B-1: Import VoiceWidgetSection into LandingPage.tsx
- [x] 13B-2: Place between PresetDemoSection and WhatsAppWidgetSection
- [x] 13B-3: Verify ElevenLabs agent loads on landing page (ErrorBoundary wraps)
- [x] 13B-4: Suggestion text "Book a table for 2 tonight" already in component

---

## Phase 13C: Replace BeforeAfterSection ✅ DECIDED (2026-05-24)

**Decision: A — Keep as-is.**

Rationale:
- Already animated (chaos→calm story arc, 3 missed calls → 3 auto-confirmed reservations + revenue prediction bar). Not bullet-point cards.
- Dark `bg-[#0d0d14]` between light sections functions as deliberate visual punctuation (Apple/Notion pattern), not a Nordic Clean violation.
- Option B (inline demo) would duplicate `InlineDemoSection` already at position 2 on desktop — bad fit.
- Option C (video) is tempting because the Quatro Restaurantes ad tells the same story, but it's 9:16 Reels-paced/PT-BR/no voiceover. Real production work, not a drop-in. Defer until we have a desktop-format brand video.

Confirms the meta-decision already recorded at 13H-5. Closes Open Decision #1.

---

## Phase 13E: Inline Demo on Landing Page
*Effort: L — Embed live dashboard without navigation*

- [x] 13E-1: Create InlineDemoSection component
- [x] 13E-2: iframe /demo?preset=brazilian&embed=true (3 presets: BR/IT/JP)
- [x] 13E-3: Browser chrome frame around embedded demo (macOS traffic lights + URL bar)
- [x] 13E-4: DemoSlideIn gated behind !isEmbed in DemoDashboard
- [x] 13E-5: Demo banner / language popup / exit intent gated behind !isEmbed
- [x] 13E-6: Analytics: trackPresetDemoClicked + trackDemoFunnel wired

---

## Phase 13F: WhatsApp Enhancement
*Effort: S — Widget already exists, enhance CTA*

- [x] 13F-1: Phone mockup with pre-filled message preview
- [x] 13F-2: Example conversation flow preview
- [x] 13F-3: Configurable deep link message per language
- [x] 13F-4: Trust badge more prominent

---

## Phase 13G: Post-Demo Viral Loop
*Effort: M — Conversion prompts + share mechanics*

- [x] 13G-1: DemoSlideIn triggers on inline demo too (N/A until 13E built)
- [x] 13G-2: Share prompt with pre-filled WhatsApp share link
- [x] 13G-3: "X restaurants joined this week" counter
- [x] 13G-4: Grayed-out "Import History" card in demo
- [x] 13G-5: PostHog funnel events

---

## Phase 13H: Section Reorder
*Effort: S — Reorder for maximum impact*

Proposed: Hero → PresetDemo → VoiceWidget → WhatsApp → VideoShowcase → DashboardWalkthrough → Pricing → CTA → Footer

- [x] 13H-1: Section order already correct (Hero→Preset→Voice→WhatsApp→BeforeAfter→Walkthrough→Pricing→CTA→Footer)
- [x] 13H-2: VoiceWidgetSection already imported
- [x] 13H-4: FeatureCardsSection.tsx already deleted
- [x] 13H-5: Keep BeforeAfterSection — animated dark stats section with good social proof

---

## Priority Order

| Phase | Effort | Priority |
|-------|--------|----------|
| 13B: Voice Widget | S | P1 |
| 13H: Section Reorder | S | P1 |
| 13A: Hero Refinement | S | P2 |
| 13F: WhatsApp Enhance | S | P2 |
| 13G: Viral Loop | M | P2 |
| 13D: Demo Videos | M | P2 |
| 13C: BeforeAfter Replace | M | P3 |
| 13E: Inline Demo | L | P3 |

Recommended order: 13B → 13H → 13A → 13F → 13G → 13D → 13C → 13E

## Open Decisions

1. ~~BeforeAfterSection: keep, replace, or remove?~~ → **KEEP** (Phase 13C, 2026-05-24)
2. Inline Demo (13E): iframe vs direct component render?
3. Demo Videos (13D): Who records the screen captures?
4. Section kill list: confirm which sections to remove

---

# Manual Smoke Checklist

Tests that **cannot** be automated end-to-end — they need real phones, real WhatsApp users, real cards, real inboxes, or human ears. Run before any major release or after touching any of the surfaces listed.

**Last reviewed:** 2026-04-27

## How to use

Pick the surface you touched. Run only the relevant section. Mark `[x]` when done with date + initials. Open a GitHub issue immediately on any FAIL.

Sandbox account:
- Credenciais: exporte `SANDBOX_EMAIL` e `SANDBOX_PASSWORD` no ambiente.
  Saíram daqui em ago/2026 — estavam em texto puro em 12 arquivos, o que
  tornava inútil cadastrá-las como secret. Peça a quem tiver acesso ao cofre.
- Restaurant ID: `c3368ea1-b278-416f-ad24-de28434fe9ce`
- Twilio number: `+55 11 5028-2009`
- WhatsApp number: `+55 21 2391-4417` (verify status before testing)

## 1. Voice agent — Sofia (Bella Vista)

**Background:** Memory flagged the Bella Vista agent crashed within 0–2s on phone but worked on WebSocket. Agent ID was `agent_6301km6...` (crashing) and is now `agent_3901knfrgdtze6mayzzne5p2nres`. Verify the new one works on phone too.

### 1A. Browser WebRTC (5 min)
- [ ] Open `/host-dashboard/voice-settings` as Bella Vista
- [ ] Click the WebRTC test widget
- [ ] **Expect:** Sofia greeting in BR Portuguese
- [ ] Speak: "Quero reservar uma mesa para 2 pessoas hoje às 20h"
- [ ] **Expect:** Sofia confirms availability, asks for name + phone
- [ ] Provide name + phone → confirm
- [ ] **Verify:** new row in `reservations` table

### 1B. Twilio phone path (10 min) — historical bug area
- [ ] Call `+55 11 5028-2009` from a real phone
- [ ] **Expect:** Sofia answers within 2s (NOT silence, NOT crash)
- [ ] Same booking flow as 1A
- [ ] **Verify:** call shows in `agent_conversations`; reservation created
- [ ] **Watch for:** call drop within first 2s (the historical bug)

### 1C. Voice persona settings (3 min)
- [ ] Voice settings → change agent name from "Sofia" to anything else, save
- [ ] Make a fresh call → confirm new name in greeting
- [ ] Change back

## 2. WhatsApp — full conversation

**Background:** Inbound text + audio + image, plus outbound confirmations. Whisper key + meta-adapter wiring confirmed 2026-04-27.

### 2A. Inbound text (5 min)
- [ ] Send "Oi" to `+55 21 2391-4417` from a real phone
- [ ] **Expect:** AI greeting in PT, asks how it can help
- [ ] "Quero reservar para 4 pessoas amanhã às 19h"
- [ ] **Expect:** confirms availability + asks for name
- [ ] Provide name → "Confirmar"
- [ ] **Expect:** confirmation message
- [ ] **Verify:** rows in `reservations` + `manager_conversations`

### 2B. Inbound audio — Whisper (5 min)
- [ ] Record a 5s voice note in PT: "Olá, quero reservar para 2 às 21h"
- [ ] Send as WhatsApp voice message
- [ ] **Expect:** mic emoji reaction added then removed (transcription happening)
- [ ] **Expect:** AI replies as if you'd typed the text
- [ ] **Verify:** Vercel logs show `Voice transcribed from <phone>: ...`
- [ ] **Edge case:** send 1s silent audio → expect "Não consegui entender o áudio…"

### 2C. Inbound image with caption (3 min)
- [ ] Send a photo + caption "É essa mesa que quero reservar?"
- [ ] **Expect:** AI replies to the caption text
- [ ] **Verify:** logs show `Customer sent an image (Xkb)` mediaContext

### 2D. Send Test Message button (2 min)
- [ ] `/host-dashboard/whatsapp` → enter your real phone in the test field
- [ ] Click "Enviar Teste"
- [ ] **Expect:** WhatsApp message arrives within 5s
- [ ] Click again immediately → **expect:** disabled + "Retry in 1m 59s"
- [ ] Wait 2 min, click again → succeeds

## 3. Stripe — full purchase flow

**Background:** Browser path verified 2026-04-26. Untested: card charge → webhook → subscription row update.

### 3A. Subscription upgrade (5 min)
- [ ] Sign up a fresh test account (use `+test` Gmail alias)
- [ ] `/subscription/manage` → click "Atualizar" on Crescimento
- [ ] **Expect:** Stripe Checkout loads
- [ ] Card `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Complete payment
- [ ] **Expect:** redirect to `/subscription/success` then dashboard
- [ ] **Verify:** `subscriptions.status='active'` for this restaurant_id
- [ ] **Verify:** `restaurant_registry.plan_name` updated

### 3B. Customer Portal (real Stripe customer only) (3 min)
- [ ] Use an account with a real Stripe customer (not DB override)
- [ ] `/subscription/manage` → "Gerenciar Cobrança"
- [ ] **Expect:** Stripe-hosted portal opens
- [ ] Update card or cancel
- [ ] **Verify:** webhook updates DB

### 3C. Metered billing (post-launch) (5 min)
- [ ] Create 5 reservations on an active subscription
- [ ] Wait for daily 4 AM `report-usage` cron (or trigger manually)
- [ ] **Verify:** Stripe Dashboard meter events show `seatable_reservation` increments

## 4. Email deliverability

### 4A. Booking confirmation (3 min)
- [ ] Make a reservation via `/book/cantina-bella-vista` with your real email
- [ ] **Expect:** confirmation within 30s from `noreply@seatable.one`
- [ ] Check inbox first, then spam folder
- [ ] **Verify:** PT-BR copy, restaurant name in subject, date/time correct

### 4B. Reminder (3 min)
- [ ] Create reservation for tomorrow at noon
- [ ] Wait for daily 9 AM `send-reminders` cron
- [ ] **Expect:** reminder email next morning

### 4C. Welcome (signup) (2 min)
- [ ] Sign up a new restaurant
- [ ] **Expect:** welcome email within 1 min

## 5. Onboarding flow

### 5A. Brazil signup (10 min)
- [ ] Sign up at `/auth` with a brand-new gmail
- [ ] Pick "Brazil", "Casual Dining", default tables
- [ ] **Verify:** `restaurant_info`, `restaurant_config`, `restaurant_registry` all have rows
- [ ] **Verify:** `agent_language='pt'`, `country='BR'`, `timezone='America/Sao_Paulo'`
- [ ] **Verify:** ElevenLabs agent auto-created in PT

### 5B. Spain signup (5 min)
- [ ] Same with "Spain"
- [ ] **Verify:** `agent_language='es'`, `currency='EUR'`, `timezone='Europe/Madrid'`
- [ ] **Verify:** subscription/manage shows EUR pricing (€)

## 6. Mobile / PWA

### 6A. iOS booking page (3 min)
- [ ] Open `/book/cantina-bella-vista` on iOS Safari
- [ ] **Expect:** "Add to Home Screen" prompt OR works after manual add
- [ ] Submit a booking
- [ ] **Verify:** push subscription request appears
- [ ] Accept push → make another booking on a different device → confirmation push arrives

### 6B. Android booking page (3 min)
- [ ] Same on Android Chrome
- [ ] **Expect:** in-page install banner

## 7. Network resilience

### 7A. Slow 3G dashboard (3 min)
- [ ] Chrome DevTools → Network → Slow 3G
- [ ] Open `/host-dashboard/simple`
- [ ] **Expect:** skeleton loaders, then content
- [ ] **Don't expect:** white screen, infinite spinner, visible errors

## 8. Quarterly drift checks (auto in CI, verify allowlists)

- [x] Run `npm run audit:fire-and-forget` locally — 2026-08-24: 3 violations. One real (`previa-event.js`: release do lock de reação sem `await` — a lambda congela após o `res` e o release morria) corrigida com `await`; duas falso-positivas (`.catch` por-promise dentro de `Promise.all` aguardado, em `warm-seo-cache` e `prospect-admin`) allowlistadas. Re-run limpo.
- [x] Run `npm run audit:migrations` locally — 2026-05-24: all 25 CREATE TABLE declarations present in prod.
- [x] Review `scripts/audit-fire-and-forget.js` ALLOWLIST — 2026-08-24: reancorada em conteúdo (`{ file, match, reason }`) em vez de `path:linha`. Das 16 entradas antigas, só 3 ainda suprimiam algo: 5 apontavam para `api/services/` (renomeado para `api/_services/` em 10/jun, duas semanas *depois* da revisão de maio que as declarou justificadas) e 8 para linhas que hoje são JSDoc ou código não relacionado. Entrada que não casa com nenhum código agora falha o run — rot aparece no CI seguinte, não anos depois.
- [x] Varredura manual de fire-and-forget em `api/_lib/` (140 arquivos) — 2026-08-24: o audit não alcança lib de request path (o `res` mora no chamador) nem `.catch` multi-linha. 26 candidatos triados: 5 bugs reais corrigidos (confirmação de reserva por voz, upsert de LTV, webhook `service.completed`, release de lock do prospect-responder, e 2 sites de cobrança de cancelamento com janela zero-await), o resto seguro ou cosmético. Novo teste `service-completion-freeze.test.js` trava a ordenação. Os 2 pendentes foram fechados em seguida: extração de memória do WhatsApp e `registrarGasto` do ai-client, ambos com `await Promise.race` + teto (6s e 1500ms). O bloqueio que eu tinha levantado para a extração — risco de re-entrega da Meta — não existia: o orçamento de retry de 20s é absorvido por dedup no Redis (documentado em `api/whatsapp-webhook.js`), e `manager-agent.js` já usava teto de 6s na operação idêntica.
- [x] Walk Vercel cron schedule in `vercel.json` — 2026-05-24: nothing faster than `*/15`. The 4 `*/15` crons (check-late-reservations, send-campaigns, sync-conversation-data, validate-conversations) all time-sensitive and justified.

## 2026-10-12 — Continuidade do design, superfícies conectadas

- [x] Eliminar o falso “WhatsApp conectado” da página de Voz; a única fonte de verdade deve ser a conexão do restaurante em /host-dashboard/whatsapp.
- [x] Separar Voz/Telefone de Integrações; mover reservas, Instagram, POS, Stripe e ferramentas técnicas para a superfície apropriada, preservando deep links e retornos OAuth.
- [x] Corrigir a hierarquia e o texto principal em PT/EN/ES segundo DESIGN.md, sem prometer prontidão não comprovada.
- [x] Cobrir roteamento legado e tabs com testes; validar build, sintaxe e testes completos.
- [ ] Revisar no navegador desktop/mobile e registrar diferenças entre local, PR, Preview e produção.
- [x] Impedir que o número compartilhado de voz seja reatribuído por self-service, conferir titularidade no servidor e remover o falso estado “Ativo” em Voz e Chamadas.

### Revisão

Local: build e sintaxe das APIs alteradas passaram. Jest: 277 suítes e 4.241 testes passaram (1 suíte e 6 testes pulados). Vitest: 107 arquivos e 1.006 testes passaram. Os testes novos cobrem retornos OAuth, links antigos, montagem de abas e a hierarquia de compartilhamento de reservas. A página de reservas agora apresenta um link principal, QR e código de site opcional; não repete o mesmo link em cinco cartões. A verificação visual autenticada, o estado de publicação e os componentes internos de criação no Instagram ainda estão em aberto; não afirmar que todo o produto foi redesenhado.

A auditoria de Telefone encontrou um risco de roteamento entre restaurantes: a API usava um único número de voz e podia mudar o agente sem invalidar o “Ativo” salvo em outras casas. O backend agora exige dono no banco, bloqueia registrar/desregistrar/testar, não expõe o inventário da plataforma e devolve `needs_review` para antigos registros ativos. Voz e Chamadas mostram orientação assistida sem sugerir encaminhamento antes de verificar o roteamento. Os cinco testes de fronteira de telefone e dois de UI passaram; a suíte completa passou com 278 suítes/4.246 testes backend e 109 arquivos/1.008 testes frontend. Build, TypeScript, sintaxe e navegador pós-publicação ainda precisam de confirmação após o último ajuste.

Publicação: PR #177 mesclada; deploy `78266cdf` ficou READY e associado a `seatable.one`. Na conta Cantina Bella Vista, Integrações mostra link único e QR, Voz mostra revisão assistida e Chamadas não diz mais “Ativo” nem expõe o número compartilhado. Sem erros de console nas duas telas. No celular, a aba Integrações não transborda em 390 px, mas o botão do menu encobre o rótulo acima do título; correção de espaçamento segue no branch seguinte. Instagram conectado ainda expõe o editor de legendas em inglês — próximo fluxo a corrigir por inteiro.

## 2026-10-12 — Configurações do restaurante sem duplicar canais

- [x] Manter um único lugar para compartilhar o link de reservas: Integrações; Configurações aponta para lá.
- [x] Dar acesso direto às cinco seções longas sem esconder campos nem perder rascunhos.
- [x] Associar rótulos a horários e políticas para teclado/leitor de tela; cobrir com testes.
- [x] Corrigir a sobreposição do menu móvel sobre os cabeçalhos de Integrações e Voz descoberta na produção.
- [x] Verificar build e suítes completas.
- [ ] Revisar no navegador e publicar após a versão anterior estabilizar.

Revisão parcial: 11 testes da página, TypeScript, JSON dos três idiomas e `git diff --check` passaram; build de produção, 278 suítes/4.246 testes backend e 109 arquivos/1.009 testes frontend também passaram. Nenhum dado de restaurante foi alterado. O retorno Google iniciado na prévia caiu na landing estática de produção com credenciais no fragmento da URL; a causa exata ainda precisa ser confirmada. A aba temporária foi fechada, sem reutilizar essas credenciais. A revisão visual autenticada da prévia ficou indisponível; repetir no domínio após o deploy e tratar o callback OAuth como problema separado.
# Instagram — um espaço de criação, sem perder rascunhos (12/out/2026)

- [x] Separar publicação de feed, Reel e agendadas numa navegação curta, com conta conectada sempre visível.
- [x] Preservar editores montados ao alternar modos e manter o envio de legenda para Reel.
- [x] Corrigir o estado vazio das agendadas, a atualização após agendar Reel e textos principais em EN/PT/ES.
- [ ] Cobrir alternância, persistência, transferência e idiomas com testes; revisar desktop/celular no navegador.
- [ ] Verificar build, tipos, suítes e produção antes de declarar concluído.

Direção: conteúdo no canvas, controles densos em glass, estado em cor semântica e ação em burgundy. Nenhum teste deve publicar ou agendar conteúdo real.

Revisão local: a geração de uma nova leva de legendas agora reinicia os cartões, para que mídias da leva antiga não sejam publicadas com texto novo. Só um formulário de publicação abre por vez, mas imagens do mesmo rascunho sobrevivem à troca. Adicionados testes para alternância, tradução, lista vazia, mais de cinco agendamentos e isolamento da mídia. Suítes completas: 278/4.246 backend, 113 arquivos/1.017 testes frontend, build de produção e paridade das três traduções passaram. A suíte Playwright existente do Instagram foi atualizada, mas não executada porque depende de `e2e/auth-state.json` ausente neste checkout. Faltam navegador do novo design e produção. A API de agendadas ainda devolve no máximo 50 linhas; paginar é trabalho posterior. O medidor de custo usa `ai_generation_events`, mas os geradores gravam nesse registro sem esperar a gravação; conferir durabilidade antes de chamá-lo de valor faturado.

---
# Clientes no celular — dados legíveis e abertura acessível (12/out/2026)

- [x] Substituir a tabela cortada por uma lista compacta abaixo de 768 px.
- [x] Manter nome, nível, visitas, última visita e valor visíveis sem rolagem lateral.
- [x] Abrir o cliente pelo teclado e pelo toque; cobrir a lista com testes.
- [x] Chamar o valor previsto de estimativa, não de receita realizada, em Clientes e Insights.
- [x] Corrigir o contrato do perfil: API aninhada versus cliente plano, histórico por telefone e falha explícita.
- [ ] Verificar build, suites e a página autenticada no celular após o deploy.

Limite: nenhum perfil, reserva ou dado de cliente será alterado nesta revisão.

Revisão local: a lista móvel mostra métricas em três colunas, tags resumidas e abre o perfil por botão. A tabela desktop também aceita Enter e Espaço. O selo VIP agora usa tinta neutra, sem gastar a cor de ação. Após o rebase sobre #181, Jest completo passou (283 suítes/4.264 testes), Vitest completo passou (121 arquivos/1.044 testes), TypeScript, lint focado, build e `git diff --check` passaram. Falta navegador na versão publicada.

Auditoria do valor: `lifetime_value` vem de `calculatePredictedLTV` e projeta valor futuro; os rótulos agora dizem “valor estimado” nos três idiomas. Não equivale a faturamento recebido.

Auditoria autenticada: abrir Beatriz Costa em produção mostrava cabeçalho vazio, contato “undefined” e métricas ausentes. A API devolve `{ customer, reservations, notes }`, mas o hook tratava o objeto inteiro como cliente; o histórico também buscava `customer_phone = customer_id`. O hook agora adapta o contrato, o backend resolve primeiro o cliente do restaurante e busca pelo telefone real, e uma resposta defeituosa mostra erro com retry em vez de dados vazios. Três testes backend e dois do hook cobrem essas fronteiras; um teste adicional valida o drawer. A receita da tabela LTV pode ser estimada a partir de visitas × ticket médio (inclusive fallback por cobertura); por isso o drawer também usa rótulos de estimativa.

---
