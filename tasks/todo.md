# Landing page — Apple-calibre photographic rebuild (2026-09-05)

- [x] Record the rejected-version lesson and establish anti-slop constraints.
- [x] Lock references against current Apple product-launch patterns and hospitality photography.
- [x] Audit the current landing page for composition, responsive, motion, and rendering failures.
- [x] Generate, inspect, optimise, and integrate original restaurant imagery.
- [x] Replace the gradient/card composition with an image-led, section-by-section narrative.
- [x] Art-direct desktop, tablet, and mobile layouts independently.
- [x] Add purposeful motion with complete reduced-motion fallbacks.
- [x] Update landing copy and translations without weakening existing referral/analytics flows.
- [x] Audit every viewport and scroll state for clipping, overflow, contrast, and transition seams.
- [x] Run the full Seatable verification suite and document the result below.

## Review

- Astra gateway authentication succeeded, but generation was refused with
  free_tier_requires_payment; no repository source or internal data was sent.
- Rebuilt the active `/` narrative around four original, art-directed restaurant
  images, a custom live-service canvas, and one three-beat cinematic chapter.
  Removed the active fake-browser/demo stack and generic gradient fields.
- Preserved `/demo/setup`, `/precos`, `/login`, referral attribution, analytics,
  FAQ/legal routes, and complete EN/PT-BR/ES copy. Product proof is explicitly
  labelled illustrative in both visible copy and accessibility metadata.
- Browser QA passed at 320×568, 390×844, 768×1024, 1024×768, and 1440×900:
  no horizontal overflow, no console errors or warnings, clean mobile menu,
  warm focus treatment, and stable scroll-linked story frames.
- Optimised WebP photography totals 416 KB. Production build passed. API syntax
  passed. Backend: 3,922 passing / 6 skipped. Frontend: 977 passing across 103
  suites. `git diff --check` passed. Existing bundle-size and test-runner
  teardown warnings are unchanged outside this landing scope.

# WhatsApp dashboard rebuild (2026-08-27)

## Diagnostic context and language correction — August 27

- [x] Trace screenshot: diagnostic reused feedback template without a pending feedback record; reply `5` reached receptionist.
- [x] Select only restaurant_name and agent_language; fail closed on missing context.
- [x] Require approved seatable_connection_test in restaurant language; never substitute a campaign or another language.
- [x] Localize diagnostic content (PT/EN/ES) and new dashboard error states.
- [x] Await receipt persistence before acknowledging webhook, with deferred-promise regression test.
- [ ] Approve dedicated Meta template and deploy, then obtain permission for another real send.
- [ ] Audit real survey reply context end-to-end separately; do not count diagnostic replies as customer ratings.

Template contract: `seatable_connection_test`, body parameter 1 = restaurant name. PT: “Teste de envio do {{1}} pelo Seatable. Não é uma pesquisa nem uma reserva. Não é necessário responder.” EN: “Delivery test from {{1}} via Seatable. This is not a survey or a reservation. No reply is needed.” ES: “Prueba de envío de {{1}} a través de Seatable. No es una encuesta ni una reserva. No hace falta responder.” Meta approval/category remains an external prerequisite; no template registered or message sent in this correction.

Verification: backend 3851 passed / 6 skipped (250 suites passed, 1 skipped); frontend 968 passed (101 suites); production build passed; 199 API files passed syntax checks; diff whitespace check passed. Browser inspected the local simulated error state (API intentionally blocked), not a production E2E of the new backend. Logged-in production tab preserved. No deploy or additional WhatsApp send. Full verification used the seatable-verify checklist. Logs: `/tmp/wa-context-{jest,vitest,build}.log`.

- [x] Inspect current UI and distinguish platform transport, restaurant number and owner notifications.
- [x] Replace the five-tab settings wall with connect, test and optional preferences.
- [x] Preserve delivery tracking, expose failures and refresh connection state after verification.
- [x] Verify focused tests, build, API syntax and browser rendering; record live-integration limitations.

## Review

### Follow-up corrections

### Authenticated production audit

### Authorized outbound test — 27 August, 13:09 browser time

User explicitly supplied their recipient number. Sent ONE test using the production UI, no retries. Meta accepted it; the delivery panel updated to today's date and a two-minute cooldown. After approximately 40 seconds it still reported accepted, with no delivered/read timestamps. Template used: `seatable_feedback_request (en_US)` — wrong experience for a clear Portuguese diagnostic test. Acceptance is not delivery proof. No number registration or configuration change was made. Earlier no-send notes below describe the pre-test state.

Google sign-in initially returned `bad_oauth_state` / expired; restarting OAuth with the signed-in account succeeded. Read-only audit of Cantina Bella Vista: old production UI says API connected, owner phone empty, shared platform phone verification expired, all four templates approved, no own-number provisioning shown, last Meta test accepted on 9 June with no delivery/read receipt. No send or configuration mutation performed.

New local correction: pending delivery without receipt after ten minutes is explicitly unconfirmed, not failed or endlessly waiting; manual refresh remains available. Regression test uses a fixed old date.

Latest verification: WhatsApp workspace/hooks 15 passed; full frontend 962 passed / 7 failed, all failures in concurrently edited HeroSection/LandingPage tests. Build blocked by `LandingPage.tsx:65` unsupported `arrow-up` icon. API syntax 199 passed. These unrelated landing edits were preserved. Real outbound test still awaits an explicitly authorized recipient.

- [x] Refresh delivery feedback from the new send result, not an older test.
- [x] Show API failures even when the transport responds HTTP 200.
- [x] Add regression coverage and retry authenticated access through Google.

Follow-up: 14 focused tests passed, including 5 new response/cooldown regressions. Full frontend run: 963 passed, 5 failed in `HeroSection.test.tsx` (concurrent landing rewrite; left untouched). Backend: 3,846 passed, 6 skipped. API syntax: 199 passed. Google OAuth reached the Google sign-in screen with no existing account; user asked to finish login in-browser. No credentials entered, no real messages sent. Local error rendering rechecked in browser.

Implemented locally. The page uses the restaurant provisioning state, never the owner's phone or global platform sender, for the customer conversation link. Global phone-verification/template controls were removed from the customer setup path. Optional panels mount on first opening and preserve edits when collapsed. Delivery polling ends after a terminal result or ten minutes.

Fixed activation ordering: persist tenant routing before reporting an active number; a regression assertion covers routing failure. This is not an atomic transaction or proof of live Meta delivery.

Verification: 963 frontend tests passed; 3,846 backend tests passed (6 skipped); production build passed with existing chunk-size warnings; 199 API files passed syntax checks. Browser: local fixture renders disconnected and registered states, optional delivery errors, desktop and 390px mobile without horizontal overflow. Preview: `/whatsapp-preview.html` (dev only, simulated state, API sends blocked).

Production redirected to login; no authenticated session was available in the connected browser. No real SMS, WhatsApp message, number migration, deployment or database change was performed. Live number registration, inbound AI reply and reservation creation still require an authorized account/number. Existing legacy WhatsApp E2E suite is not evidence for this new flow and was not run.

---

# Landing rebuild — Furma-inspired editorial hero (2026-08-27)

## Plan

- [x] Reverse-engineer the reference page: layout, typography, motion, image rhythm, responsive behavior
- [x] Audit Seatable's current landing contracts: routes, analytics, i18n, demo paths, accessibility, tests
- [x] Define a Seatable-native art direction that preserves Liquid Glass v2 tokens while replacing the current hero/demo presentation
- [x] Rebuild the landing hero and first narrative sections with custom responsive product scenes
- [x] Remove or demote the existing preset/iframe/phone mockup presentation that conflicts with the new story
- [x] Add or update focused tests for navigation, CTAs, responsive-safe markup, and reduced motion
- [x] Verify typecheck/build, relevant frontend tests, palette/design guards, and the rendered page in a browser

## Review

Replaced the previous demo stack with a Furma-inspired editorial composition:
one atmospheric hero, one integrated reservation proof object, a continuous
guest journey, a connected-system chapter, and a focused conversion close.
Preserved `/demo/setup`, `/precos`, `/login`, referral tracking, analytics, and
EN/PT-BR/ES support. Desktop (1440px) and mobile (390px) render without
horizontal overflow or console errors. Production build passed; API syntax
passed; Jest 3,846 passed / 6 skipped; Vitest 968 passed; warm-palette guard
passed.

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
