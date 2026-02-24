# Dashboard & UI Redesign Plan

**Goal:** Premium, spacious SaaS UI — Linear/Vercel inspired. Fix squished components, poor spacing, flat visuals.

**Design Principles:**
- 8px spacing grid — all gaps/padding multiples of 8
- Generous whitespace — cards breathe, nothing crammed
- Thin 1px borders + shadow-sm — modern flat+depth
- Responsive canvas — FloorPlanView fills container (not fixed 520px)
- Max 3 accent colors: burgundy, green (available), amber (reserved)

## Task 1: Dashboard Shell + Header
File: `client/src/pages/Dashboard.tsx`

1. Remove `pl-12` from header div (causes misalignment)
2. Redesign header: separate title from date, stack them vertically on left side
   - `<h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">Dashboard</h1>`
   - `<p className="text-sm text-muted-stone mt-0.5">{formattedDate}</p>`
3. Soften trial banner: `bg-amber-50 border border-amber-200 rounded-xl px-4 py-3` — no big CTA button, just a link
4. Right column: add `lg:sticky lg:top-8` so it stays visible while scrolling
5. Bottom padding: `pb-28 sm:pb-20` → `pb-16 sm:pb-10`
6. Week-view toggle: wrap in segmented control style `bg-soft-gray rounded-lg p-0.5`
7. Export button: add `Download` icon from lucide-react

## Task 2: StatsBar — Icons + Better Hierarchy
File: `client/src/components/dashboard/StatsBar.tsx`

Each StatCard:
- Add icon badge: `w-8 h-8 rounded-lg bg-soft-gray flex items-center justify-center` at top
- Icons (from lucide-react): CalendarDays, LayoutGrid, Users, UtensilsCrossed
- Add `mb-4` after icon row (before value)
- Progress bar: `h-1` → `h-2`, add gradient: `bg-gradient-to-r from-burgundy/60 to-burgundy`
- Card: add `hover:shadow-sm transition-shadow duration-200`
- Grid gap: `gap-4` → `gap-3 sm:gap-4`
- Card padding: `p-6` → `p-5` (slightly more compact to fit icon)

## Task 3: FloorPlanView — Responsive Canvas
Files: `client/src/components/host/FloorPlanView.tsx`, `client/src/components/dashboard/TableLayoutPanel.tsx`

FloorPlanView.tsx:
- Add `containerRef` + ResizeObserver to measure container width
- Replace fixed `const W = 520` with `const W = Math.max(380, containerWidth - 32)`
- Increase GAP from 28 → 32 (more breathing room between tables)
- Location section headers: add colored dot + flex divider line
  - Indoor: `#6366f1`, Patio: `#10b981`, Bar: `#f59e0b`
  - `<div className="flex items-center gap-3 mb-4 mt-2">` with dot + label + count badge + `<div className="flex-1 h-px bg-border-gray" />`

TableLayoutPanel.tsx:
- Inner content padding: `p-4` → `p-5 sm:p-6`
- Add `min-h-[420px]` to floor plan container
- "Live" badge: replace with pulsing dot animation using Tailwind `animate-ping`

## Task 4: ReservationsList — Spacing + Badges
File: `client/src/components/dashboard/ReservationsList.tsx`

1. Row vertical padding: `py-4` → `py-[18px]`
2. Status badge: `text-[11px] px-2.5 py-1` → `text-xs px-3 py-1 rounded-full` + add colored dot prefix
3. Avatar: generate gradient from name charCode (consistent per name)
4. Add left border accent for large parties (size >= 6): `border-l-2 border-l-burgundy/30 pl-5`
5. Empty state icon: replace generic icon with `CalendarX` from lucide-react, reduce `py-12` → `py-10`

## Task 5: ActivePartiesPanel + WaitlistPanel
Files: `client/src/components/dashboard/ActivePartiesPanel.tsx`, `client/src/components/host/WaitlistPanel.tsx`

ActivePartiesPanel:
- Each party row: wrap in `m-2 rounded-xl border border-border-gray bg-white p-4 hover:shadow-sm transition-shadow` (card style)
- Progress bar: `h-1.5` → `h-2`, gradient fill green → red when overdue
- Add "N guests seated" subtext under header title when count > 0
- Complete button: `mt-2` → `mt-3`

WaitlistPanel:
- Guest rows: `py-3` → `py-4`
- Empty state: add icon + proper description text

## Task 6: Sidebar Polish
File: `client/src/components/layout/Sidebar.tsx`

1. Section labels: `text-[10px] tracking-[2px]` → `text-[11px] tracking-widest` (more readable)
2. Nav item padding: `px-7 py-2.5` → `px-6 py-3` (44px touch target)
3. Nav icon size: `w-[18px] h-[18px]` → `w-5 h-5`
4. Logo padding: `py-8 px-7` → `py-6 px-6`
5. User email: `text-[11px]` → `text-xs`
6. Active item: add left border accent `border-l-2 border-burgundy` + transparent border for inactive
7. Section spacing: `mb-7` → `mb-5`

## Task 7: Build + Test + Commit
```bash
cd /c/Users/stefa/restaurant-ai-mcp/client && npm run build
cd /c/Users/stefa/restaurant-ai-mcp/client && npx vitest run
cd /c/Users/stefa/restaurant-ai-mcp
git add -A
git commit -m "feat: premium dashboard redesign — spacing, icons, responsive floor plan"
git push
```
