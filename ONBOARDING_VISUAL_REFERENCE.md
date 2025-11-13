# Onboarding Wizard - Visual Reference Guide

## Design Transformation Overview

**Before**: Generic AI SaaS design with dark backgrounds, glass morphism, and purple/indigo gradients
**After**: Premium restaurant experience with cream parchment, burgundy/gold accents, and fine dining sophistication

---

## Color Palette Transformation

### BEFORE (Generic AI SaaS)
```
Background: #0a0a0f (Dark charcoal)
Primary: #6366f1 (Indigo-500)
Secondary: #a855f7 (Purple-500)
Text: #ffffff (White)
Cards: rgba(255, 255, 255, 0.05) (Glass)
Borders: rgba(255, 255, 255, 0.2) (Glass)
```

### AFTER (Premium Restaurant)
```
Background: #F5F5DC (Cream/Beige)
Primary: #7D1128 (Deep Burgundy)
Accent: #D4AF37 (Warm Gold)
Text: #2B2B2B (Charcoal)
Cards: #fefdfb (Off-white cream)
Borders: #ddd9c0 (Beige cream)
```

---

## Typography Transformation

### BEFORE
```css
font-family: system-ui, -apple-system, sans-serif;
/* Generic system fonts */
```

### AFTER
```css
/* Headings (Elegant, sophisticated) */
font-family: 'Playfair Display', 'Cormorant Garamond', serif;

/* Body text (Professional, readable) */
font-family: 'IBM Plex Sans', 'Bricolage Grotesque', sans-serif;

/* Data/Numbers (Technical precision) */
font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```

---

## Component Style Comparisons

### 1. Step Heading

**BEFORE**:
```tsx
<h2 className="text-2xl font-bold text-white mb-2">
  What's your restaurant called?
</h2>
```

**AFTER**:
```tsx
<h1 className="
  font-['Playfair_Display'] font-bold text-4xl md:text-5xl
  text-[#7D1128]
  mb-3
">
  Welcome to RestaurantAI
</h1>
```

**Visual Changes**:
- Size: 24px → 48px (desktop)
- Color: White → Deep burgundy
- Font: System sans-serif → Playfair Display (elegant serif)
- Weight: Bold (700)

---

### 2. Text Input Fields

**BEFORE**:
```tsx
<input
  type="text"
  className="
    glass-input w-full px-4 py-3
    text-white placeholder-gray-400
  "
  placeholder="La Bella Vista"
/>

/* CSS: */
.glass-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
}
```

**AFTER**:
```tsx
<input
  type="text"
  className="
    w-full px-4 py-3
    font-['IBM_Plex_Sans'] text-base
    bg-[#fdfcf6]
    border-2 border-[#ddd9c0]
    rounded-xl
    focus:border-[#ad1e47]
    focus:ring-4 focus:ring-[#7D1128]/10
    focus:scale-[1.01]
    transition-all duration-200
    placeholder:text-[#888888]
  "
  placeholder="La Bella Vista"
/>
```

**Visual Changes**:
- Background: Transparent glass → Warm cream (#fdfcf6)
- Border: 1px white/20% → 2px beige (#ddd9c0)
- Text color: White → Charcoal (#2B2B2B)
- Focus: No effect → Burgundy border + ring + scale
- Corner radius: 8px → 12px (rounded-xl)

---

### 3. Primary Button (Continue)

**BEFORE**:
```tsx
<button className="
  glass-button-primary px-8 py-3
  text-white font-bold rounded-lg
  flex items-center gap-2
">
  Continue
  <svg>→</svg>
</button>

/* CSS: */
.glass-button-primary {
  background: linear-gradient(to right, #6366f1, #a855f7);
  box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);
}
```

**AFTER**:
```tsx
<button
  className="
    px-8 py-3
    font-['IBM_Plex_Sans'] font-bold text-base
    bg-gradient-to-r from-[#ad1e47] to-[#7D1128]
    text-[#fefdfb]
    rounded-xl
    hover:-translate-y-1 hover:shadow-2xl
    active:scale-[0.98]
    transition-all duration-300
    flex items-center gap-2
  "
  style={{
    boxShadow: '0 20px 25px -5px rgba(125, 17, 40, 0.3), 0 10px 10px -5px rgba(125, 17, 40, 0.2)'
  }}
>
  Continue
  <svg>→</svg>
</button>
```

**Visual Changes**:
- Gradient: Indigo→Purple → Burgundy→Deep Burgundy
- Shadow: Simple blue → Dramatic burgundy multi-layer
- Hover: Opacity change → Lift up 2px + larger shadow
- Active: None → Scale down to 98%
- Corner radius: 8px → 12px

---

### 4. Selection Cards (Restaurant Type)

**BEFORE**:
```tsx
<button className={`
  p-4 rounded-lg border-2 transition-all duration-200
  text-center font-semibold text-sm
  ${selected
    ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/20 scale-105'
    : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40 hover:bg-white/10 hover:text-white'
  }
`}>
  {type}
</button>
```

**AFTER**:
```tsx
<button className={`
  p-4 rounded-xl border-2 transition-all duration-300
  text-center font-['IBM_Plex_Sans'] font-semibold text-sm
  ${selected
    ? 'border-[#7D1128] bg-[#fdf2f4] text-[#7D1128] shadow-lg'
    : 'border-[#ddd9c0] bg-[#fefdfb] text-[#6d6d6d] hover:border-[#D4AF37] hover:bg-[#fefaec]'
  }
`}>
  <div className="text-2xl mb-2">🍷</div>
  {type}
</button>
```

**Visual Changes**:
- Selected border: Indigo → Deep burgundy
- Selected background: Indigo/20% → Light burgundy (#fdf2f4)
- Unselected background: White/5% → Cream (#fefdfb)
- Unselected border: White/20% → Beige (#ddd9c0)
- Hover border: White/40% → Gold (#D4AF37)
- Added: Icon emoji at top of card
- Corner radius: 8px → 12px

---

### 5. Toggle Switch (Business Hours)

**BEFORE**:
```tsx
<label className="flex items-center">
  <input type="checkbox" className="
    w-4 h-4
    text-indigo-500
    bg-white/10
    border-white/20
    rounded
    focus:ring-2 focus:ring-indigo-400
  " />
  <span className="ml-2 text-white text-sm">Open</span>
</label>
```

**AFTER**:
```tsx
<label className="relative inline-flex items-center cursor-pointer">
  <input type="checkbox" checked={isOpen} className="sr-only peer" />
  <div className="
    w-14 h-8 rounded-full
    transition-all duration-300
    peer-checked:bg-gradient-to-r peer-checked:from-[#86efac] peer-checked:to-[#4A7C59]
    bg-[#d1d1d1]
  ">
    <span className={`
      absolute top-1 left-1
      w-6 h-6 bg-[#fefdfb] rounded-full shadow-md
      transition-transform duration-300
      ${isOpen ? 'translate-x-6' : 'translate-x-0'}
    `} />
  </div>
  <span className="ml-3 font-['IBM_Plex_Sans'] text-sm text-[#4f4f4f]">
    {isOpen ? 'Open' : 'Closed'}
  </span>
</label>
```

**Visual Changes**:
- Style: Checkbox → iOS-style toggle switch
- Size: 16px → 56px wide × 32px tall
- On color: Indigo → Forest green gradient
- Off color: White/10% → Gray (#d1d1d1)
- Animation: None → Smooth slide (300ms)
- Visual indicator: Checkmark → Sliding circle

---

### 6. Progress Bar

**BEFORE**:
```tsx
<div className="h-3 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
  <motion.div
    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
    initial={{ width: 0 }}
    animate={{ width: `${percentage}%` }}
    transition={{ duration: 0.5 }}
  />
</div>
```

**AFTER**:
```tsx
<div className="flex items-center gap-2">
  {stepNames.map((name, index) => {
    const isActive = stepNumber === currentStep;
    const isCompleted = stepNumber < currentStep;

    return (
      <div key={stepNumber} className="flex-1 flex flex-col gap-1">
        <div className={`
          h-2 rounded-full transition-all duration-500 ease-out
          ${isCompleted || isActive
            ? 'bg-gradient-to-r from-[#ad1e47] to-[#7D1128] shadow-lg shadow-[#7D1128]/30'
            : 'bg-[#ddd9c0]'
          }
        `} />
        <span className={`
          hidden md:block text-[10px] font-['IBM_Plex_Sans'] font-medium
          ${isActive ? 'text-[#7D1128]' : isCompleted ? 'text-[#4A7C59]' : 'text-[#888888]'}
        `}>
          {name}
        </span>
      </div>
    );
  })}
</div>
```

**Visual Changes**:
- Style: Single bar → 6 individual step bars
- Gradient: Indigo→Purple → Burgundy→Deep Burgundy
- Background: White/5% glass → Cream (#ddd9c0) solid
- Added: Step labels below each bar (desktop only)
- Added: Shadow on completed/active steps
- Completed indicator: Green text color

---

### 7. Success Modal

**BEFORE**:
```tsx
{/* No success modal in original - just toast notification */}
```

**AFTER**:
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  className="fixed inset-0 bg-[#2B2B2B]/50 backdrop-blur-sm z-50"
>
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
    className="
      bg-[#fefdfb]
      border-2 border-[#D4AF37]
      rounded-2xl
      p-12
      max-w-md
      shadow-2xl
    "
    style={{
      boxShadow: '0 20px 25px -5px rgba(212, 175, 55, 0.3), 0 10px 10px -5px rgba(212, 175, 55, 0.2)'
    }}
  >
    {/* Gold gradient icon circle */}
    <div className="
      w-20 h-20
      bg-gradient-to-br from-[#fad24e] to-[#D4AF37]
      rounded-full
      flex items-center justify-center
      mx-auto mb-6
    ">
      <span className="text-5xl">🎉</span>
    </div>

    {/* Playfair Display heading */}
    <h2 className="
      font-['Playfair_Display'] font-bold text-3xl
      text-[#7D1128]
      mb-3
      text-center
    ">
      Welcome Aboard!
    </h2>

    <p className="
      font-['IBM_Plex_Sans'] text-base
      text-[#4f4f4f]
      mb-6
      text-center
    ">
      Your restaurant is ready. Let's start managing reservations!
    </p>

    {/* Loading spinner */}
    <div className="flex items-center justify-center gap-2">
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#ddd9c0] border-t-[#7D1128]"></div>
      <span className="font-['IBM_Plex_Sans'] text-sm text-[#6d6d6d]">
        Redirecting to dashboard...
      </span>
    </div>
  </motion.div>
</motion.div>
```

**Visual Changes**:
- Added: Full modal overlay with backdrop blur
- Card: Cream background with gold border
- Icon: Gold gradient circle with celebration emoji
- Shadow: Dramatic gold-tinted shadow
- Animation: Scale-in with spring effect
- Heading: Playfair Display, burgundy color
- Added: Loading spinner with burgundy accent

---

### 8. Background System

**BEFORE**:
```tsx
<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 relative overflow-hidden">
  {/* Subtle background gradients */}
  <div className="absolute inset-0 section-gradient-1" />
  <div className="absolute inset-0 section-gradient-2" />
</div>
```

**AFTER**:
```tsx
<div className="min-h-screen bg-[#F5F5DC] relative overflow-hidden">
  {/* Layer 1: Parchment texture */}
  <div
    className="absolute inset-0 opacity-40"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60'...")`
    }}
  />

  {/* Layer 2: Mesh gradient */}
  <div
    className="absolute inset-0 opacity-20"
    style={{
      backgroundImage: `
        radial-gradient(at 40% 20%, rgba(125, 17, 40, 0.3) 0px, transparent 50%),
        radial-gradient(at 80% 0%, rgba(212, 175, 55, 0.3) 0px, transparent 50%),
        radial-gradient(at 0% 50%, rgba(43, 43, 43, 0.2) 0px, transparent 50%),
        radial-gradient(at 80% 50%, rgba(125, 17, 40, 0.2) 0px, transparent 50%),
        radial-gradient(at 0% 100%, rgba(212, 175, 55, 0.3) 0px, transparent 50%),
        radial-gradient(at 80% 100%, rgba(125, 17, 40, 0.2) 0px, transparent 50%)
      `
    }}
  />

  {/* Layer 3: Content */}
  <div className="relative z-10">...</div>
</div>
```

**Visual Changes**:
- Base color: Dark charcoal (#0a0a0f) → Cream beige (#F5F5DC)
- Added: Parchment texture pattern (subtle cross pattern)
- Added: Mesh gradient with burgundy/gold radial spots
- Complexity: 2 gradient layers → 3 layers (base + texture + mesh)
- Feel: Dark/mysterious → Light/elegant/warm

---

## Icon System

### Restaurant Type Icons
```tsx
const RESTAURANT_TYPE_ICONS = {
  'Fine Dining': '🍷',
  'Casual Dining': '🍽️',
  'Bistro': '☕',
  'Pizzeria': '🍕',
  'Steakhouse': '🥩',
  'Seafood': '🦞',
  'Bar': '🍺',
  'Cafe': '☕',
  'Fast Casual': '🍔',
  'Other': '✨'
};
```

### Area Icons
```tsx
const AREA_ICONS = {
  'Indoor': '🏠',
  'Patio': '🌿',
  'Bar': '🍺',
  'Private Room': '🚪',
  'Custom': '✏️'
};
```

### Role Icons
```tsx
const ROLE_ICONS = {
  'Owner': '👑',
  'Manager': '👨‍💼',
  'Host': '👤',
  'Staff': '👔'
};
```

---

## Shadow System

### BEFORE (Simple shadows)
```css
box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);  /* Single layer, indigo tint */
```

### AFTER (Multi-layer premium shadows)

**Burgundy Shadow** (Primary buttons):
```css
box-shadow:
  0 20px 25px -5px rgba(125, 17, 40, 0.3),  /* Large spread */
  0 10px 10px -5px rgba(125, 17, 40, 0.2);  /* Close shadow */
```

**Gold Shadow** (Finish button, premium cards):
```css
box-shadow:
  0 20px 25px -5px rgba(212, 175, 55, 0.3),  /* Large spread */
  0 10px 10px -5px rgba(212, 175, 55, 0.2);  /* Close shadow */
```

**Standard Card Shadow**:
```css
box-shadow: 0 25px 50px -12px rgba(125, 17, 40, 0.25);  /* Deep, soft shadow */
```

---

## Animation Improvements

### Step Transitions

**BEFORE**:
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
>
```

**AFTER**:
```tsx
<motion.div
  key={currentStep}
  initial={{ opacity: 0, x: 50 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -50 }}
  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
>
```

**Changes**:
- Type: Scale in → Slide in from right
- Exit: Added slide out to left
- Easing: Default → Custom cubic-bezier (ease-out-expo)
- Duration: 200ms → 400ms (more elegant)

### Button Hover

**BEFORE**:
```tsx
className="hover:opacity-90"
```

**AFTER**:
```tsx
className="
  hover:-translate-y-1
  hover:shadow-2xl
  active:scale-[0.98]
  transition-all duration-300
"
```

**Changes**:
- Effect: Opacity change → Lift up + larger shadow
- Active state: Added scale down on click
- Transition: Opacity only → All properties
- Duration: Default → 300ms

---

## Spacing System

### BEFORE (Inconsistent)
```tsx
className="p-4 mb-2 gap-3"
className="p-6 mb-4 gap-4"
className="p-8 mb-6 gap-2"
```

### AFTER (8px Grid System)
```tsx
// Follow 8px multiples consistently
className="p-4"    // 16px
className="p-6"    // 24px
className="p-8"    // 32px
className="p-12"   // 48px

className="mb-2"   // 8px
className="mb-3"   // 12px
className="mb-4"   // 16px
className="mb-6"   // 24px
className="mb-8"   // 32px

className="gap-2"  // 8px
className="gap-3"  // 12px
className="gap-4"  // 16px
className="gap-6"  // 24px
```

---

## Responsive Design

### Mobile Breakpoint Adjustments

**Heading Sizes**:
```tsx
className="text-2xl md:text-4xl"      // 24px → 36px
className="text-4xl md:text-5xl"      // 36px → 48px
```

**Grid Columns**:
```tsx
className="grid grid-cols-2 md:grid-cols-4"   // 2 → 4 columns
className="grid grid-cols-1 md:grid-cols-3"   // 1 → 3 columns
```

**Padding**:
```tsx
className="p-6 md:p-8"       // 24px → 32px
className="p-8 md:p-12"      // 32px → 48px
```

**Button Width**:
```tsx
className="w-full md:w-auto"  // Full width mobile, auto desktop
```

---

## Key Differentiators

### What Makes This Premium (vs Generic SaaS)

1. **Color Psychology**:
   - Purple/Indigo = Generic tech/AI
   - Burgundy/Gold = Fine dining, luxury, sophistication

2. **Typography Hierarchy**:
   - System fonts = Utilitarian, generic
   - Playfair Display = Elegant, editorial, premium

3. **Background Treatment**:
   - Dark with glass morphism = Trendy, overused
   - Cream with parchment texture = Timeless, restaurant-appropriate

4. **Shadow Depth**:
   - Simple single-layer = Flat, 2D
   - Multi-layer colored shadows = Depth, quality, craftsmanship

5. **Animation Style**:
   - Quick fades = Efficient but forgettable
   - Slides with custom easing = Thoughtful, polished

6. **Icon Usage**:
   - Generic UI icons = Functional
   - Restaurant-themed emojis = Personality, context

7. **Success Celebration**:
   - Toast notification = Standard
   - Full modal with animation = Memorable moment

---

## Before/After Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Feel** | Dark tech startup | Luxury restaurant |
| **Color Palette** | Purple/Indigo | Burgundy/Gold |
| **Background** | Dark (#0a0a0f) | Cream (#F5F5DC) |
| **Typography** | System fonts | Playfair + IBM Plex |
| **Cards** | Glass morphism | Cream with beige border |
| **Buttons** | Purple gradient | Burgundy gradient |
| **Shadows** | Simple blue-tinted | Multi-layer burgundy |
| **Icons** | Generic | Restaurant-themed |
| **Animations** | Quick fades | Elegant slides |
| **Success** | Toast | Full celebration modal |
| **Target Audience** | Tech startups | Fine dining establishments |
| **Brand Perception** | Modern, trendy | Timeless, sophisticated |

---

## Testing Visual Quality

### Quick Visual Checklist

When you see the onboarding wizard, it should feel like:

✅ You're checking in to a **5-star hotel**, not a tech startup
✅ You're reading a **wine menu**, not a software manual
✅ You're being served by a **sommelier**, not a chatbot
✅ You're in a **Michelin-star restaurant**, not a co-working space

If it feels like any of the "not" items, the design needs refinement.

---

**Visual Reference Complete**
**Use this document**: When implementing design changes to maintain consistency
**Pair with**: ONBOARDING_DESIGN_SPEC.md (technical specs) + ONBOARDING_IMPLEMENTATION_GUIDE.md (step-by-step)
