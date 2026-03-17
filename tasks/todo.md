# Phase 13: Landing Page & Demo Overhaul

## Current State Analysis

The landing page already has strong foundations:
- Hero with split-screen WhatsApp + Dashboard sync animation (animated, not static)
- PresetDemoSection with 3 preset restaurants (Italian/Japanese/Mexican)
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

- [ ] 13A-1: Audit hero CTA — kill secondary button, single CTA scrolls to #try-demo
- [ ] 13A-2: Verify headline A/B variants work with ?headline=a|b|c
- [ ] 13A-3: PostHog tracking for headline conversion

---

## Phase 13B: Add Voice Widget to Landing Page
*Effort: S — Component exists, just not rendered*

- [ ] 13B-1: Import VoiceWidgetSection into LandingPage.tsx
- [ ] 13B-2: Place between WhatsAppWidgetSection and BeforeAfterSection
- [ ] 13B-3: Verify ElevenLabs agent loads on landing page
- [ ] 13B-4: Add suggestion text "Try calling — ask to book a table"
- [ ] 13B-5: Test mobile layout

---

## Phase 13C: Replace BeforeAfterSection
*Effort: M — Decision needed: keep, replace with video, or replace with inline demo*

Options:
- A) Keep as-is (already animated, not bullet-point cards)
- B) Replace with inline mini-demo
- C) Replace with auto-playing video/GIF

---

## Phase 13D: Record & Embed Demo Videos
*Effort: M — Requires screen recordings*

- [ ] 13D-1: Record WhatsApp flow video (20s)
- [ ] 13D-2: Record Voice call video (30s)
- [ ] 13D-3: Record Manager AI briefing video (20s)
- [ ] 13D-4: Edit with captions (PT-BR + EN)
- [ ] 13D-5: Host on Supabase Storage or /public
- [ ] 13D-6: Add VideoShowcaseSection to LandingPage with real videos
- [ ] 13D-7: Lazy-load videos (IntersectionObserver)

---

## Phase 13E: Inline Demo on Landing Page
*Effort: L — Embed live dashboard without navigation*

- [ ] 13E-1: Create InlineDemoSection component
- [ ] 13E-2: iframe /demo?preset=italian&embed=true OR direct render
- [ ] 13E-3: Browser chrome frame around embedded demo
- [ ] 13E-4: Non-modal slide-in after 60s interaction
- [ ] 13E-5: Move email capture to AFTER demo usage
- [ ] 13E-6: Analytics: trackInlineDemoInteracted/Conversion

---

## Phase 13F: WhatsApp Enhancement
*Effort: S — Widget already exists, enhance CTA*

- [ ] 13F-1: Phone mockup with pre-filled message preview
- [ ] 13F-2: Example conversation flow preview
- [ ] 13F-3: Configurable deep link message per language
- [ ] 13F-4: Trust badge more prominent

---

## Phase 13G: Post-Demo Viral Loop
*Effort: M — Conversion prompts + share mechanics*

- [ ] 13G-1: DemoSlideIn triggers on inline demo too
- [ ] 13G-2: Share prompt with pre-filled WhatsApp share link
- [ ] 13G-3: "X restaurants joined this week" counter
- [ ] 13G-4: Grayed-out "Import History" card in demo
- [ ] 13G-5: PostHog funnel events

---

## Phase 13H: Section Reorder
*Effort: S — Reorder for maximum impact*

Proposed: Hero → PresetDemo → VoiceWidget → WhatsApp → VideoShowcase → DashboardWalkthrough → Pricing → CTA → Footer

- [ ] 13H-1: Reorder sections in LandingPage.tsx
- [ ] 13H-2: Add VoiceWidgetSection import
- [ ] 13H-3: Add VideoShowcaseSection (once videos ready)
- [ ] 13H-4: Delete FeatureCardsSection.tsx (unused)
- [ ] 13H-5: Decision: keep or kill BeforeAfterSection

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

1. BeforeAfterSection: keep, replace, or remove?
2. Inline Demo (13E): iframe vs direct component render?
3. Demo Videos (13D): Who records the screen captures?
4. Section kill list: confirm which sections to remove
