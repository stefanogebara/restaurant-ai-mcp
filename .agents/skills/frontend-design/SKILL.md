# Restaurant AI MCP - Frontend Design Skill

## Purpose
This skill defines the **premium restaurant management platform** aesthetic for the Restaurant AI MCP project. It ensures all UI components reflect sophistication, elegance, and fine-dining excellence—NOT generic SaaS or corporate dashboard designs.

## Core Design Philosophy

**Visual Identity**: Premium restaurant experience that evokes:
- 🍷 Fine dining sophistication
- 👨‍🍳 Culinary excellence
- 🎨 Elegant simplicity
- ⚡ Modern efficiency

**Avoid at all costs**:
- ❌ Inter/Roboto fonts (overused in AI designs)
- ❌ Purple gradients on white backgrounds (generic SaaS)
- ❌ Flat, minimal animations (boring)
- ❌ Corporate blue (#3b82f6) as primary color
- ❌ Generic dashboard aesthetics

---

## Typography System

### Font Families

**Display/Headings** (Hero text, page titles):
```css
font-family: 'Playfair Display', 'Cormorant Garamond', serif;
```
- Use for: H1, H2, hero sections, brand name
- Weight range: 400 (regular), 600 (semibold), 700 (bold)
- Rationale: Elegant, sophisticated, evokes fine dining

**Body/UI Text** (Paragraphs, buttons, labels):
```css
font-family: 'IBM Plex Sans', 'Bricolage Grotesque', sans-serif;
```
- Use for: Body text, UI controls, descriptions
- Weight range: 300 (light), 400 (regular), 500 (medium), 600 (semibold)
- Rationale: Readable, modern, professional

**Data/Monospace** (Tables, metrics, code):
```css
font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```
- Use for: Table numbers, statistics, data displays
- Weight range: 400 (regular), 500 (medium), 700 (bold)
- Rationale: Clear data hierarchy, technical precision

### Type Scale (3x Ratio)

**Base**: 16px (1rem)

```css
/* Display */
--text-5xl: 72px;  /* Hero headlines */
--text-4xl: 60px;  /* Page titles */
--text-3xl: 48px;  /* Section headers */

/* Headings */
--text-2xl: 36px;  /* Card titles */
--text-xl: 24px;   /* Subheadings */
--text-lg: 20px;   /* Large UI text */

/* Body */
--text-base: 16px; /* Default body */
--text-sm: 14px;   /* Secondary text */
--text-xs: 12px;   /* Labels, captions */
```

### Font Weight Usage

```css
/* Playfair Display (Display font) */
--font-display-regular: 400;
--font-display-semibold: 600;
--font-display-bold: 700;

/* IBM Plex Sans (UI font) */
--font-sans-light: 300;
--font-sans-regular: 400;
--font-sans-medium: 500;
--font-sans-semibold: 600;
--font-sans-bold: 700;

/* JetBrains Mono (Data font) */
--font-mono-regular: 400;
--font-mono-medium: 500;
--font-mono-bold: 700;
```

---

## Color Palette

### Primary Colors (Brand Identity)

**Deep Burgundy** - Primary brand color
```css
--burgundy-50: #fdf2f4;
--burgundy-100: #fce7eb;
--burgundy-200: #f9d0d9;
--burgundy-300: #f4a8b8;
--burgundy-400: #ec7591;
--burgundy-500: #e0476d;
--burgundy-600: #cc2a56;
--burgundy-700: #ad1e47;
--burgundy-800: #7D1128;  /* PRIMARY */
--burgundy-900: #6b0e21;
--burgundy-950: #3d0312;
```
Use for: Primary buttons, active states, emphasis, brand elements

**Warm Gold** - Premium accent
```css
--gold-50: #fefaec;
--gold-100: #fdf3c9;
--gold-200: #fce588;
--gold-300: #fad24e;
--gold-400: #D4AF37;  /* PRIMARY */
--gold-500: #d9a527;
--gold-600: #c18020;
--gold-700: #9b5d1d;
--gold-800: #7f4a1d;
--gold-900: #6c3e1d;
```
Use for: Accent highlights, premium features, success states, VIP badges

**Charcoal** - Dark mode & depth
```css
--charcoal-50: #f6f6f6;
--charcoal-100: #e7e7e7;
--charcoal-200: #d1d1d1;
--charcoal-300: #b0b0b0;
--charcoal-400: #888888;
--charcoal-500: #6d6d6d;
--charcoal-600: #5d5d5d;
--charcoal-700: #4f4f4f;
--charcoal-800: #454545;
--charcoal-900: #2B2B2B;  /* PRIMARY */
--charcoal-950: #1a1a1a;
```
Use for: Text, dark backgrounds, borders, shadows

**Cream** - Elegant backgrounds
```css
--cream-50: #fefdfb;
--cream-100: #fdfcf6;
--cream-200: #F5F5DC;  /* PRIMARY - Beige */
--cream-300: #ebe9d5;
--cream-400: #ddd9c0;
--cream-500: #cbc5a7;
--cream-600: #b5ad8a;
--cream-700: #989173;
--cream-800: #7d7660;
--cream-900: #676253;
```
Use for: Page backgrounds, card backgrounds, light mode base

### Semantic Colors

**Success** (Reservations confirmed, available tables)
```css
--success-50: #f0fdf4;
--success-100: #dcfce7;
--success-200: #bbf7d0;
--success-300: #86efac;
--success-400: #4ade80;
--success-500: #4A7C59;  /* PRIMARY - Forest green */
--success-600: #16a34a;
--success-700: #15803d;
--success-800: #166534;
--success-900: #14532d;
```

**Warning** (High-risk customers, pending actions)
```css
--warning-50: #fffbeb;
--warning-100: #fef3c7;
--warning-200: #fde68a;
--warning-300: #fcd34d;
--warning-400: #fbbf24;
--warning-500: #D97706;  /* PRIMARY - Amber */
--warning-600: #d97706;
--warning-700: #b45309;
--warning-800: #92400e;
--warning-900: #78350f;
```

**Error** (No-shows, cancelled, occupied)
```css
--error-50: #fef2f2;
--error-100: #fee2e2;
--error-200: #fecaca;
--error-300: #fca5a5;
--error-400: #f87171;
--error-500: #ef4444;
--error-600: #dc2626;
--error-700: #991B1B;  /* PRIMARY - Deep red */
--error-800: #991b1b;
--error-900: #7f1d1d;
```

**Info** (ML insights, analytics, information)
```css
--info-50: #eff6ff;
--info-100: #dbeafe;
--info-200: #bfdbfe;
--info-300: #93c5fd;
--info-400: #60a5fa;
--info-500: #3b82f6;
--info-600: #1E40AF;  /* PRIMARY - Royal blue */
--info-700: #1d4ed8;
--info-800: #1e40af;
--info-900: #1e3a8a;
```

### Table Status Colors

```css
/* Available */
--status-available: #4A7C59;
--status-available-bg: #f0fdf4;
--status-available-border: #bbf7d0;

/* Occupied */
--status-occupied: #991B1B;
--status-occupied-bg: #fef2f2;
--status-occupied-border: #fecaca;

/* Reserved */
--status-reserved: #1E40AF;
--status-reserved-bg: #eff6ff;
--status-reserved-border: #bfdbfe;

/* Being Cleaned */
--status-cleaning: #D97706;
--status-cleaning-bg: #fffbeb;
--status-cleaning-border: #fde68a;
```

### Gradient Compositions

**Hero Gradient** (Landing page, hero sections):
```css
background: linear-gradient(
  135deg,
  var(--burgundy-800) 0%,
  var(--burgundy-700) 25%,
  var(--gold-600) 50%,
  var(--burgundy-600) 75%,
  var(--charcoal-800) 100%
);
```

**Subtle Background** (Cards, panels):
```css
background: linear-gradient(
  to bottom right,
  var(--cream-100) 0%,
  var(--cream-200) 50%,
  var(--cream-300) 100%
);
```

**Glass Effect** (Overlays, modals):
```css
background: rgba(245, 245, 220, 0.8);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(212, 175, 55, 0.2);
```

**Mesh Background** (Full-page backgrounds):
```css
background-image:
  radial-gradient(at 40% 20%, var(--burgundy-800) 0px, transparent 50%),
  radial-gradient(at 80% 0%, var(--gold-400) 0px, transparent 50%),
  radial-gradient(at 0% 50%, var(--charcoal-900) 0px, transparent 50%),
  radial-gradient(at 80% 50%, var(--burgundy-700) 0px, transparent 50%),
  radial-gradient(at 0% 100%, var(--gold-600) 0px, transparent 50%),
  radial-gradient(at 80% 100%, var(--burgundy-600) 0px, transparent 50%);
background-color: var(--cream-200);
```

---

## Motion Design

### Animation Principles

1. **Purposeful**: Every animation serves a function (feedback, guidance, delight)
2. **Staggered**: Elements enter in sequence, not simultaneously
3. **Organic**: Use cubic-bezier easing, not linear
4. **Respectful**: Fast enough to feel responsive, slow enough to perceive

### Timing Functions

```css
/* Standard easing */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-in-out-circ: cubic-bezier(0.85, 0, 0.15, 1);

/* Duration scale */
--duration-instant: 100ms;
--duration-fast: 200ms;
--duration-base: 300ms;
--duration-slow: 500ms;
--duration-slower: 700ms;
```

### Common Animations

**Fade In Up** (Content reveals):
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.6s var(--ease-out-expo) forwards;
}
```

**Scale In** (Buttons, modals):
```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scaleIn 0.3s var(--ease-out-back) forwards;
}
```

**Stagger Children** (List items, cards):
```css
/* Apply to parent */
.stagger-container > * {
  animation: fadeInUp 0.5s var(--ease-out-expo) forwards;
  animation-delay: calc(var(--stagger-index) * 100ms);
  opacity: 0;
}
```

**Shimmer** (Loading skeletons):
```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--cream-200) 0%,
    var(--cream-300) 50%,
    var(--cream-200) 100%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

**Counter Increment** (Statistics):
```javascript
// Use Framer Motion or React Spring for smooth number transitions
// Target: 0 → final value in 1.5s with easeOutExpo
```

### Micro-Interactions

**Button Hover**:
```css
.btn-primary {
  transition: all 0.3s var(--ease-out-expo);
}

.btn-primary:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 20px 25px -5px rgba(125, 17, 40, 0.3),
              0 10px 10px -5px rgba(125, 17, 40, 0.2);
}

.btn-primary:active {
  transform: translateY(0) scale(0.98);
}
```

**Card Hover**:
```css
.card {
  transition: all 0.4s var(--ease-out-expo);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 25px 50px -12px rgba(125, 17, 40, 0.25);
  border-color: var(--gold-400);
}
```

**Input Focus**:
```css
.input {
  transition: all 0.2s ease;
  border: 2px solid var(--cream-400);
}

.input:focus {
  border-color: var(--burgundy-600);
  box-shadow: 0 0 0 4px rgba(125, 17, 40, 0.1);
  transform: scale(1.01);
}
```

---

## Spacing System (8px Grid)

```css
--space-0: 0;
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
--space-20: 5rem;    /* 80px */
--space-24: 6rem;    /* 96px */
```

---

## Border Radius

```css
--radius-sm: 0.5rem;   /* 8px - Small elements */
--radius-md: 0.75rem;  /* 12px - Buttons, inputs */
--radius-lg: 1rem;     /* 16px - Cards */
--radius-xl: 1.5rem;   /* 24px - Modals, panels */
--radius-2xl: 2rem;    /* 32px - Hero sections */
--radius-full: 9999px; /* Pills, avatars */
```

---

## Shadows & Depth

```css
/* Elevation scale */
--shadow-xs: 0 1px 2px rgba(43, 43, 43, 0.05);
--shadow-sm: 0 1px 3px rgba(43, 43, 43, 0.1),
             0 1px 2px rgba(43, 43, 43, 0.06);
--shadow-md: 0 4px 6px -1px rgba(43, 43, 43, 0.1),
             0 2px 4px -1px rgba(43, 43, 43, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(43, 43, 43, 0.1),
             0 4px 6px -2px rgba(43, 43, 43, 0.05);
--shadow-xl: 0 20px 25px -5px rgba(43, 43, 43, 0.1),
             0 10px 10px -5px rgba(43, 43, 43, 0.04);
--shadow-2xl: 0 25px 50px -12px rgba(125, 17, 40, 0.25);

/* Colored shadows for emphasis */
--shadow-burgundy: 0 20px 25px -5px rgba(125, 17, 40, 0.3),
                   0 10px 10px -5px rgba(125, 17, 40, 0.2);
--shadow-gold: 0 20px 25px -5px rgba(212, 175, 55, 0.3),
               0 10px 10px -5px rgba(212, 175, 55, 0.2);
```

---

## Visual Motifs (Restaurant-Specific)

### Icons & Illustrations

**Use These Icon Styles**:
- Outline style (stroke-width: 2px)
- Rounded line caps and joins
- Consistent 24x24px base size
- Custom restaurant-themed icons when possible

**Restaurant Motifs**:
- 🍷 Wine glass (premium features, celebrations)
- 👨‍🍳 Chef hat (culinary excellence, expertise)
- 🍽️ Cutlery (table management, dining)
- 🎩 Maître d' hat (host dashboard, management)
- 📋 Clipboard with wine bottle (reservations)
- ⭐ Gold star (VIP customers, premium)
- 🔔 Service bell (notifications, alerts)

### Textures & Patterns

**Parchment Texture** (Backgrounds):
```css
background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ebe9d5' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
```

**Noise Overlay** (Depth):
```css
background-image:
  url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
opacity: 0.03;
```

**Ornate Border** (Premium cards):
```css
border: 2px solid var(--gold-400);
position: relative;

/* Corner accents */
&::before,
&::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--gold-400);
}

&::before {
  top: -2px;
  left: -2px;
  border-right: none;
  border-bottom: none;
}

&::after {
  top: -2px;
  right: -2px;
  border-left: none;
  border-bottom: none;
}
```

---

## Component Patterns

### Buttons

**Primary** (Main actions):
```tsx
<button className="
  px-6 py-3
  font-sans font-semibold text-base
  bg-gradient-to-r from-burgundy-700 to-burgundy-800
  text-cream-50
  rounded-lg
  shadow-burgundy
  hover:translate-y-[-2px] hover:scale-[1.02]
  active:translate-y-0 active:scale-[0.98]
  transition-all duration-300 ease-out-expo
">
  Reserve Table
</button>
```

**Secondary** (Alternative actions):
```tsx
<button className="
  px-6 py-3
  font-sans font-medium text-base
  bg-cream-100
  text-burgundy-800
  border-2 border-burgundy-300
  rounded-lg
  hover:bg-cream-200 hover:border-burgundy-400
  transition-all duration-200
">
  View Menu
</button>
```

**Gold Accent** (Premium features):
```tsx
<button className="
  px-6 py-3
  font-sans font-bold text-base
  bg-gradient-to-r from-gold-500 to-gold-600
  text-charcoal-900
  rounded-lg
  shadow-gold
  hover:translate-y-[-2px]
  transition-all duration-300
">
  ⭐ Upgrade to Pro
</button>
```

### Cards

**Standard Card**:
```tsx
<div className="
  bg-cream-100
  border border-cream-400
  rounded-xl
  p-6
  shadow-md
  hover:translate-y-[-4px]
  hover:shadow-xl
  hover:border-gold-400
  transition-all duration-400 ease-out-expo
">
  {/* Content */}
</div>
```

**Glass Card** (Overlays):
```tsx
<div className="
  bg-cream-200/80
  backdrop-blur-xl backdrop-saturate-180
  border border-gold-200/30
  rounded-2xl
  p-8
  shadow-2xl
">
  {/* Content */}
</div>
```

**Premium Card** (VIP, special features):
```tsx
<div className="
  relative
  bg-gradient-to-br from-burgundy-900 to-charcoal-900
  border-2 border-gold-400
  rounded-xl
  p-6
  shadow-2xl
  overflow-hidden
">
  {/* Gold corner accents */}
  <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-gold-400" />
  <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-gold-400" />

  {/* Content */}
  <div className="relative z-10">
    {/* Premium badge */}
    <span className="inline-flex items-center gap-2 px-3 py-1 bg-gold-400/20 text-gold-300 rounded-full text-sm font-semibold">
      ⭐ Premium
    </span>
  </div>
</div>
```

### Inputs

**Text Input**:
```tsx
<input
  type="text"
  className="
    w-full
    px-4 py-3
    font-sans text-base
    bg-cream-50
    border-2 border-cream-400
    rounded-lg
    focus:border-burgundy-600
    focus:ring-4 focus:ring-burgundy-600/10
    focus:scale-[1.01]
    transition-all duration-200
    placeholder:text-charcoal-400
  "
  placeholder="Enter your name"
/>
```

**Select Dropdown**:
```tsx
<select className="
  w-full
  px-4 py-3
  font-sans text-base
  bg-cream-50
  border-2 border-cream-400
  rounded-lg
  focus:border-burgundy-600
  focus:ring-4 focus:ring-burgundy-600/10
  transition-all duration-200
  cursor-pointer
">
  <option>Select party size</option>
  <option>2 people</option>
  <option>4 people</option>
  <option>6 people</option>
</select>
```

### Tables

**Data Table**:
```tsx
<table className="w-full">
  <thead>
    <tr className="border-b-2 border-burgundy-200">
      <th className="
        px-6 py-4
        font-display font-semibold text-sm
        text-burgundy-900 text-left
        uppercase tracking-wider
      ">
        Table #
      </th>
      {/* More headers */}
    </tr>
  </thead>
  <tbody>
    <tr className="
      border-b border-cream-300
      hover:bg-cream-100
      transition-colors duration-200
    ">
      <td className="
        px-6 py-4
        font-mono font-medium text-base
        text-charcoal-800
      ">
        #04
      </td>
      {/* More cells */}
    </tr>
  </tbody>
</table>
```

### Badges

**Status Badges**:
```tsx
{/* Available */}
<span className="
  inline-flex items-center gap-1.5
  px-3 py-1
  bg-success-100 text-success-700
  font-sans font-semibold text-xs
  rounded-full
  border border-success-300
">
  ✓ Available
</span>

{/* Occupied */}
<span className="
  inline-flex items-center gap-1.5
  px-3 py-1
  bg-error-100 text-error-700
  font-sans font-semibold text-xs
  rounded-full
  border border-error-300
">
  ● Occupied
</span>

{/* VIP */}
<span className="
  inline-flex items-center gap-1.5
  px-3 py-1
  bg-gradient-to-r from-gold-400 to-gold-500
  text-charcoal-900
  font-sans font-bold text-xs
  rounded-full
  shadow-gold
">
  ⭐ VIP
</span>
```

---

## Page-Specific Guidelines

### Landing Page

**Hero Section**:
- Full-viewport height (min-h-screen)
- Mesh gradient background with noise overlay
- Playfair Display 72px headline
- IBM Plex Sans 20px subheading
- Staggered fade-in animations (hero text, CTA, features)
- Gold accent CTA button with shadow-gold

**Features Grid**:
- 3-column grid on desktop, 1-column on mobile
- Glass-effect cards with backdrop blur
- Icons with burgundy accent color
- Hover: lift card 4px, add gold border

**Pricing Table**:
- 3 tiers: Basic (cream), Professional (burgundy), Enterprise (gold)
- Ornate borders on Premium/Enterprise
- Gold "Most Popular" badge
- Feature checkmarks with success color

### Dashboard

**Sidebar Navigation**:
- Charcoal-900 background
- Gold accent for active item
- Icons + text labels
- Smooth height transitions on expand/collapse

**Stats Cards**:
- 4-column grid (occupancy, reservations, waitlist, revenue)
- Counter animations from 0 to value
- Colored icons (burgundy, success, warning, gold)
- Micro-interactions on hover

**Table Grid**:
- Visual representation of restaurant layout
- Status colors: available (success), occupied (error), reserved (info), cleaning (warning)
- 3D hover effect with shadow
- Click to see table details modal

**Reservation Cards**:
- Timeline view with time markers
- Customer name in Playfair Display
- Party size, special requests in IBM Plex Sans
- ML risk badges (high risk = warning color, very high = error color)
- Check-in button with success color

### ML Performance Dashboard

**Charts**:
- Custom D3.js visualizations
- Burgundy → Gold gradient fills
- Animated line reveals (2s duration)
- Interactive tooltips with glass effect

**Metrics Grid**:
- KPI cards with large JetBrains Mono numbers
- Trend indicators (↑ success, ↓ error)
- Sparklines with burgundy color

---

## Responsive Design

### Breakpoints

```css
--screen-sm: 640px;   /* Mobile landscape */
--screen-md: 768px;   /* Tablet portrait */
--screen-lg: 1024px;  /* Tablet landscape */
--screen-xl: 1280px;  /* Desktop */
--screen-2xl: 1536px; /* Large desktop */
```

### Mobile-First Approach

- Base styles for mobile (320px+)
- Use `@media (min-width: X)` for larger screens
- Touch-friendly targets (min 44x44px)
- Larger font sizes on mobile (18px base)
- Simpler layouts, fewer columns
- Hide decorative elements on small screens

---

## Accessibility

### Color Contrast

- **Text on cream background**: Use charcoal-900 (AAA)
- **Text on burgundy background**: Use cream-50 (AAA)
- **Links**: Underline or clear visual differentiation
- **Focus states**: 4px ring with 0.1 opacity background

### Keyboard Navigation

- Visible focus indicators (burgundy ring)
- Logical tab order
- Skip navigation link
- Escape to close modals

### Screen Readers

- Semantic HTML (nav, main, article, aside)
- ARIA labels for icon-only buttons
- Alt text for all images
- Live regions for dynamic content

---

## Implementation Checklist

When creating a new component, ensure:

- [ ] Uses Playfair Display for headings OR IBM Plex Sans for UI
- [ ] Avoids Inter, Roboto, Open Sans fonts
- [ ] Uses burgundy/gold color palette (not purple/blue)
- [ ] Includes hover/focus micro-interactions
- [ ] Has staggered animations (not simultaneous)
- [ ] Uses 8px spacing grid
- [ ] Has responsive design for mobile
- [ ] Meets WCAG AA contrast ratios
- [ ] Includes keyboard navigation
- [ ] Has loading/empty/error states
- [ ] Uses restaurant-themed icons/motifs

---

## Anti-Patterns to Avoid

❌ **Don't**:
- Use Inter or Roboto fonts
- Use generic purple gradients (#8b5cf6 → #ec4899)
- Use corporate blue (#3b82f6) as primary color
- Create flat, minimal designs with no depth
- Use simultaneous animations (everything fades in at once)
- Ignore mobile responsiveness
- Skip hover/focus states
- Use low-contrast text
- Create generic SaaS dashboard aesthetics

✅ **Do**:
- Use Playfair Display + IBM Plex Sans
- Use burgundy (#7D1128) + gold (#D4AF37) palette
- Create depth with shadows, gradients, textures
- Stagger animations (100ms delay between items)
- Design mobile-first
- Add micro-interactions everywhere
- Ensure AAA contrast ratios
- Create premium restaurant aesthetics

---

## Tools & Libraries

**Required**:
- Tailwind CSS (custom config with this design system)
- Framer Motion (animations)
- React Spring (physics-based interactions)
- D3.js (data visualizations)

**Font Loading**:
```html
<!-- In index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

---

## Success Metrics

A successful implementation will have:

1. **Unique Visual Identity**: Instantly recognizable as NOT generic AI-generated design
2. **2-3x Perceived Quality**: Users perceive the design as premium/professional
3. **Restaurant Aesthetic**: Evokes fine dining, not corporate SaaS
4. **Consistent Branding**: All pages follow the same design language
5. **Smooth Interactions**: Animations feel polished and purposeful

---

## Version

**Skill Version**: 1.0.0
**Created**: November 13, 2025
**Project**: Restaurant AI MCP
**Author**: Codex with User Direction
