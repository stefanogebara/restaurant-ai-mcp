# Reforma da plataforma interna — primeira entrega (30/set/2026)

**Referência travada:** casos oficiais da RON Design Lab (Spacetihq: mapa operacional; GeoTab: exceções na linha do tempo; Sisense: IA ligada à evidência), adaptados às fontes, cores semânticas e regra de conteúdo no canvas do `DESIGN.md`. Não copiar azul, 3D decorativo ou cards em todas as métricas.

- [x] Auditar ao vivo Painel, Insights e Voz em uma conta autenticada, sem alterar dados do restaurante.
- [x] Isolar o trabalho da árvore principal com alterações concorrentes.
- [x] Redesenhar a visão geral de Insights como briefing e decisões, sem a grade de cards vazios.
- [x] Corrigir os números rotulados como “hoje”, distinguir a lista de cinco clientes do total, e revisar a entrega do e-mail individual.
- [x] Verificar os estados vazio/carregando/erro, navegação e responsividade por screenshot e interação em 320–1440 px.
- [x] Corrigir a apresentação enganosa da aba Análises: períodos misturados, taxa de no-show inválida, receita estimada fora do período e prognósticos sem base.
- [x] Executar build, testes focados e testes de regressão aplicáveis.
- [ ] Obter 9/10 ou mais em crítica independente baseada apenas nas capturas; não tratar a direção atual como aprovação final.
- [ ] Testar Eleven v4 Turbo num restaurante de teste, com PT-BR/ES, interrupções, reserva completa, custo e rollback antes de qualquer migração.
- [ ] Aplicar a linguagem aprovada ao shell, Painel, Voz e demais páginas em entregas separadas.
- [x] Corrigir no Painel o contador de espera, o falso estado vazio, a legenda de mesas e o idioma PT; a hierarquia visual segue em revisão.
- [x] Conferir a nova primeira tela em 390/736/1440 px e repetir a crítica Astra com captura limpa, sem mostrar código ou notas anteriores.
- [x] Investigar, sem modificar a conta real, a entrada ativa de espera com mais de um mês e definir política de expiração/arquivo: `notified` torna-se elegível após 12h desde a entrada no cron diário existente; monitorar cancelamentos no rollout.
- [x] Alinhar o contador de espera do Manager AI com os estados `waiting` + `notified`.
- [x] Corrigir a checagem de saúde que marcava históricos encerrados como obsoletos e tratava erro de consulta como zero saudável.
- [ ] A API padrão da fila ainda trunca históricos aos 100 mais antigos; paginar a lista sem quebrar os filtros.
- [x] Impedir que Voz reporte “salvo localmente, sincronizará depois” sem persistência/replay dos ajustes; só confirmar após aceitação da ElevenLabs.
- [ ] Tornar os erros da API de Voz localizados na interface e testar falha parcial de sincronização na experiência completa.

**Achados da auditoria:** Insights mostra uma área vazia enorme quando não há reservas de risco e mistura o resumo de hoje com previsões futuras; a lista de clientes mostra cinco destaques, mas outra métrica da mesma página pode contar mais clientes no total, sem explicar o recorte. O botão “Enviar” não indica que abre uma revisão de e-mail; o texto inicial do e-mail está em inglês mesmo na interface PT-BR. Em Voz, controles de velocidade/estilo existentes não devem ser assumidos compatíveis com `eleven_v4_turbo`. O Google OAuth exibe links de privacidade/termos de outro domínio na escolha de conta — requer auditoria de configuração antes de mudar.

**Achados adicionais no Painel real:** o topo exibe zero pessoas na espera e “Seu painel está pronto”, embora a lista abaixo mostre uma entrada ativa. O campo de contador esperado pelo frontend não existe no resumo da API. Uma entrada permanece com estado “mesa pronta” depois de cerca de 34 dias; não foi alterada durante a auditoria. O primeiro fold em celular foi avaliado em 5,5/10 por um crítico independente: o mapa fica abaixo do banner, das métricas e de uma caixa de boas-vindas, com excesso de espaço e inglês no aviso Stripe.

**Crítica da primeira passada do Painel:** a nova captura sintética em 390/736/1440 px recebeu 5,8/10. O mapa começa antes da metade da primeira tela e o aviso Stripe foi deslocado para depois dele, mas a planta escala demais no desktop, os rótulos encolhem no celular e há molduras demais. Continua em iteração; não é aprovação visual.

**Críticas seguintes do Painel:** v2 recebeu 6,0/10. v3 pôs briefing e planta lado a lado no desktop, começou o mapa perto de 277 px no celular e deu verde semântico às mesas ocupadas; recebeu 6,2/10. A crítica ainda aponta topologia móvel perdida, cadeiras imprecisas e shell pesado. O harness sintético da primeira dobra ocultou widgets inferiores; o branco na captura desktop inteira não representa a página real. Fazer novo recorte do bloco de trabalho sem fingir que é auditoria de página completa.

**Revisões v4–v5 do Painel:** o mapa preserva a topologia em 390 px, a capacidade é legível em cada mesa, e os pontos decorativos foram removidos. O crítico independente atribuiu 6,5/10 a ambas as capturas: falta direção na composição geral, a barra lateral domina o desktop e o cabeçalho móvel tem alinhamentos conflitantes. As linhas vazias sob a primeira dobra são do harness sintético, não da página real. A v6 atua na estrutura do shell; nenhuma dessas notas representa aprovação do Painel completo. Nesta rodada, o backend passou 281 suítes/4.256 testes e o frontend 113 arquivos/1.019 testes.

**Crítica v6 do Painel:** depois da lateral mais estreita e do cabeçalho móvel alinhado, o score permaneceu em 6,5/10. A barra inferior, o peso visual do shell e a planta muito regular são agora as principais lacunas. O smoke de Idioma em 390 px revelou o menu sobreposto ao botão Voltar; corrigir antes de publicar. Manter o PR como rascunho, sem confundir uma captura de primeira dobra sintética com a página inteira.

**Revisão estrutural final desta entrega:** o menu e Voltar não se sobrepõem em Idioma 390 px; a barra inferior usa rótulos curtos e contraste legível. Nova crítica independente da primeira dobra do Painel: 7,1/10. Permanecem como trabalho de design a proporção das três colunas, a autenticidade espacial da planta e o excesso de tratamentos tipográficos. O alvo de 9/10 segue aberto.

**Decisões:** briefing ocupa uma faixa de conteúdo no canvas; agrupamentos interativos (lista e formulário) podem usar superfície discreta. Cor ocre identifica previsão, verde confirma estado bom, vinho fica em ações. Não executar envio de campanhas nem mudanças de voz na conta real durante a auditoria.

**Revisão da primeira entrega:** a visão geral e a aba Análises foram reestruturadas em uma árvore isolada. Scores heurísticos de risco agora aparecem como pontos de 0 a 100, não como probabilidades; e-mails de recuperação incluem idioma e descadastro e só reportam sucesso depois da aceitação pelo provedor. A aba Análises separa período selecionado, ocupação ao vivo, histórico de mesas, risco dos próximos sete dias e hipóteses de receita; o gráfico de status minúsculo foi substituído por uma distribuição legível. A suíte completa passou: 4.248 testes backend e 1.011 frontend, build, sintaxe de APIs, lint focado e `git diff --check`. Capturas sintéticas em desktop/celular e interações em 320, 390, 768 e 1440 px não tiveram erros de página ou overflow. A melhor crítica da visão geral foi 8,2/10, a última 8,0/10; a aba Análises melhorou de 6,6 para 7,2/10. Uma PR de rascunho pode facilitar a revisão, mas produção e migração da voz seguem bloqueadas pela revisão visual e por testes de integração específicos.

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
