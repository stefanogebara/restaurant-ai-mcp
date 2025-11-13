# Restaurant AI MCP - Onboarding Wizard Design Specification

## Overview

This document provides complete design specifications for all 6 onboarding steps, following the premium restaurant design system defined in `.claude/skills/frontend-design/SKILL.md`.

**Design Philosophy**: White-glove concierge service for Michelin-star restaurants
**Color Palette**: Burgundy (#7D1128) + Gold (#D4AF37) + Cream (#F5F5DC) + Charcoal (#2B2B2B)
**Typography**: Playfair Display (headings) + IBM Plex Sans (body) + JetBrains Mono (data)

---

## Main Container Design (Already Implemented)

### Background System
```tsx
{/* 3-layer background system */}
<div className="min-h-screen bg-[#F5F5DC] relative overflow-hidden">
  {/* Layer 1: Parchment texture */}
  <div className="absolute inset-0 opacity-40" style={{
    backgroundImage: `url("data:image/svg+xml,...")`
  }} />

  {/* Layer 2: Mesh gradient */}
  <div className="absolute inset-0 opacity-20" style={{
    backgroundImage: `radial-gradient(...)`
  }} />

  {/* Layer 3: Content */}
  <div className="relative z-10">...</div>
</div>
```

### Progress Bar (Fixed Header)
- **Position**: Fixed top, full width, backdrop blur
- **Background**: `bg-[#fdfcf6]/80` with `backdrop-blur-xl`
- **Border**: `border-b-2 border-[#ebe9d5]`
- **Progress bars**: Burgundy gradient for completed/active, cream for pending
- **Step labels**: Dynamic color (burgundy=active, forest green=completed, gray=pending)

### Success Modal
- **Background overlay**: `bg-[#2B2B2B]/50` with backdrop blur
- **Card**: Cream background with gold border
- **Icon**: Gold gradient circle with 🎉 emoji
- **Animation**: Scale-in with spring effect

---

## Step 1: Welcome & Restaurant Info

### Component File
`client/src/components/onboarding/Step1Welcome.tsx`

### Design Updates Needed

#### Step Heading
```tsx
<h1 className="
  font-['Playfair_Display'] font-bold text-4xl md:text-5xl
  text-[#7D1128]
  mb-3
">
  Welcome to RestaurantAI
</h1>

<p className="
  font-['IBM_Plex_Sans'] text-lg
  text-[#4f4f4f]
  mb-8
">
  Let's set up your restaurant in minutes
</p>
```

#### Form Fields

**Restaurant Name Input**:
```tsx
<label className="
  font-['IBM_Plex_Sans'] font-semibold text-base
  text-[#7D1128]
  mb-2 flex items-center gap-2
">
  Restaurant Name
  <span className="text-[#991B1B]">*</span>
</label>

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

**Restaurant Type Cards** (4-column grid):
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {RESTAURANT_TYPES.map((type) => (
    <button
      key={type}
      className={`
        p-4 rounded-xl border-2 transition-all duration-300
        font-['IBM_Plex_Sans'] font-semibold text-sm text-center
        ${selected
          ? 'border-[#7D1128] bg-[#fdf2f4] text-[#7D1128] shadow-lg'
          : 'border-[#ddd9c0] bg-[#fefdfb] text-[#6d6d6d] hover:border-[#D4AF37] hover:bg-[#fefaec]'
        }
      `}
    >
      <div className="text-2xl mb-2">{getIcon(type)}</div>
      {type}
    </button>
  ))}
</div>
```

**Restaurant Type Icons**:
- Fine Dining: 🍷
- Casual Dining: 🍽️
- Bistro: ☕
- Pizzeria: 🍕
- Steakhouse: 🥩
- Seafood: 🦞
- Bar: 🍺
- Cafe: ☕

#### Navigation Buttons

**Continue Button** (bottom right):
```tsx
<button className="
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

## Step 2: Dashboard Profile

### Component File
`client/src/components/onboarding/Step1_5Profile.tsx`

### Design Updates Needed

#### Metric Toggle Cards
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
  {metrics.map((metric) => (
    <button
      key={metric.id}
      onClick={() => toggleMetric(metric.id)}
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
          <span className="
            px-2 py-1
            bg-gradient-to-r from-[#fad24e] to-[#D4AF37]
            text-[#2B2B2B]
            font-['IBM_Plex_Sans'] font-bold text-xs
            rounded-full
          ">
            ⭐ Pro
          </span>
        )}
      </div>

      <h3 className="
        font-['IBM_Plex_Sans'] font-semibold text-base
        text-[#7D1128]
        mb-1
      ">
        {metric.name}
      </h3>

      <p className="
        font-['IBM_Plex_Sans'] text-xs
        text-[#6d6d6d]
      ">
        {metric.description}
      </p>
    </button>
  ))}
</div>
```

#### Metric Examples
- **Occupancy Rate**: 📊 (Basic)
- **Revenue Tracking**: 💰 (Pro)
- **Customer History**: 👥 (Basic)
- **ML Risk Score**: 🎯 (Pro)
- **Wait Times**: ⏱️ (Basic)
- **Table Turnover**: 🔄 (Pro)

---

## Step 3: Contact & Business Hours

### Component File
`client/src/components/onboarding/Step2Contact.tsx`

### Design Updates Needed

#### Business Hours Table
```tsx
<div className="space-y-2 max-h-80 overflow-y-auto pr-2">
  {businessHours.map((day, index) => (
    <div key={day.day} className="
      flex items-center gap-3 p-4
      bg-[#fefdfb]
      border border-[#ddd9c0]
      rounded-xl
    ">
      {/* Day name */}
      <div className="w-28">
        <span className="
          font-['IBM_Plex_Sans'] font-medium text-base
          text-[#2B2B2B]
        ">
          {day.day}
        </span>
      </div>

      {/* Toggle switch */}
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
        <span className="ml-3 font-['IBM_Plex_Sans'] text-sm text-[#4f4f4f]">
          {day.is_open ? 'Open' : 'Closed'}
        </span>
      </label>

      {/* Time pickers */}
      {day.is_open && (
        <>
          <input
            type="time"
            value={day.open_time}
            onChange={(e) => updateDay(index, 'open_time', e.target.value)}
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
          <span className="text-[#6d6d6d]">to</span>
          <input
            type="time"
            value={day.close_time}
            onChange={(e) => updateDay(index, 'close_time', e.target.value)}
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
        </>
      )}
    </div>
  ))}
</div>
```

#### Copy Hours Button
```tsx
<button
  onClick={copyHoursToAll}
  className="
    px-4 py-2
    font-['IBM_Plex_Sans'] font-medium text-sm
    bg-[#fdfcf6]
    text-[#7D1128]
    border-2 border-[#ddd9c0]
    rounded-lg
    hover:bg-[#fdf2f4] hover:border-[#7D1128]
    transition-all duration-200
  "
>
  📋 Copy Monday to all days
</button>
```

---

## Step 4: Table Configuration

### Component File
`client/src/components/onboarding/Step3Tables.tsx`

### Design Updates Needed

#### Total Capacity Card
```tsx
<div className="
  bg-gradient-to-br from-[#fdf2f4] to-[#fefaec]
  border-2 border-[#D4AF37]
  rounded-xl p-6
  shadow-lg
">
  <div className="flex items-center justify-between">
    <div>
      <p className="
        font-['IBM_Plex_Sans'] font-semibold text-lg
        text-[#7D1128]
      ">
        Total Capacity
      </p>
      <p className="
        font-['IBM_Plex_Sans'] text-sm
        text-[#6d6d6d]
      ">
        Across all areas
      </p>
    </div>
    <div className="text-right">
      <p className="
        font-['Playfair_Display'] font-bold text-4xl
        text-[#7D1128]
      ">
        {totalCapacity}
      </p>
      <p className="
        font-['IBM_Plex_Sans'] text-sm
        text-[#D4AF37]
      ">
        {totalTables} tables
      </p>
    </div>
  </div>
</div>
```

#### Area Tabs
```tsx
<div className="flex gap-2 mb-4 overflow-x-auto">
  {areas.map((area, index) => (
    <button
      key={area.name}
      onClick={() => setActiveArea(index)}
      className={`
        px-6 py-3
        font-['IBM_Plex_Sans'] font-semibold text-base
        rounded-xl
        transition-all duration-300
        whitespace-nowrap
        ${activeArea === index
          ? 'bg-gradient-to-r from-[#ad1e47] to-[#7D1128] text-[#fefdfb] shadow-lg'
          : 'bg-[#fdfcf6] text-[#6d6d6d] border-2 border-[#ddd9c0] hover:border-[#D4AF37]'
        }
      `}
    >
      {getAreaIcon(area.name)} {area.name}
    </button>
  ))}
  <button
    onClick={addCustomArea}
    className="
      px-6 py-3
      font-['IBM_Plex_Sans'] font-semibold text-base
      bg-[#fefaec]
      text-[#D4AF37]
      border-2 border-[#D4AF37]
      rounded-xl
      hover:bg-[#fad24e] hover:text-[#2B2B2B]
      transition-all duration-300
      whitespace-nowrap
    "
  >
    + Add Area
  </button>
</div>
```

**Area Icons**:
- Indoor: 🏠
- Patio: 🌿
- Bar: 🍺
- Private Room: 🚪
- Custom: ✏️

#### Table Stepper Controls
```tsx
<div className="
  bg-[#fefdfb]
  border-2 border-[#ddd9c0]
  rounded-xl p-5
">
  <label className="
    font-['IBM_Plex_Sans'] font-semibold text-base
    text-[#7D1128]
    mb-3 block
  ">
    {capacity}-person tables
  </label>

  <div className="flex items-center gap-4">
    {/* Decrement button */}
    <button
      onClick={() => updateCount(count - 1)}
      disabled={count === 0}
      className="
        w-10 h-10
        bg-[#fdfcf6]
        border-2 border-[#ad1e47]
        rounded-lg
        text-[#ad1e47]
        font-bold text-xl
        hover:bg-[#fdf2f4]
        active:scale-95
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-all duration-200
      "
    >
      −
    </button>

    {/* Count display */}
    <div className="
      font-['JetBrains_Mono'] text-2xl font-bold
      text-[#7D1128]
      min-w-[3rem] text-center
    ">
      {count}
    </div>

    {/* Increment button */}
    <button
      onClick={() => updateCount(count + 1)}
      className="
        w-10 h-10
        bg-[#fdfcf6]
        border-2 border-[#ad1e47]
        rounded-lg
        text-[#ad1e47]
        font-bold text-xl
        hover:bg-[#fdf2f4]
        active:scale-95
        transition-all duration-200
      "
    >
      +
    </button>
  </div>

  <p className="
    font-['IBM_Plex_Sans'] text-xs
    text-[#888888]
    mt-2
  ">
    {count * capacity} total seats
  </p>
</div>
```

---

## Step 5: Reservation Settings

### Component File
`client/src/components/onboarding/Step4Settings.tsx`

### Design Updates Needed

#### Advance Booking Slider
```tsx
<div className="
  bg-[#fefdfb]
  border-2 border-[#ddd9c0]
  rounded-xl p-6
">
  <label className="
    font-['IBM_Plex_Sans'] font-semibold text-base
    text-[#7D1128]
    mb-4 block
  ">
    Advance booking window
  </label>

  {/* Range slider */}
  <input
    type="range"
    min="7"
    max="90"
    step="7"
    value={advanceBookingDays}
    onChange={(e) => updateData({ advance_booking_days: parseInt(e.target.value) })}
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

  {/* Value display */}
  <div className="flex justify-between mt-2">
    <span className="font-['IBM_Plex_Sans'] text-sm text-[#888888]">7 days</span>
    <span className="
      font-['JetBrains_Mono'] font-bold text-lg
      text-[#7D1128]
    ">
      {advanceBookingDays} days
    </span>
    <span className="font-['IBM_Plex_Sans'] text-sm text-[#888888]">90 days</span>
  </div>
</div>
```

#### Cancellation Policy Textarea
```tsx
<textarea
  rows={4}
  value={cancellationPolicy}
  onChange={(e) => updateData({ cancellation_policy: e.target.value })}
  placeholder="Enter your cancellation policy..."
  className="
    w-full px-4 py-3
    font-['IBM_Plex_Sans'] text-base
    bg-[#fdfcf6]
    border-2 border-[#ddd9c0]
    rounded-xl
    focus:border-[#ad1e47]
    focus:ring-4 focus:ring-[#7D1128]/10
    transition-all duration-200
    placeholder:text-[#888888]
    resize-none
  "
/>
```

#### Preview Card
```tsx
<div className="
  bg-gradient-to-br from-[#fefaec] to-[#fdf2f4]
  border-2 border-[#D4AF37]
  rounded-xl p-6
">
  <div className="flex items-start gap-3">
    <svg className="w-6 h-6 text-[#D4AF37] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
      <p className="
        font-['IBM_Plex_Sans'] font-semibold text-sm
        text-[#7D1128]
        mb-2
      ">
        Customer Preview
      </p>
      <div className="space-y-1 font-['IBM_Plex_Sans'] text-sm text-[#4f4f4f]">
        <p>📅 Book up to {advanceBookingDays} days ahead</p>
        <p>⏱️ {bufferTime} minute buffer between tables</p>
        <p>❌ {cancellationPolicy}</p>
      </div>
    </div>
  </div>
</div>
```

---

## Step 6: Team Setup

### Component File
`client/src/components/onboarding/Step5Team.tsx`

### Design Updates Needed

#### Team Member Cards
```tsx
<div className="space-y-3">
  {teamMembers.map((member, index) => (
    <div
      key={index}
      className="
        flex items-center justify-between
        p-4
        bg-[#fefdfb]
        border-2 border-[#ddd9c0]
        rounded-xl
        hover:border-[#D4AF37]
        transition-all duration-200
      "
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
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

        {/* Info */}
        <div>
          <p className="
            font-['IBM_Plex_Sans'] font-medium text-base
            text-[#2B2B2B]
          ">
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

      {/* Remove button */}
      <button
        onClick={() => removeMember(index)}
        className="
          p-2
          text-[#dc2626]
          hover:bg-[#fef2f2]
          rounded-lg
          transition-all duration-200
        "
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  ))}
</div>
```

#### Finish Button (Gold)
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

## Navigation Button Standards

### Back Button (All Steps 2-6)
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

## Animation Guidelines

### Step Transitions
- **Entry**: Slide in from right (50px), fade in
- **Exit**: Slide out to left (-50px), fade out
- **Duration**: 400ms
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo)

```tsx
<motion.div
  initial={{ opacity: 0, x: 50 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -50 }}
  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
>
  {/* Step content */}
</motion.div>
```

### Form Field Stagger
```tsx
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    visible: {
      transition: { staggerChildren: 0.05 }
    }
  }}
>
  {fields.map((field, index) => (
    <motion.div
      key={field.id}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
      }}
    >
      {/* Field content */}
    </motion.div>
  ))}
</motion.div>
```

### Button Hover States
- **Transform**: `translateY(-2px)` or `translateY(-1px)`
- **Shadow**: Increase shadow on hover
- **Active**: `scale(0.98)`
- **Duration**: 300ms
- **Easing**: `ease-out-expo`

---

## Responsive Design

### Breakpoints
- **Mobile**: Default (< 640px)
- **Tablet**: 768px (md:)
- **Desktop**: 1024px (lg:)
- **Large Desktop**: 1280px (xl:)

### Mobile Adjustments
- Grid columns: 2 columns → 1 column on mobile
- Font sizes: Reduce by 4-8px on mobile
- Padding: Reduce p-8 → p-6 on mobile
- Button sizes: Full width on mobile when appropriate
- Hide step labels on mobile progress bar

### Example Responsive Classes
```tsx
className="
  text-2xl md:text-4xl        // Heading sizes
  grid grid-cols-2 md:grid-cols-4  // Grid columns
  p-6 md:p-8                   // Padding
  gap-3 md:gap-4               // Grid gap
"
```

---

## Accessibility Standards

### WCAG AA Compliance

**Color Contrast Ratios**:
- Burgundy (#7D1128) on Cream (#fefdfb): 8.5:1 (AAA)
- Charcoal (#2B2B2B) on Cream (#fefdfb): 14.2:1 (AAA)
- Gold (#D4AF37) on Charcoal (#2B2B2B): 4.8:1 (AA Large)

### Focus States
```tsx
className="
  focus:outline-none
  focus:ring-4
  focus:ring-[#7D1128]/10
  focus:border-[#ad1e47]
"
```

### Screen Reader Support
- All form inputs have associated `<label>` elements
- Icon buttons have `aria-label` attributes
- Required fields marked with `aria-required="true"`
- Error messages use `aria-describedby` to link to inputs

### Keyboard Navigation
- All interactive elements are keyboard accessible
- Tab order follows logical flow
- Enter/Space to activate buttons
- Escape to close modals
- Arrow keys for slider controls

---

## Implementation Checklist

For each step component, verify:

- [ ] Playfair Display for step heading
- [ ] IBM Plex Sans for all body text and labels
- [ ] JetBrains Mono for numeric displays
- [ ] Burgundy gradient for primary buttons
- [ ] Gold accents for premium features
- [ ] Cream backgrounds for form elements
- [ ] Border radius: 12px (rounded-xl) for cards/inputs
- [ ] Shadow: `shadow-2xl` with burgundy tint for main cards
- [ ] Hover lift effect on interactive elements
- [ ] Focus ring with burgundy color
- [ ] Smooth transitions (300-400ms)
- [ ] Mobile responsive (test at 375px width)
- [ ] WCAG AA contrast ratios
- [ ] Keyboard navigation support
- [ ] Screen reader labels

---

## Quick Reference: Color Codes

```css
/* Burgundy Palette */
--burgundy-50: #fdf2f4;
--burgundy-100: #fce7eb;
--burgundy-200: #f9d0d9;
--burgundy-300: #f4a8b8;
--burgundy-600: #cc2a56;
--burgundy-700: #ad1e47;
--burgundy-800: #7D1128;  /* PRIMARY */

/* Gold Palette */
--gold-200: #fce588;
--gold-300: #fad24e;
--gold-400: #D4AF37;  /* PRIMARY */
--gold-500: #d9a527;

/* Cream Palette */
--cream-50: #fefdfb;
--cream-100: #fdfcf6;
--cream-200: #F5F5DC;  /* PRIMARY */
--cream-300: #ebe9d5;
--cream-400: #ddd9c0;
--cream-500: #cbc5a7;

/* Charcoal Palette */
--charcoal-400: #888888;
--charcoal-600: #5d5d5d;
--charcoal-700: #4f4f4f;
--charcoal-900: #2B2B2B;  /* PRIMARY */

/* Success (Forest Green) */
--success-200: #bbf7d0;
--success-300: #86efac;
--success-500: #4A7C59;  /* PRIMARY */

/* Error (Deep Red) */
--error-600: #dc2626;
--error-700: #991B1B;  /* PRIMARY */
```

---

## Font Loading (Add to index.html)

```html
<!-- In <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

---

## Testing Protocol

### Visual Testing
1. Test all 6 steps in sequence
2. Verify smooth transitions between steps
3. Check progress bar updates correctly
4. Confirm success modal appears and animates
5. Test responsive design at 375px, 768px, 1024px

### Interaction Testing
1. Fill out all form fields
2. Verify validation errors display correctly
3. Test back/continue navigation
4. Confirm data persists when going back
5. Test skip functionality (Step 2)
6. Test complete setup flow end-to-end

### Browser Testing
- Chrome (latest)
- Safari (latest)
- Firefox (latest)
- Edge (latest)
- Mobile Safari (iOS)
- Chrome Mobile (Android)

---

**Status**: Design specification complete
**Last Updated**: 2025-11-13
**Version**: 1.0
**Author**: Claude Code with User Direction
