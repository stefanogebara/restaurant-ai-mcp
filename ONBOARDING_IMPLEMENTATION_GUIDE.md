# Onboarding Wizard - Implementation Guide

## What's Been Updated

### Main Container (`client/src/pages/Onboarding.tsx`)
✅ **COMPLETED** - The main onboarding container has been fully redesigned with:
- Premium cream/parchment background with texture
- Mesh gradient overlay with burgundy/gold radial gradients
- Fixed header with elegant progress bar
- Smooth step transitions with framer-motion
- Success modal with celebration animation
- Responsive design for all screen sizes

## What Needs to Be Updated (Step Components)

You need to update the 6 step components to match the premium restaurant design system:

### 1. Step1Welcome.tsx - Restaurant Info
**File**: `client/src/components/onboarding/Step1Welcome.tsx`

**Key Changes**:
- Replace dark background with cream card styling
- Update heading to Playfair Display
- Convert restaurant type buttons to grid cards with icons
- Add burgundy focus states to inputs
- Update button styles to burgundy gradient

**Critical CSS Classes to Add**:
```tsx
// Heading
className="font-['Playfair_Display'] font-bold text-4xl md:text-5xl text-[#7D1128] mb-3"

// Input fields
className="w-full px-4 py-3 font-['IBM_Plex_Sans'] text-base bg-[#fdfcf6] border-2 border-[#ddd9c0] rounded-xl focus:border-[#ad1e47] focus:ring-4 focus:ring-[#7D1128]/10 focus:scale-[1.01] transition-all duration-200 placeholder:text-[#888888]"

// Restaurant type cards (selected)
className="border-[#7D1128] bg-[#fdf2f4] text-[#7D1128] shadow-lg"

// Restaurant type cards (unselected)
className="border-[#ddd9c0] bg-[#fefdfb] text-[#6d6d6d] hover:border-[#D4AF37] hover:bg-[#fefaec]"
```

**Restaurant Type Icons to Add**:
```tsx
const RESTAURANT_TYPE_ICONS: Record<string, string> = {
  'Fine Dining': '🍷',
  'Casual Dining': '🍽️',
  'Bistro': '☕',
  'Pizzeria': '🍕',
  'Steakhouse': '🥩',
  'Seafood': '🦞',
  'Bar': '🍺',
  'Cafe': '☕',
};
```

---

### 2. Step1_5Profile.tsx - Dashboard Profile
**File**: `client/src/components/onboarding/Step1_5Profile.tsx`

**Key Changes**:
- Convert metric cards to cream background with burgundy accents
- Add gold "Pro" badges for premium features
- Update selected state to burgundy background
- Add icons to metric cards

**Metric Card Structure**:
```tsx
<button
  className={`
    p-5 rounded-xl border-2 transition-all duration-300 text-left
    ${isSelected
      ? 'border-[#7D1128] bg-[#fdf2f4]'
      : 'border-[#ddd9c0] bg-[#fefdfb] hover:border-[#cbc5a7]'
    }
  `}
>
  <div className="flex items-start justify-between mb-3">
    <span className="text-3xl">{metric.icon}</span>
    {metric.isPremium && (
      <span className="px-2 py-1 bg-gradient-to-r from-[#fad24e] to-[#D4AF37] text-[#2B2B2B] font-['IBM_Plex_Sans'] font-bold text-xs rounded-full">
        ⭐ Pro
      </span>
    )}
  </div>
  <h3 className="font-['IBM_Plex_Sans'] font-semibold text-base text-[#7D1128] mb-1">
    {metric.name}
  </h3>
  <p className="font-['IBM_Plex_Sans'] text-xs text-[#6d6d6d]">
    {metric.description}
  </p>
</button>
```

---

### 3. Step2Contact.tsx - Contact & Business Hours
**File**: `client/src/components/onboarding/Step2Contact.tsx`

**Key Changes**:
- Update business hours table with cream backgrounds
- Create elegant toggle switches (green when open, gray when closed)
- Style time pickers with burgundy focus states
- Update "Copy Hours" button with burgundy accent

**Toggle Switch Component**:
```tsx
<label className="relative inline-flex items-center cursor-pointer">
  <input
    type="checkbox"
    checked={day.is_open}
    onChange={(e) => updateDay(index, 'is_open', e.target.checked)}
    className="sr-only peer"
  />
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
      ${day.is_open ? 'translate-x-6' : 'translate-x-0'}
    `} />
  </div>
</label>
```

**Time Picker Styling**:
```tsx
<input
  type="time"
  className="
    px-3 py-2
    bg-[#fdfcf6]
    border-2 border-[#ddd9c0]
    rounded-lg
    font-['IBM_Plex_Sans'] text-sm text-[#2B2B2B]
    focus:border-[#7D1128]
    focus:ring-2 focus:ring-[#7D1128]/10
    transition-all duration-200
  "
/>
```

---

### 4. Step3Tables.tsx - Table Configuration
**File**: `client/src/components/onboarding/Step3Tables.tsx`

**Key Changes**:
- Create capacity summary card with gold border
- Add area tabs with burgundy active state
- Convert table steppers to burgundy accent
- Add area icons (Indoor: 🏠, Patio: 🌿, Bar: 🍺)

**Total Capacity Card**:
```tsx
<div className="
  bg-gradient-to-br from-[#fdf2f4] to-[#fefaec]
  border-2 border-[#D4AF37]
  rounded-xl p-6
  shadow-lg
">
  <div className="flex items-center justify-between">
    <div>
      <p className="font-['IBM_Plex_Sans'] font-semibold text-lg text-[#7D1128]">
        Total Capacity
      </p>
      <p className="font-['IBM_Plex_Sans'] text-sm text-[#6d6d6d]">
        Across all areas
      </p>
    </div>
    <div className="text-right">
      <p className="font-['Playfair_Display'] font-bold text-4xl text-[#7D1128]">
        {totalCapacity}
      </p>
      <p className="font-['IBM_Plex_Sans'] text-sm text-[#D4AF37]">
        {totalTables} tables
      </p>
    </div>
  </div>
</div>
```

**Area Tab Active State**:
```tsx
className={`
  ${activeArea === index
    ? 'bg-gradient-to-r from-[#ad1e47] to-[#7D1128] text-[#fefdfb] shadow-lg'
    : 'bg-[#fdfcf6] text-[#6d6d6d] border-2 border-[#ddd9c0] hover:border-[#D4AF37]'
  }
`}
```

**Stepper Buttons**:
```tsx
<button className="
  w-10 h-10
  bg-[#fdfcf6]
  border-2 border-[#ad1e47]
  rounded-lg
  text-[#ad1e47]
  font-bold text-xl
  hover:bg-[#fdf2f4]
  active:scale-95
  transition-all duration-200
">
  +
</button>
```

---

### 5. Step4Settings.tsx - Reservation Settings
**File**: `client/src/components/onboarding/Step4Settings.tsx`

**Key Changes**:
- Style range slider with burgundy track
- Update dropdowns with cream backgrounds
- Create preview card with gold border
- Add burgundy focus states to textarea

**Range Slider (Advance Booking)**:
```tsx
<input
  type="range"
  className="
    w-full h-2
    bg-[#ddd9c0]
    rounded-full
    appearance-none
    cursor-pointer
    [&::-webkit-slider-thumb]:appearance-none
    [&::-webkit-slider-thumb]:w-5
    [&::-webkit-slider-thumb]:h-5
    [&::-webkit-slider-thumb]:rounded-full
    [&::-webkit-slider-thumb]:bg-gradient-to-r
    [&::-webkit-slider-thumb]:from-[#ad1e47]
    [&::-webkit-slider-thumb]:to-[#7D1128]
    [&::-webkit-slider-thumb]:shadow-lg
    [&::-webkit-slider-thumb]:cursor-pointer
  "
/>
```

**Preview Card**:
```tsx
<div className="
  bg-gradient-to-br from-[#fefaec] to-[#fdf2f4]
  border-2 border-[#D4AF37]
  rounded-xl p-6
">
  <div className="flex items-start gap-3">
    <svg className="w-6 h-6 text-[#D4AF37] flex-shrink-0" />
    <div>
      <p className="font-['IBM_Plex_Sans'] font-semibold text-sm text-[#7D1128] mb-2">
        Customer Preview
      </p>
      <div className="space-y-1 font-['IBM_Plex_Sans'] text-sm text-[#4f4f4f]">
        <p>📅 Book up to {advanceBookingDays} days ahead</p>
        <p>⏱️ {bufferTime} minute buffer</p>
        <p>❌ {cancellationPolicy}</p>
      </div>
    </div>
  </div>
</div>
```

---

### 6. Step5Team.tsx - Team Setup
**File**: `client/src/components/onboarding/Step5Team.tsx`

**Key Changes**:
- Update team member cards with cream backgrounds
- Create burgundy gradient avatars
- Add role badges (Manager: burgundy, Staff: gold)
- Replace final button with **GOLD gradient** (not burgundy!)

**Team Member Card**:
```tsx
<div className="
  flex items-center justify-between
  p-4
  bg-[#fefdfb]
  border-2 border-[#ddd9c0]
  rounded-xl
  hover:border-[#D4AF37]
  transition-all duration-200
">
  <div className="flex items-center gap-3">
    {/* Burgundy gradient avatar */}
    <div className="
      w-12 h-12
      bg-gradient-to-br from-[#ad1e47] to-[#7D1128]
      rounded-full
      flex items-center justify-center
      text-[#fefdfb]
      font-['IBM_Plex_Sans'] font-bold text-lg
    ">
      {member.email.charAt(0).toUpperCase()}
    </div>

    <div>
      <p className="font-['IBM_Plex_Sans'] font-medium text-base text-[#2B2B2B]">
        {member.email}
      </p>

      {/* Role badge */}
      <span className={`
        inline-flex items-center gap-1.5
        px-2 py-1
        font-['IBM_Plex_Sans'] font-semibold text-xs
        rounded-full
        ${member.role === 'Manager'
          ? 'bg-[#fdf2f4] text-[#7D1128] border border-[#f4a8b8]'
          : 'bg-[#fefaec] text-[#D4AF37] border border-[#fce588]'
        }
      `}>
        {member.role === 'Manager' ? '👨‍💼' : '👤'} {member.role}
      </span>
    </div>
  </div>
</div>
```

**GOLD Finish Button** (Step 6 only):
```tsx
<button
  onClick={onComplete}
  disabled={isSubmitting}
  className="
    px-8 py-3
    font-['IBM_Plex_Sans'] font-bold text-lg
    bg-gradient-to-r from-[#fad24e] to-[#D4AF37]
    text-[#2B2B2B]
    rounded-xl
    hover:-translate-y-1 hover:shadow-2xl
    active:scale-[0.98]
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-all duration-300
    flex items-center gap-2
  "
  style={{
    boxShadow: '0 20px 25px -5px rgba(212, 175, 55, 0.3), 0 10px 10px -5px rgba(212, 175, 55, 0.2)'
  }}
>
  {isSubmitting ? (
    <>
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#2B2B2B]/30 border-t-[#2B2B2B]" />
      Setting up...
    </>
  ) : (
    <>
      🎉 Complete Setup
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </>
  )}
</button>
```

---

## Standard Navigation Buttons (All Steps)

### Back Button (Steps 2-6)
```tsx
<button
  onClick={onBack}
  className="
    px-6 py-3
    font-['IBM_Plex_Sans'] font-medium text-base
    bg-[#fdfcf6]
    text-[#7D1128]
    border-2 border-[#ddd9c0]
    rounded-xl
    hover:bg-[#fdf2f4] hover:border-[#7D1128]
    transition-all duration-200
    flex items-center gap-2
  "
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
  Back
</button>
```

### Continue Button (Steps 1-5)
```tsx
<button
  onClick={onNext}
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
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
</button>
```

---

## Common Patterns to Replace

### OLD Pattern (Glass morphism, dark theme)
```tsx
// ❌ Remove these patterns
className="glass-input"
className="glass-card"
className="glass-button-primary"
className="bg-white/5"
className="border-white/20"
className="text-white"
className="bg-gradient-to-r from-indigo-500 to-purple-500"
```

### NEW Pattern (Premium restaurant, light theme)
```tsx
// ✅ Use these patterns instead
className="bg-[#fdfcf6]"                                    // Input backgrounds
className="border-2 border-[#ddd9c0]"                       // Input borders
className="text-[#2B2B2B]"                                  // Body text
className="text-[#7D1128]"                                  // Headings/labels
className="bg-gradient-to-r from-[#ad1e47] to-[#7D1128]"   // Primary buttons
className="bg-gradient-to-r from-[#fad24e] to-[#D4AF37]"   // Gold buttons (Step 6 only)
className="focus:border-[#ad1e47]"                          // Focus states
className="focus:ring-4 focus:ring-[#7D1128]/10"           // Focus rings
```

---

## Font Loading (Required)

Add this to `client/index.html` in the `<head>`:

```html
<!-- Premium Restaurant Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

---

## Testing Checklist

After updating each step component:

### Visual Testing
- [ ] Step heading uses Playfair Display
- [ ] Body text uses IBM Plex Sans
- [ ] Numbers use JetBrains Mono (if applicable)
- [ ] Buttons have burgundy gradient (except Step 6 finish = gold)
- [ ] Form inputs have cream backgrounds
- [ ] Borders are cream/beige color (#ddd9c0)
- [ ] Focus states show burgundy ring
- [ ] Hover states lift buttons
- [ ] Success indicators use forest green
- [ ] Error indicators use deep red
- [ ] Premium badges use gold gradient

### Responsive Testing
- [ ] Test at 375px (mobile)
- [ ] Test at 768px (tablet)
- [ ] Test at 1024px (desktop)
- [ ] Grid columns adjust correctly
- [ ] Text remains readable on mobile
- [ ] Buttons are touch-friendly (min 44px)

### Functional Testing
- [ ] Form validation works
- [ ] Data persists when going back
- [ ] Continue button advances step
- [ ] Back button returns to previous step
- [ ] Success modal appears on completion
- [ ] Loading states display correctly

---

## Color Reference (Copy-Paste)

```tsx
// Burgundy
'#7D1128'   // Primary burgundy (buttons, headings)
'#ad1e47'   // Lighter burgundy (hover states)
'#fdf2f4'   // Very light burgundy (backgrounds)
'#f4a8b8'   // Pink burgundy (borders)

// Gold
'#D4AF37'   // Primary gold (accents, premium badges)
'#fad24e'   // Light gold (gradients)
'#fefaec'   // Very light gold (backgrounds)
'#fce588'   // Pale gold (borders)

// Cream
'#F5F5DC'   // Primary cream (page background)
'#fefdfb'   // Off-white cream (card backgrounds)
'#fdfcf6'   // Warm cream (input backgrounds)
'#ddd9c0'   // Beige cream (borders)
'#cbc5a7'   // Darker cream (hover borders)

// Charcoal
'#2B2B2B'   // Primary charcoal (body text)
'#4f4f4f'   // Medium charcoal (secondary text)
'#6d6d6d'   // Light charcoal (tertiary text)
'#888888'   // Gray (placeholders)

// Success (Forest Green)
'#4A7C59'   // Primary success
'#86efac'   // Light success
'#bbf7d0'   // Very light success

// Error (Deep Red)
'#991B1B'   // Primary error
'#dc2626'   // Lighter error
'#fef2f2'   // Very light error background
```

---

## Implementation Priority

1. **Step1Welcome.tsx** (High Priority)
   - First impression matters most
   - Sets the tone for entire onboarding
   - Straightforward updates

2. **Step2Contact.tsx** (High Priority)
   - Business hours toggle is complex
   - Needs careful attention to UX

3. **Step3Tables.tsx** (Medium Priority)
   - Area tabs and steppers need redesign
   - Capacity card is important visual element

4. **Step5Team.tsx** (Medium Priority)
   - Final step with gold finish button
   - Team member cards need avatar styling

5. **Step4Settings.tsx** (Lower Priority)
   - Mostly standard form elements
   - Preview card adds nice touch

6. **Step1_5Profile.tsx** (Lower Priority)
   - Optional step, can be skipped
   - Metric cards are similar pattern to restaurant type cards

---

## Quick Start Command

After making changes, test locally:

```bash
# Navigate to project directory
cd C:\Users\stefa\restaurant-ai-mcp

# Install dependencies (if needed)
npm install --legacy-peer-deps

# Run development server
npm run dev

# Open browser to
http://localhost:8086/onboarding
```

---

## Success Criteria

Your onboarding wizard will be complete when:

✅ All text uses correct fonts (Playfair Display, IBM Plex Sans, JetBrains Mono)
✅ Color palette is burgundy/gold/cream throughout (no purple/indigo)
✅ Backgrounds are cream/parchment (not dark)
✅ Buttons have hover lift effect and smooth transitions
✅ Progress bar shows burgundy gradient for completed steps
✅ Success modal appears with gold celebration
✅ Responsive design works on mobile (375px)
✅ Feels like a white-glove concierge service
✅ Every detail exudes premium restaurant quality

---

**Files Updated**: 1/7 (Onboarding.tsx container complete)
**Files Remaining**: 6 step components need styling updates
**Estimated Time**: 2-3 hours for all 6 components
**Priority**: Step1Welcome → Step2Contact → Step3Tables → Step5Team → Step4Settings → Step1_5Profile

**Design Spec**: See `ONBOARDING_DESIGN_SPEC.md` for complete details
**Frontend Skill**: See `.claude/skills/frontend-design/SKILL.md` for full design system
