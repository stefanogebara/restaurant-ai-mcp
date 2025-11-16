# Location Selector - Visual Guide

## Component Visual Structure

### Country Dropdown (Closed State)
```
┌────────────────────────────────────────────────────────┐
│ Country *                                              │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🌍  Select your country                      ˅   │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Country Dropdown (Open State with Selection)
```
┌────────────────────────────────────────────────────────┐
│ Country *                                              │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🌍  🇪🇸 Spain                                 ˄   │ │  ← Selected
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ┌────────────────────────────────────────────┐   │ │
│ │ │ 🔍 Search countries...                     │   │ │  ← Search box
│ │ └────────────────────────────────────────────┘   │ │
│ │ ┌────────────────────────────────────────────┐   │ │
│ │ │ 🇪🇸 SPANISH                                │   │ │  ← Language group header
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ 🇪🇸 Spain                           ◄────  │   │ │  ← Selected (purple highlight)
│ │ │ 🇲🇽 Mexico                                 │   │ │
│ │ │ 🇦🇷 Argentina                              │   │ │
│ │ │ 🇨🇴 Colombia                               │   │ │
│ │ │ 🇨🇱 Chile                                  │   │ │
│ │ │ 🇵🇪 Peru                                   │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ 🇵🇹 PORTUGUESE                             │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ 🇵🇹 Portugal                               │   │ │
│ │ │ 🇧🇷 Brazil                                 │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ 🇫🇷 FRENCH                                 │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ 🇫🇷 France                                 │   │ │
│ │ │ 🇧🇪 Belgium                                │   │ │
│ │ │ ...                                        │   │ │  ← Scrollable
│ │ └────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### City Dropdown (Disabled State - No Country Selected)
```
┌────────────────────────────────────────────────────────┐
│ City *                                                 │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📍  Select country first                     ˅   │ │  ← Grayed out, disabled
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### City Dropdown (Open State after Country Selection)
```
┌────────────────────────────────────────────────────────┐
│ City *                                                 │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📍  Barcelona                                ˄   │ │  ← Selected
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ┌────────────────────────────────────────────┐   │ │
│ │ │ 🔍 Search cities...                        │   │ │  ← Search box
│ │ └────────────────────────────────────────────┘   │ │
│ │ ┌────────────────────────────────────────────┐   │ │
│ │ │ Madrid                                     │   │ │
│ │ │ Community of Madrid                        │   │ │  ← Region subtitle
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ Barcelona                          ◄────   │   │ │  ← Selected (purple highlight)
│ │ │ Catalonia                                  │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ Valencia                                   │   │ │
│ │ │ Valencian Community                        │   │ │
│ │ ├────────────────────────────────────────────┤   │ │
│ │ │ Seville                                    │   │ │
│ │ │ Andalusia                                  │   │ │
│ │ │ ...                                        │   │ │  ← Scrollable
│ │ └────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Auto-Language Notification (After Country Selection)
```
┌────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────┐ │
│ │  ✓   Language automatically set                  │ │  ← Purple background
│ │      Based on your country selection: es-ES      │ │  ← Violet text
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

## Color Scheme (Dark Theme)

### Background Colors
- **Dropdown Background**: `bg-[#1a1625]/95` (dark purple with 95% opacity)
- **Selected Item**: `bg-[#8b5cf6]/20` (violet with 20% opacity)
- **Hover State**: `bg-white/10` (white with 10% opacity)
- **Input Background**: `bg-white/5` (white with 5% opacity)
- **Language Group Header**: `bg-white/5` (white with 5% opacity)

### Border Colors
- **Default Border**: `border-white/10` (subtle white outline)
- **Focus Border**: `border-[#8b5cf6]` (vibrant violet)
- **Error Border**: `border-red-500/50` (red with 50% opacity)

### Text Colors
- **Primary Text**: `text-white` (pure white)
- **Secondary Text**: `text-gray-400` (medium gray)
- **Selected Text**: `text-[#8b5cf6]` (violet)
- **Placeholder**: `text-gray-400` (medium gray)
- **Error Text**: `text-red-400` (light red)

### Effects
- **Backdrop Blur**: `backdrop-blur-xl` (extra large blur)
- **Shadow**: `shadow-2xl` (extra large shadow)
- **Shadow Color**: `shadow-purple-500/30` (purple shadow with 30% opacity)

## Search Functionality Visual

### Before Search
```
┌────────────────────────────────────────────┐
│ 🔍 Search countries...                     │
└────────────────────────────────────────────┘
Countries shown: 20
```

### During Search (User types "spa")
```
┌────────────────────────────────────────────┐
│ 🔍 spa█                                    │  ← Cursor
└────────────────────────────────────────────┘

Filtered results:
┌────────────────────────────────────────────┐
│ 🇪🇸 SPANISH                                │
├────────────────────────────────────────────┤
│ 🇪🇸 Spain                         ◄─────   │  ← Exact match highlighted
│ 🇲🇽 Mexico                                 │
│ 🇦🇷 Argentina                              │
│ 🇨🇴 Colombia                               │
│ 🇨🇱 Chile                                  │
│ 🇵🇪 Peru                                   │
└────────────────────────────────────────────┘
Countries shown: 6 (filtered from 20)
```

### No Results State
```
┌────────────────────────────────────────────┐
│ 🔍 xyz123                                  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│        No countries found                  │  ← Centered gray text
└────────────────────────────────────────────┘
```

## Error States

### Country Error
```
┌────────────────────────────────────────────────────────┐
│ Country *                                              │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 🌍  Select your country                      ˅   │ │  ← Red border
│ └──────────────────────────────────────────────────┘ │
│ ⚠ Country is required                                 │  ← Red error text
└────────────────────────────────────────────────────────┘
```

### City Error
```
┌────────────────────────────────────────────────────────┐
│ City *                                                 │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📍  Select your city                         ˅   │ │  ← Red border
│ └──────────────────────────────────────────────────┘ │
│ ⚠ City is required                                    │  ← Red error text
└────────────────────────────────────────────────────────┘
```

## Responsive Behavior

### Desktop (Wide Screen)
```
┌───────────────────────────────────────────────────────────┐
│  Country *                        City *                  │
│  ┌─────────────────────────┐     ┌─────────────────────┐ │
│  │ 🌍 Spain            ˅   │     │ 📍 Barcelona    ˅   │ │
│  └─────────────────────────┘     └─────────────────────┘ │
└───────────────────────────────────────────────────────────┘
        Full width                    Full width
```

### Mobile (Narrow Screen)
```
┌─────────────────────────────┐
│  Country *                  │
│  ┌───────────────────────┐  │
│  │ 🌍 Spain          ˅   │  │
│  └───────────────────────┘  │
│                             │
│  City *                     │
│  ┌───────────────────────┐  │
│  │ 📍 Barcelona      ˅   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
     Full width (stacked)
```

## Complete Step 1 Form Layout

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  What's your restaurant called?                           ║
║  Let's start with the basics                              ║
║                                                           ║
║  Restaurant Name *                                        ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │ La Bella Vista                                      │ ║
║  └─────────────────────────────────────────────────────┘ ║
║                                                           ║
║  What type of restaurant? *                               ║
║  ┌───────────┐ ┌───────────┐ ┌───────────┐              ║
║  │ Fine      │ │ Casual    │ │ Fast      │ ...          ║
║  │ Dining ◄──│ │ Dining    │ │ Casual    │              ║
║  └───────────┘ └───────────┘ └───────────┘              ║
║                                                           ║
║  Country *                                                ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │ 🌍  🇪🇸 Spain                                    ˅  │ ║
║  └─────────────────────────────────────────────────────┘ ║
║                                                           ║
║  City *                                                   ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │ 📍  Barcelona                                    ˅  │ ║
║  └─────────────────────────────────────────────────────┘ ║
║                                                           ║
║  ┌─────────────────────────────────────────────────────┐ ║
║  │  ✓   Language automatically set                     │ ║
║  │      Based on your country selection: es-ES         │ ║
║  └─────────────────────────────────────────────────────┘ ║
║                                                           ║
║                                        ┌────────────────┐ ║
║                                        │ Continue    ▶  │ ║
║                                        └────────────────┘ ║
╚═══════════════════════════════════════════════════════════╝
```

## Interaction States

### 1. Initial State
- Country dropdown: Closed, placeholder text
- City dropdown: Disabled, grayed out
- Language notification: Hidden

### 2. Country Dropdown Open
- Country dropdown: Expanded, shows search and countries
- City dropdown: Still disabled
- Language notification: Hidden

### 3. Country Selected
- Country dropdown: Closed, shows selected country with flag
- City dropdown: Enabled, shows placeholder
- Language notification: Visible with auto-populated language

### 4. City Dropdown Open
- Country dropdown: Closed, shows selected country
- City dropdown: Expanded, shows search and cities
- Language notification: Visible

### 5. Both Selected (Complete)
- Country dropdown: Closed, shows selected country with flag
- City dropdown: Closed, shows selected city
- Language notification: Visible
- Form ready to submit

## Scrollbar Design

### Custom Purple Scrollbar
```
┌──────────────────┬──┐
│                  ║░░║  ← Track (light purple)
│ Countries...     ║██║  ← Thumb (darker purple)
│                  ║░░║
│                  ║░░║
│                  ║░░║
└──────────────────┴──┘
     List           8px scrollbar
```

**CSS:**
```css
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.3);  /* Purple */
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.5);  /* Darker on hover */
}
```

## Animation Details

### Chevron Rotation
```
Closed: ˅  (rotate-0)
Open:   ˄  (rotate-180)
Duration: 200ms
```

### Dropdown Slide
```
Opening:
  opacity: 0 → 1
  transform: translateY(-10px) → translateY(0)

Closing:
  opacity: 1 → 0
  transform: translateY(0) → translateY(-10px)

Duration: 200ms
Easing: ease-out
```

### Hover Effects
```
Button Hover:
  background: transparent → bg-white/10
  border-color: border-white/10 → border-white/20

Duration: 200ms
Easing: ease-out
```

## Accessibility Features

### Keyboard Navigation
```
Tab       → Move to next field
Shift+Tab → Move to previous field
Enter     → Open dropdown / Select item
Escape    → Close dropdown
↑/↓       → Navigate dropdown items
Home      → Jump to first item
End       → Jump to last item
```

### Screen Reader Announcements
```
"Country, required, combobox"
"Select your country"
"Spain selected"
"City, required, combobox"
"City dropdown is disabled until country is selected"
"Barcelona selected"
```

### Focus States
```
┌──────────────────────────────────────────────────┐
│ 🌍  Spain                                    ˅   │  ← Violet glow ring
└──────────────────────────────────────────────────┘
      focus:ring-2 focus:ring-violet-500
```

## Summary

The Location Selector provides:
- ✅ Clean, modern dark theme interface
- ✅ Searchable dropdowns with instant filtering
- ✅ Visual organization by language groups
- ✅ Flag emojis for quick country identification
- ✅ Region information for city disambiguation
- ✅ Auto-language notification with visual feedback
- ✅ Error states with clear messaging
- ✅ Responsive design for all screen sizes
- ✅ Custom purple scrollbar matching brand
- ✅ Smooth animations and transitions
- ✅ Full keyboard and screen reader support

The design matches the existing onboarding dark theme and provides an intuitive, error-free location selection experience.
