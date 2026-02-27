# Dashboard Polish — Final 3 Items

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining 3 dashboard redesign items that were missed in previous sessions.

**Context:** The original dashboard-redesign plan (2026-02-24) is ~95% done. Three small items remain:
1. `pl-12` on Dashboard header wrapper (misaligns on mobile)
2. Today/Tomorrow toggle in ReservationsList lacks segmented-control container
3. Large party (≥6) rows in ReservationsList lack left-border accent

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

## Task 1: Fix Dashboard Header Left Padding

**File:** `client/src/pages/Dashboard.tsx` line 159

**Problem:** `pl-12 sm:pl-0` was patching the mobile hamburger overlap, but `sm:pl-0` means desktop is fine already. Replace with `mt-14 sm:mt-0` which clears the fixed hamburger button (56px) vertically instead of horizontally — cleaner and doesn't push content right on mobile.

**Step 1: Edit**

Current:
```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
```

New:
```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-14 sm:mt-0">
```

**Step 2: Commit**
```bash
git add client/src/pages/Dashboard.tsx
git commit -m "fix: replace header pl-12 with mt-14 to clear mobile hamburger"
```

---

## Task 2: Segmented-Control Style on Today/Tomorrow Toggle

**File:** `client/src/components/dashboard/ReservationsList.tsx` lines 89–108

**Problem:** Toggle container `<div className="flex gap-0">` has no background — active button bg-soft-gray looks flat. Wrap in pill container with active = white card.

**Step 1: Replace toggle block**

Find (lines 89–108):
```tsx
<div className="flex gap-0">
  <button
    type="button"
    onClick={() => setShowTomorrow(false)}
    className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
      !showTomorrow ? 'text-deep-charcoal bg-soft-gray' : 'text-muted-stone hover:text-stone-gray'
    }`}
  >
    {t.today}
  </button>
  <button
    type="button"
    onClick={() => setShowTomorrow(true)}
    className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
      showTomorrow ? 'text-deep-charcoal bg-soft-gray' : 'text-muted-stone hover:text-stone-gray'
    }`}
  >
    {t.tomorrow}
  </button>
</div>
```

Replace with:
```tsx
<div className="flex gap-0.5 bg-soft-gray rounded-lg p-0.5">
  <button
    type="button"
    onClick={() => setShowTomorrow(false)}
    className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${
      !showTomorrow
        ? 'bg-white text-deep-charcoal shadow-sm'
        : 'text-muted-stone hover:text-stone-gray'
    }`}
  >
    {t.today}
  </button>
  <button
    type="button"
    onClick={() => setShowTomorrow(true)}
    className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${
      showTomorrow
        ? 'bg-white text-deep-charcoal shadow-sm'
        : 'text-muted-stone hover:text-stone-gray'
    }`}
  >
    {t.tomorrow}
  </button>
</div>
```

**Step 2: Commit**
```bash
git add client/src/components/dashboard/ReservationsList.tsx
git commit -m "feat: segmented control style on reservations Today/Tomorrow toggle"
```

---

## Task 3: Large-Party Left Border Accent

**File:** `client/src/components/dashboard/ReservationsList.tsx` — `ReservationRow`, line 186

**Problem:** Reservations with ≥6 guests have no visual differentiation.

**Step 1: Make the row border conditional**

Current line 186:
```tsx
<div className="flex items-center px-6 py-[18px] border-b border-warm-white last:border-b-0 gap-4 hover:bg-warm-white/50 transition-colors">
```

Replace with:
```tsx
<div className={`flex items-center py-[18px] border-b border-warm-white last:border-b-0 gap-4 hover:bg-warm-white/50 transition-colors ${
  reservation.party_size >= 6
    ? 'pl-5 pr-6 border-l-2 border-l-burgundy/30'
    : 'px-6'
}`}>
```

**Step 2: Commit**
```bash
git add client/src/components/dashboard/ReservationsList.tsx
git commit -m "feat: left border accent for large party rows (6+ guests)"
```

---

## Task 4: Build + Push

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit && npm run build
cd .. && git push
```

---

## Verification

| Item | Test |
|------|------|
| Header padding | `/host-dashboard/simple` at 375px — header not indented |
| Toggle | Today/Tomorrow: active = white pill on gray bg; inactive = flat |
| Large party | 6+ guest row has faint left burgundy border |
