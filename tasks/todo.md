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
- Email: `cantina.bellavista@seatable.io`
- Password: `Sandbox2026!`
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

- [x] Run `npm run audit:fire-and-forget` locally — 2026-05-24: 1 stale violation in `cron/warm-seo-cache.js:83` added to ALLOWLIST (outer Promise is awaited via Promise.all; .catch is error path). Re-run clean.
- [x] Run `npm run audit:migrations` locally — 2026-05-24: all 25 CREATE TABLE declarations present in prod.
- [x] Review `scripts/audit-fire-and-forget.js` ALLOWLIST — 2026-05-24: all entries still justified; updated comment on warm-seo-cache to reflect current line.
- [x] Walk Vercel cron schedule in `vercel.json` — 2026-05-24: nothing faster than `*/15`. The 4 `*/15` crons (check-late-reservations, send-campaigns, sync-conversation-data, validate-conversations) all time-sensitive and justified.
