# Phase 8 — Staffing Intelligence Design

## What We're Building

A 7-day staffing forecast system with a dashboard widget and Manager AI integration. Restaurant managers configure simple per-role ratios once (e.g. "1 FOH per 15 covers"), and the system automatically calculates recommended headcount for each day based on upcoming reservations.

## Decisions

- **Surface**: Dashboard widget (7-day view) + Manager AI chat explains reasoning
- **Data source**: Per-role ratio config stored in `restaurant_config.staffing_config` JSONB column (no new table)
- **Scope**: Next 7 days

---

## Architecture

### Config Storage
JSONB column `staffing_config` on existing `restaurant_config` table:
```json
{
  "roles": [
    { "name": "FOH", "covers_per_staff": 15 },
    { "name": "BOH", "covers_per_staff": 20 },
    { "name": "Bar", "covers_per_staff": 25 }
  ]
}
```

### Calculation Logic (`api/services/staffingService.js`)
- Fetch next 7 days of reservations grouped by date
- For each role: `recommended = Math.ceil(covers / covers_per_staff)`, minimum 1
- Returns `[{ date, day, expected_covers, roles: [{ name, recommended }] }]`

### API Endpoints
- `GET /api/staffing-config` — returns current config
- `PATCH /api/staffing-config` — validates and merges role array
- `GET /api/staffing-forecast` — 7-day forecast array

### Manager AI Snapshot
New `[STAFFING FORECAST]` block injected into `restaurantSnapshot.js`:
```
Mon Mar 2: 42 covers → FOH: 3, BOH: 2, Bar: 2
Tue Mar 3: 18 covers → FOH: 2, BOH: 1, Bar: 1
...
```

### Frontend
- `StaffingForecastWidget.tsx` — dashboard card, 7-day table, skeleton/empty states
- `StaffingSettingsPanel.tsx` — role ratio config UI in WhatsApp Settings page
- `useStaffingForecast` hook — React Query, 10-min stale time
- `useStaffingConfig` + `useSaveStaffingConfig` hooks

---

## Implementation Order

1. DB migration (add `staffing_config` column)
2. `staffingService.js` + unit tests
3. `staffing-forecast.js` endpoint + tests
4. `staffing-config.js` endpoint + tests
5. `restaurantSnapshot.js` — inject staffing forecast
6. Frontend hooks + `StaffingForecastWidget.tsx` + `StaffingSettingsPanel.tsx`
7. Full suite verification + CLAUDE.md update + push
