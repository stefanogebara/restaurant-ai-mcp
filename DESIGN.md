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

## Product UI — "Nordic Clean"

The in-app dashboard, host views, landing page, and customer booking portal all share one design language. Goal: **calm, premium, restaurant-soft**. Not Stripe-clinical, not Airbnb-playful.

### Typography

- **Body**: Inter
- **Landing headings**: Playfair Display
- **Code / mono**: JetBrains Mono
- **Section headings**: `text-4xl sm:text-[48px]` (36 px mobile, 48 px desktop)
- **Subtitles**: `text-lg` (18 px)
- **Body**: `text-sm` (14 px) or `text-base` (16 px)
- **Never** mix font sizes within the same hierarchy level on the same surface.

### Color palette

| Token | Value | Usage |
|---|---|---|
| **Background** | `#FAFAF9` (warm white) | Page background — never pure white |
| **Primary accent** | `#9F1239` (burgundy) | CTAs, links, highlights |
| **Text primary** | `#1C1917` (deep charcoal) | Headings, body text |
| **Text secondary** | `#706A65` (muted stone) | Captions, placeholders (WCAG-compliant — was `#A8A29E`, raised for contrast) |
| **Borders** | `#E5E7EB` (1 px) | Cards, panels, dividers |

Status colours are **semantic-only**:
- Emerald = positive trends, online dots
- Amber = warnings, pending states (Stripe Connect badge "pending"/"restricted")
- Red = errors, disconnected states (Stripe "disabled"/"revoked", payment-failed banner)

Never use brand burgundy for status — burgundy is for action (buttons, links).

### Shadow + border rules

- **No shadows** on cards or panels — borders only (1 px `#E5E7EB`).
- **Shadows allowed** on: modals, dropdowns, tooltips, FABs (floating action buttons).
- Flat surfaces in flow, elevated surfaces above flow.

### WCAG contrast rules

- Normal text (< 18 px): minimum **4.5:1** contrast ratio
- Large text (≥ 18 px bold or ≥ 24 px regular): minimum **3:1** contrast ratio
- Text over images: minimum **60 % overlay opacity** at midpoint
- Never use opacity below 0.5 for readable text (`white/50` minimum on dark, `dark/50` minimum on light)

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

_Last sync: 2026-06-01 — extracted from inline CLAUDE.md sections._
