# Seatable Design System

Single source of truth for visual + brand decisions across the product, marketing, and AI-generated assets. When CLAUDE.md, Tailwind config, and this file disagree, **this file wins** — update the others to match.

---

## Table of contents

1. [Product UI — "Nordic Clean"](#product-ui--nordic-clean)
   - [Typography](#typography)
   - [Color palette](#color-palette)
   - [Shadow + border rules](#shadow--border-rules)
   - [WCAG contrast rules](#wcag-contrast-rules)
2. [Brand illustrations](#brand-illustrations)
   - [Style anchors](#style-anchors)
   - [Color palette (warm)](#color-palette-warm)
   - [Key visual elements](#key-visual-elements)
   - [Reference images](#reference-images)
   - [AI Studio prompt template](#ai-studio-prompt-template)
3. [Social posts](#social-posts)
   - [Layout system](#layout-system)
   - [Content types](#content-types)
   - [Overlay opacity rules](#overlay-opacity-rules)
4. [Source-of-truth checklist when shipping a new surface](#source-of-truth-checklist)

---

## Product UI — "Warm Glass"

The in-app dashboard, host views, landing page, and customer booking portal all share one design language. Goal: **calm, premium, restaurant-soft, with quiet depth**. Not Stripe-clinical, not Airbnb-playful, not Vision-Pro-aggressive — **iOS 26 Control Center over a warm wallpaper** is the closest reference.

Inspired by TwinMe's dark glass system, adapted for light mode to preserve Seatable's warm restaurant identity and meet customer-facing accessibility.

### Typography

- **Body**: Inter
- **Landing headings**: Playfair Display
- **Code / mono**: JetBrains Mono
- **Section headings**: `text-4xl sm:text-[48px]` (36 px mobile, 48 px desktop)
- **Subtitles**: `text-lg` (18 px)
- **Body**: `text-sm` (14 px) or `text-base` (16 px)
- **Never** mix font sizes within the same hierarchy level on the same surface.

(Typography is intentionally unchanged from Nordic Clean — Seatable's restaurant-soft tone stays. We don't swap to Geist like TwinMe does because Seatable's positioning is hospitality, not tech.)

### Page background — warm orbs

Pages **never** use a flat fill. The body has four overlapping radial gradients with warm tones over a `#FAFAF9` warm-white base:

```css
body {
  background-color: #FAFAF9;
  background-image:
    radial-gradient(ellipse 65% 45% at 12% 18%, rgba(217, 119, 6, 0.18) 0%, transparent 60%),
    radial-gradient(ellipse 55% 40% at 88% 22%, rgba(245, 158, 11, 0.15) 0%, transparent 60%),
    radial-gradient(ellipse 75% 50% at 50% 95%, rgba(159, 18, 57, 0.12) 0%, transparent 65%),
    radial-gradient(ellipse 45% 35% at 90% 80%, rgba(120, 53, 15, 0.10) 0%, transparent 55%);
  background-attachment: fixed;
}
```

Orb opacities tuned so the warm hues are clearly visible on first glance — the original 6 %–10 % range read as flat white in practice (glass surfaces refract nothing), so the spec was lifted to 10 %–18 % after a 2026-06-05 visual review.

### Color palette

| Token | Value | Usage |
|---|---|---|
| **Page base** | `#FAFAF9` warm-white | Anchor color of the body gradient |
| **Primary accent** | `#9F1239` burgundy | CTAs, links, highlights — unchanged |
| **Text primary** | `#1C1917` deep charcoal | Headings, body text on glass |
| **Text secondary** | `#706A65` muted stone | Captions, placeholders (WCAG-compliant) |
| **Glass card** | `rgba(255, 255, 255, 0.62)` | Flow-level card / panel fill |
| **Glass panel** | `rgba(255, 255, 255, 0.55)` | Larger surface (sidebar inner, dashboards) |
| **Glass modal** | `rgba(255, 255, 255, 0.78)` | Elevated modals/dropdowns (more opaque for legibility) |
| **Glass subtle** | `rgba(255, 255, 255, 0.40)` | Secondary surfaces, chips |
| **Glass border** | `rgba(255, 255, 255, 0.70)` | Soft white edge on glass cards |
| **Glass border subtle** | `rgba(28, 25, 23, 0.06)` | Dark fine line on the warm side of glass |
| **Glass border input** | `rgba(28, 25, 23, 0.12)` | Form input boxes — 2× the subtle border so the input outline registers against the gradient (subtle = 6 %, input = 12 %). Use on `<input>` / `<select>` / `<textarea>` chrome. |

Status colours are **semantic-only**:
- Emerald `bg-emerald-500` = positive trends, online dots
- Amber `bg-amber-500` = warnings, pending states
- Red `bg-red-500` = errors, disconnected states

Never use brand burgundy for status — burgundy is for action.

### Glass surface tiers

| Element | Background | Backdrop blur | Border | Shadow | Radius |
|---|---|---|---|---|---|
| Flow card | `rgba(255,255,255,0.62)` | 18 px | `rgba(255,255,255,0.70)` 1 px | `0 1px 2px rgba(28,25,23,0.04), 0 8px 24px rgba(28,25,23,0.04)` | 16 px |
| Flow panel (larger) | `rgba(255,255,255,0.55)` | 24 px | `rgba(255,255,255,0.65)` 1 px | same as flow card | 20 px |
| Elevated modal / dialog | `rgba(255,255,255,0.78)` | 32 px | `rgba(255,255,255,0.80)` 1 px | `0 4px 12px rgba(28,25,23,0.08), 0 24px 48px rgba(28,25,23,0.10)` | 20 px |
| Floating navbar | `rgba(255,255,255,0.70)` | 16 px | `rgba(28,25,23,0.06)` 1 px | `0 1px 2px rgba(28,25,23,0.04)` | 24 px |
| Suggestion chip | `rgba(255,255,255,0.55)` | 12 px | `rgba(255,255,255,0.65)` 1 px | none | 46 px |
| Primary CTA (filled pill) | `bg-burgundy` solid `#9F1239` | none | none | none | 100 px |

Notes:
- Soft drop shadows replace the Nordic Clean "borders only" rule. The blur reads as glass depth; the shadow grounds the surface above the gradient. Together they replace the flat 1-px border look.
- Modals are more opaque (0.78) than flow cards (0.62) intentionally — readable form fields and dense content shouldn't fight a 50%+ translucent base.
- The dual-border pattern (warm white outside + faint dark inside) is fine for cards over busy gradient regions; for cards on quieter gradient regions, the warm border alone is enough.

### Shape language

- Pills for actions: primary CTAs `rounded-[100px]` (`rounded-full` is fine in Tailwind)
- Chips / suggestions: `rounded-[46px]` (intentionally not `rounded-full` — the 46 px reads as designed, not lazy)
- Cards: `rounded-2xl` (16 px) for flow, `rounded-[20px]` for larger panels
- Modals: `rounded-[20px]`
- Input fields: `rounded-lg` (8 px) — tight enough to feel input-y, not pill-y

### WCAG contrast rules

- Normal text (< 18 px): minimum **4.5:1** contrast ratio
- Large text (≥ 18 px bold or ≥ 24 px regular): minimum **3:1** contrast ratio
- Critical: text on glass must clear contrast **against the gradient bg at its darkest orb**, not against pure white. The warm orbs sit at ≤ 18 % opacity so headroom is comfortable, but verify with WebAIM Contrast Checker for borderline cases (e.g. amber text on amber-orb region).
- Never use opacity below 0.5 for readable text (`text-deep-charcoal/50` minimum on glass)

### Reduced-motion + low-end perf

- `@media (prefers-reduced-motion: reduce)` disables backdrop-blur transitions but keeps the static blur — the blur is structural, the animation is decoration.
- For lists with ≥ 20 glass items (e.g. long reservation lists), nest a single glass panel around the list and remove per-row blur — backdrop-blur is GPU-expensive when stacked.

---

## Brand illustrations

Used for landing-page hero, marketing assets, social backgrounds, blog post headers. Distinct from product UI — these add **warmth** to the otherwise-clean white interface.

### Style anchors

> Flat vector editorial illustration with depth, ambient lighting, and subtle shadows. **Monocle magazine meets restaurant ambiance.**

### Color palette (warm)

| Token | Value | Role |
|---|---|---|
| Burgundy / wine | `#9F1239` | Primary brand accent (matches UI primary) |
| Warm amber | `#D97706` | Window light, candle glow |
| Golden amber | `#F59E0B` | Pendant lamps, string lights, accent highlights |
| Cream / off-white | `#F5F0EB` | Backgrounds, text areas |
| Warm brown | `#78350F`, `#92400E` | Wood, leather, mid-tones |
| Deep charcoal | `#1C1917` | Dark variants, silhouettes |

### Key visual elements

- Warm golden lighting from windows, pendant lamps, candles, string lights
- Stylized simplified human figures — **no detailed faces** (preserves character without aging the asset or implying specific demographics)
- Clean lines, flat colors with subtle gradients and ambient shadows
- Restaurant scenes: interiors, exteriors, terraces, bars, kitchens
- European bistro / sophisticated dining atmosphere
- Perspective depth with foreground / background elements

### Reference images

Always attach **3 of these** to AI-generation prompts as style anchors. Live at `~/seatable-ads/output/insta-final/`:

- `illust-night.png` — night exterior with warm window glow
- `illust-rooftop.png` — rooftop dining at sunset
- `illust-bar.png` — warm bar interior
- `illust-interior.png` — classic restaurant dining room
- `illust-terrace.png` — garden terrace with string lights

### AI Studio prompt template

```
[Attach 3 reference images from ~/seatable-ads/output/insta-final/]

These images show my exact illustration style. Create a NEW illustration in
the EXACT SAME STYLE.

Match: flat vector editorial look, warm color palette (burgundy, amber,
golden orange, cream, warm browns), stylized simplified figures, clean
lines, flat colors with subtle gradients and ambient shadows, depth with
perspective, warm golden lighting.

NEW SCENE: [describe scene here]

Square 1:1. No text. No logos.
```

The generator script lives at `~/seatable-ads/output/insta-final/generate-100-v4.js` — see it for the exact API call shape.

---

## Social posts

Instagram-first; the layout system carries over to LinkedIn / Twitter cards by cropping.

### Layout system

- **Aspect**: Square 1:1
- **Typography**: Playfair Display (headlines), Inter (body)
- **Brand marks**:
  - `S.` logo with burgundy dot — **top-left**
  - `seatable.one` watermark — **bottom-right**
- Key words rendered in **burgundy italic** for emphasis
- Semi-transparent overlay between background illustration and text for readability — see opacity rules below

### Content types

Four templates, picked per content goal:

| Type | When to use | Example |
|---|---|---|
| **stat** | Single number, claim-of-impact | "73 % fewer no-shows" |
| **headline** | One-line marketing copy | "AI that actually understands restaurants." |
| **quote** | Customer testimonial pulled verbatim | "We sold out every Friday in Q1." |
| **cta** | Specific ask with link | "Demo it free at seatable.one" |

### Overlay opacity rules

- **Dark background illustration**: white text with **dark gradient overlay** (text always reads)
- **Light background illustration**: overlay opacity **0.45–0.55 minimum** at midpoint (so cream-on-cream stays readable)

---

## Source-of-truth checklist

When shipping a new UI surface, design asset, or social post, check:

- [ ] Uses tokens from this file's tables, not raw hex codes elsewhere
- [ ] Borders not shadows on flow-level cards
- [ ] Burgundy reserved for action — semantic colours for status
- [ ] WCAG contrast met (use the WebAIM Contrast Checker for borderline cases)
- [ ] Page background is `#FAFAF9`, never pure `#FFFFFF`
- [ ] No mixed font sizes within the same hierarchy level
- [ ] If illustration: 3 references attached + warm palette
- [ ] If social post: `S.` mark top-left, `seatable.one` watermark bottom-right

When this file changes, update:
- `client/tailwind.config.*` (token names)
- Any component that hardcodes the old token
- `CLAUDE.md`'s pointer at the top

---

## Rebrand changelog

### 2026-06-05 — Warm Glass v1 fully shipped

Multi-phase migration from Nordic Clean (hard 1-px borders + flat fills) to the warm-glass light-mode system documented above. ~250 component + page files converted across 10 deploys.

**Foundation (`139bbd51`)**: this DESIGN.md + Tailwind tokens (`bg-glass-*`, `border-glass-*`, `backdrop-blur-glass-*`, `shadow-glass-*`) + body 4-orb radial gradient + 4 utility classes (`.glass-card` / `.glass-panel` / `.glass-modal` / `.glass-pill`) + 4 React primitives at `client/src/components/common/glass/`.

**Phases 2A–2F (~30 commits)**: landing page, host dashboard + 5 panels, manager AI, customer CRM, demo dashboard, and all 7 settings tabs. `DashboardLayout` dropped its `bg-soft-gray` flex shell so every authenticated page exposes the body gradient automatically.

**Phase 3 (`4799f941`)**: 8 customer-facing surfaces — BookingPage, CustomerPortal, EventBookingPage, JoinPage, BookingConfirmation, Welcome, Onboarding, Login.

**Phase 4 (`464c70e2`)**: 6 remaining product pages — Insights, FloorPlanEditor, CallTrackingDashboard, CouponsPage, EventsPage, NotFound.

**Phase 5 Tier 1–2 (5 commits, ~101 files)**: leverage primitives (`common/Modal`, `common/ConfirmModal`, `common/Skeleton`), 8 host modals, 2 CRM drawers, the entire `voice/` folder, 21 settings-internal panels, the host customer + LTV + table cluster (23 files), then analytics / insights / call-tracking / campaigns / floor-plan / events folders (32 files).

**Phase 6 (`ad760b3c`)**: onboarding wizard, demo internals, calculator, booking forms, OnboardingSuccessModal. 37 files. (`DemoVoiceAgent` + `DemoWhatsAppSim` intentionally kept solid white — they mimic real WhatsApp/voice UIs and the realism is the point. `seo/*` pages kept their own marketing aesthetic.)

**Encoding recovery (`36da9e84`)**: a PowerShell mass-replace in Phase 5/6 round-tripped 45 files through cp1252, mangling PT-BR accents (`Previsão` → `PrevisÃ£o`) and breaking LocationSelector's `[̀-ͯ]` regex. Python `text.encode('cp1252').decode('utf-8')` reverse-fix repaired 42 files; 3 were restored from earlier clean commits then re-converted via Edit. Lesson captured in `tasks/lessons.md` — future mass-replace passes use Python or Edit, never PowerShell.

**Visual review round 2 (`5e5ac883`)**: orb opacities lifted from 0.06–0.10 to 0.10–0.18 (gradient was invisible against `#FAFAF9`, glass surfaces refracted nothing). `shadow-glass-card` second drop doubled from 0.04 to 0.08 so cards lift off the background. DemoAIInsightsBar migrated to `.glass-card` (was missed in Phase 6).

**Visual review round 3 (`d03cc0d2` retried as `c7218587`)**: new `glass-border-input` token at `rgba(28, 25, 23, 0.12)` — 2× `glass-border-dark`. Booking form inputs had been invisible (placeholder text floating with no box outline) once the gradient became visible in round 2. Swept across 66 files via a UTF-8-safe Python heuristic that only swaps when the className contains a form-input signal (`placeholder:` / `focus:ring-` / `focus:border-` / `resize-` / `appearance-none`).

**Plus** an unrelated security fix (`d2af0e7e`): `safeHttpUrl()` scheme guard on Instagram bio website href — Meta does not sanitise the bio website field, and a malicious IG account could set their bio to `javascript:...` and execute when a restaurant owner clicks it.

**Intentionally deferred**: `DemoVoiceAgent` + `DemoWhatsAppSim` (mimic real chat UIs), `seo/*` (independent marketing aesthetic), the inline-demo browser chrome on the landing page.

---

_Last sync: 2026-06-05 — Warm Glass v1 rebrand changelog appended._
