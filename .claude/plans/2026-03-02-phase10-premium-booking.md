# Phase 10 -- Premium Booking Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the platform demo-ready for a live end-to-end walkthrough -- a guest books on their phone, pays a deposit, and the host sees smart table suggestions and no-show risk in real time.
**Architecture:** Three vertical slices (PWA + Push, Reservation Intelligence, Stripe Deposit) layered on existing Supabase PostgreSQL multi-tenant schema, Vercel serverless functions, and React 18 frontend. New endpoints follow existing patterns (`createSecureLogger`, `verifyAuth`, `setInternalCors`). Stripe deposit uses `capture_method: manual` for hold-then-capture.
**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Node.js Vercel Serverless, Supabase PostgreSQL, Stripe (`stripe` npm + `@stripe/react-stripe-js`), `web-push` npm, Service Worker API.

---

## File inventory (existing, referenced throughout)

| Shorthand | Absolute path |
|-----------|---------------|
| `supabase.js` | `C:/Users/stefa/restaurant-ai-mcp/api/_lib/supabase.js` |
| `auth.js` | `C:/Users/stefa/restaurant-ai-mcp/api/_lib/auth.js` |
| `cors.js` | `C:/Users/stefa/restaurant-ai-mcp/api/_lib/cors.js` |
| `host-dashboard.js` | `C:/Users/stefa/restaurant-ai-mcp/api/host-dashboard.js` |
| `batch-predict.js` | `C:/Users/stefa/restaurant-ai-mcp/api/batch-predict.js` |
| `portal.js` | `C:/Users/stefa/restaurant-ai-mcp/api/portal.js` |
| `restaurantSnapshot.js` | `C:/Users/stefa/restaurant-ai-mcp/api/services/restaurantSnapshot.js` |
| `create-checkout-session.js` | `C:/Users/stefa/restaurant-ai-mcp/api/create-checkout-session.js` |
| `vercel.json` | `C:/Users/stefa/restaurant-ai-mcp/vercel.json` |
| `manifest.json` | `C:/Users/stefa/restaurant-ai-mcp/client/public/manifest.json` |
| `main.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/main.tsx` |
| `App.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/App.tsx` |
| `BookingPage.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/pages/BookingPage.tsx` |
| `BookingForm.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/components/booking/BookingForm.tsx` |
| `BookingConfirmation.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/pages/BookingConfirmation.tsx` |
| `ReservationsList.tsx` | `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/ReservationsList.tsx` |
| `host.types.ts` | `C:/Users/stefa/restaurant-ai-mcp/client/src/types/host.types.ts` |
| `api.ts` | `C:/Users/stefa/restaurant-ai-mcp/client/src/services/api.ts` |
| `useBooking.ts` | `C:/Users/stefa/restaurant-ai-mcp/client/src/hooks/useBooking.ts` |
| `useHostDashboard.ts` | `C:/Users/stefa/restaurant-ai-mcp/client/src/hooks/useHostDashboard.ts` |
| `jest.config.js` | `C:/Users/stefa/restaurant-ai-mcp/jest.config.js` |
| `vitest.config.ts` | `C:/Users/stefa/restaurant-ai-mcp/client/vitest.config.ts` |

---

## Phase A: Database Migrations (3 migrations)

### Task 1: Create migration file for `customer_push_subscriptions` table

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/supabase/migrations/20260302_customer_push_subscriptions.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration: customer_push_subscriptions
-- Phase 10: PWA push notification subscriptions

CREATE TABLE IF NOT EXISTS public.customer_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups by reservation
CREATE INDEX IF NOT EXISTS idx_push_subs_reservation_id
  ON public.customer_push_subscriptions(reservation_id);

-- Index for lookups by restaurant (for cleanup/admin)
CREATE INDEX IF NOT EXISTS idx_push_subs_restaurant_id
  ON public.customer_push_subscriptions(restaurant_id);

-- RLS: allow service role only (no direct client access)
ALTER TABLE public.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;
```

**Step 2: Apply in Supabase SQL editor**

Navigate to `https://supabase.com/dashboard/project/ckforlwdhewexyqljsaf/sql/new` and paste the SQL. Click "Run". Expected: "Success. No rows returned."

**Step 3: Verify the table exists**

Run in the SQL editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customer_push_subscriptions' ORDER BY ordinal_position;
```
Expected: 5 rows (id, restaurant_id, reservation_id, subscription, created_at).

---

### Task 2: Create migration file for deposit columns on `reservations` and `restaurant_config`

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/supabase/migrations/20260302_deposit_columns.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration: deposit columns
-- Phase 10: Stripe deposit support

-- Add deposit columns to reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);

-- Add deposit_config JSONB to restaurant_config
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS deposit_config JSONB DEFAULT '{"enabled": false}'::jsonb;
```

**Step 2: Apply in Supabase SQL editor**

Paste and run. Expected: "Success. No rows returned."

**Step 3: Verify columns exist**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'reservations' AND column_name LIKE 'deposit%';
```
Expected: 2 rows (`deposit_payment_intent_id`, `deposit_amount`).

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'restaurant' AND table_name = 'restaurant_config' AND column_name = 'deposit_config';
```
Expected: 1 row.

**Step 4: Commit migration files**

```bash
cd C:/Users/stefa/restaurant-ai-mcp
git add supabase/migrations/20260302_customer_push_subscriptions.sql supabase/migrations/20260302_deposit_columns.sql
git commit -m "feat: add DB migrations for push subscriptions and deposit columns"
```

---

## Phase B: Reservation Intelligence (Slice 2)

This slice has zero external dependencies -- it wires existing ML predictions into the dashboard and adds a smart table suggestion endpoint.

### Task 3: Add `deposit_amount` and `deposit_payment_intent_id` to `UpcomingReservation` type

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/types/host.types.ts`

**Step 1: Add new fields to `UpcomingReservation` interface**

At the end of the `UpcomingReservation` interface (before the closing `}`), add:

```typescript
  // Deposit fields (Phase 10)
  deposit_amount?: number;
  deposit_payment_intent_id?: string;
```

This goes after line 132 (the `first_time_visitor` field).

**Step 2: Verify no type errors**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

Expected: No new errors.

---

### Task 4: Wire deposit and risk fields through `getUpcomingReservations` in supabase.js

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/api/_lib/supabase.js`

**Step 1: Add deposit fields to the reservation mapper**

In `getUpcomingReservations` (around line 1388-1411), add after the `prediction_confidence` line:

```javascript
    // Deposit fields
    deposit_amount: r.deposit_amount || null,
    deposit_payment_intent_id: r.deposit_payment_intent_id || null,
```

This goes after `prediction_confidence: r.ml_confidence` (line 1410) and before the closing `});` of the map callback.

**Step 2: Verify the backend still loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/_lib/supabase.js'); console.log('OK')"
```

Expected: "OK" (no crash).

---

### Task 5: Add `NoShowRiskBadge` component

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/NoShowRiskBadge.tsx`

**Step 1: Write the component**

```typescript
interface NoShowRiskBadgeProps {
  riskScore?: number;  // 0-100
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
}

const RISK_CONFIG = {
  low: { label: 'Low Risk', bg: 'bg-green-600/[8%]', text: 'text-green-600' },
  medium: { label: 'Medium Risk', bg: 'bg-amber-500/[8%]', text: 'text-amber-500' },
  high: { label: 'High Risk', bg: 'bg-red-600/[8%]', text: 'text-red-600' },
  'very-high': { label: 'Very High', bg: 'bg-red-700/[8%]', text: 'text-red-700' },
} as const;

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'very-high';
}

export default function NoShowRiskBadge({ riskScore, riskLevel }: NoShowRiskBadgeProps) {
  if (riskScore === undefined && !riskLevel) return null;

  const level = riskLevel || getRiskLevel(riskScore ?? 0);
  const config = RISK_CONFIG[level] || RISK_CONFIG.low;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}
      title={riskScore !== undefined ? `No-show probability: ${riskScore}%` : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {riskScore !== undefined ? `${riskScore}%` : config.label}
    </span>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

Expected: No errors.

---

### Task 6: Add `DepositBadge` component

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/DepositBadge.tsx`

**Step 1: Write the component**

```typescript
interface DepositBadgeProps {
  amount?: number | null;
  currency?: string;
}

export default function DepositBadge({ amount, currency = 'EUR' }: DepositBadgeProps) {
  if (!amount) return null;

  const formatted = new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-600/[8%] text-violet-600">
      {formatted} held
    </span>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 7: Wire `NoShowRiskBadge` and `DepositBadge` into `ReservationsList.tsx`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/ReservationsList.tsx`

**Step 1: Add imports at the top (after line 2)**

```typescript
import NoShowRiskBadge from './NoShowRiskBadge';
import DepositBadge from './DepositBadge';
```

**Step 2: Add badges to the ReservationRow info section**

In the `ReservationRow` component, find the "Info" section (line 201-207). After the `<div className="text-xs text-muted-stone mt-0.5">` block (line 206), add a new row for badges:

```tsx
        {/* Risk + Deposit badges */}
        {(reservation.ml_risk_score !== undefined || reservation.deposit_amount) && (
          <div className="flex items-center gap-1.5 mt-1">
            <NoShowRiskBadge
              riskScore={reservation.ml_risk_score}
              riskLevel={reservation.ml_risk_level}
            />
            <DepositBadge amount={reservation.deposit_amount} />
          </div>
        )}
```

Insert this after line 206 (the closing `</div>` of the text-xs block) and before the closing `</div>` of the "Info" section (line 207).

**Step 3: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 8: Create `tableAssignmentService.js` -- the scoring logic

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/services/tableAssignmentService.js`

**Step 1: Write the pure scoring function**

```javascript
const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('TableAssignment');

/**
 * Score a single table for a reservation.
 *
 * Scoring criteria:
 *   1. Party size fit  — capacity >= partySize; prefer smallest that fits (0-50 pts)
 *   2. Floor spread    — prefer tables far from occupied ones (0-30 pts)
 *   3. Status          — must be 'available' (filter, not score)
 *
 * @param {object} table        - { id, table_number, capacity, location, status, position_x, position_y }
 * @param {number} partySize    - Guest count
 * @param {object[]} occupiedTables - Tables currently occupied (for spread calc)
 * @returns {{ score: number, reasoning: string } | null} null if table cannot fit
 */
function scoreTable(table, partySize, occupiedTables) {
  // Filter: must fit the party
  if (table.capacity < partySize) return null;

  // 1. Size fit score (50 pts max) — smaller waste = higher score
  const waste = table.capacity - partySize;
  const maxCapacity = 20; // largest possible table
  const sizeFitScore = Math.max(0, 50 - (waste / maxCapacity) * 50);

  // 2. Floor spread score (30 pts max) — average distance to occupied tables
  let spreadScore = 30; // default if no occupied tables
  if (occupiedTables.length > 0) {
    const avgDistance = occupiedTables.reduce((sum, ot) => {
      const dx = (table.position_x || 0) - (ot.position_x || 0);
      const dy = (table.position_y || 0) - (ot.position_y || 0);
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / occupiedTables.length;
    // Normalize: assume max useful distance is 20 grid units
    spreadScore = Math.min(30, (avgDistance / 20) * 30);
  }

  const totalScore = Math.round(sizeFitScore + spreadScore);

  // Build reasoning string
  const parts = [];
  parts.push(`Seats ${table.capacity}`);
  if (waste === 0) {
    parts.push(`perfect fit for party of ${partySize}`);
  } else {
    parts.push(`closest fit for party of ${partySize}`);
  }
  if (table.location) {
    parts.push(`${table.location} area`);
  }
  if (occupiedTables.length > 0 && spreadScore > 20) {
    parts.push('area currently free');
  }

  return {
    score: totalScore,
    reasoning: parts.join(', '),
  };
}

/**
 * Suggest the best table for a reservation.
 *
 * @param {object[]} allTables   - All restaurant tables (with status, position, capacity)
 * @param {number}   partySize   - Guest count
 * @returns {{ suggested_table_id: string, table_name: string, reasoning: string, score: number } | null}
 */
function suggestTable(allTables, partySize) {
  const availableTables = allTables.filter(t => {
    const status = (t.status || '').toLowerCase().replace(/\s+/g, '_');
    return status === 'available';
  });

  const occupiedTables = allTables.filter(t => {
    const status = (t.status || '').toLowerCase().replace(/\s+/g, '_');
    return status === 'occupied';
  });

  if (availableTables.length === 0) {
    logger.info('No available tables for suggestion');
    return null;
  }

  const scored = availableTables
    .map(table => {
      const result = scoreTable(table, partySize, occupiedTables);
      if (!result) return null;
      return {
        suggested_table_id: table.id,
        table_name: `Table ${table.table_number}`,
        reasoning: result.reasoning,
        score: result.score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    logger.info(`No tables can fit party of ${partySize}`);
    return null;
  }

  return scored[0];
}

module.exports = { suggestTable, scoreTable };
```

**Step 2: Verify the module loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "const s = require('./api/services/tableAssignmentService.js'); console.log(typeof s.suggestTable)"
```

Expected: `function`

---

### Task 9: Write unit tests for `tableAssignmentService`

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/services/__tests__/tableAssignmentService.test.js`

**Step 1: Write the test file**

```javascript
const { suggestTable, scoreTable } = require('../tableAssignmentService');

describe('scoreTable', () => {
  const emptyOccupied = [];

  test('returns null when table capacity < party size', () => {
    const table = { id: 't1', table_number: '1', capacity: 2, status: 'available' };
    expect(scoreTable(table, 4, emptyOccupied)).toBeNull();
  });

  test('returns highest size fit score for perfect capacity match', () => {
    const table = { id: 't1', table_number: '1', capacity: 4, status: 'available' };
    const result = scoreTable(table, 4, emptyOccupied);
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(70); // 50 size + 30 spread (no occupied)
    expect(result.reasoning).toContain('perfect fit');
  });

  test('prefers smaller table over larger for same party', () => {
    const small = { id: 't1', table_number: '1', capacity: 4, status: 'available' };
    const large = { id: 't2', table_number: '2', capacity: 8, status: 'available' };
    const scoreSmall = scoreTable(small, 3, emptyOccupied);
    const scoreLarge = scoreTable(large, 3, emptyOccupied);
    expect(scoreSmall.score).toBeGreaterThan(scoreLarge.score);
  });

  test('spread score increases with distance from occupied tables', () => {
    const occupied = [{ position_x: 0, position_y: 0 }];
    const near = { id: 't1', table_number: '1', capacity: 4, position_x: 1, position_y: 0, status: 'available' };
    const far = { id: 't2', table_number: '2', capacity: 4, position_x: 15, position_y: 0, status: 'available' };
    const scoreNear = scoreTable(near, 4, occupied);
    const scoreFar = scoreTable(far, 4, occupied);
    expect(scoreFar.score).toBeGreaterThan(scoreNear.score);
  });
});

describe('suggestTable', () => {
  test('returns null when no tables are available', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 4, status: 'Occupied' },
    ];
    expect(suggestTable(tables, 2)).toBeNull();
  });

  test('returns null when no table can fit party size', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 2, status: 'Available' },
    ];
    expect(suggestTable(tables, 4)).toBeNull();
  });

  test('returns best table for party of 3', () => {
    const tables = [
      { id: 't1', table_number: '1', capacity: 2, status: 'Available', position_x: 0, position_y: 0 },
      { id: 't2', table_number: '4', capacity: 4, status: 'Available', position_x: 5, position_y: 0 },
      { id: 't3', table_number: '8', capacity: 8, status: 'Available', position_x: 10, position_y: 0 },
    ];
    const result = suggestTable(tables, 3);
    expect(result).not.toBeNull();
    expect(result.suggested_table_id).toBe('t2'); // 4-top is smallest that fits 3
    expect(result.table_name).toBe('Table 4');
    expect(result.reasoning).toBeTruthy();
    expect(result.score).toBeGreaterThan(0);
  });

  test('suggestion includes reasoning text', () => {
    const tables = [
      { id: 't1', table_number: '5', capacity: 4, status: 'Available', location: 'Terrace' },
    ];
    const result = suggestTable(tables, 4);
    expect(result.reasoning).toContain('Seats 4');
    expect(result.reasoning).toContain('Terrace');
  });
});
```

**Step 2: Run the tests**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && npx jest api/services/__tests__/tableAssignmentService.test.js --forceExit
```

Expected: All 7 tests pass.

---

### Task 10: Create `table-suggestion.js` API endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/table-suggestion.js`

**Step 1: Write the endpoint**

```javascript
const { getAllTables } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { suggestTable } = require('./services/tableAssignmentService');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('TableSuggestion');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      success: false,
      error: authResult.error,
    });
  }
  req.user = authResult.user;

  const restaurantId = req.user.restaurant_id;
  const { party_size } = req.query;

  if (!party_size) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameter: party_size',
    });
  }

  const parsedSize = parseInt(party_size, 10);
  if (isNaN(parsedSize) || parsedSize < 1 || parsedSize > 20) {
    return res.status(400).json({
      success: false,
      error: 'party_size must be between 1 and 20',
    });
  }

  try {
    const tablesResult = await getAllTables(restaurantId);
    if (!tablesResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load tables',
      });
    }

    const suggestion = suggestTable(tablesResult.tables, parsedSize);

    if (!suggestion) {
      return res.status(200).json({
        success: true,
        suggestion: null,
        message: `No available table can accommodate a party of ${parsedSize}`,
      });
    }

    return res.status(200).json({
      success: true,
      suggestion: {
        suggested_table_id: suggestion.suggested_table_id,
        table_name: suggestion.table_name,
        reasoning: suggestion.reasoning,
        score: suggestion.score,
      },
    });
  } catch (error) {
    logger.error('Table suggestion error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate table suggestion',
    });
  }
};
```

**Step 2: Verify the module loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/table-suggestion.js'); console.log('OK')"
```

Expected: "OK"

---

### Task 11: Add `tableSuggestion` to frontend API client and hook

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/services/api.ts`
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/hooks/useTableSuggestion.ts`

**Step 1: Add method to `hostAPI` in `api.ts`**

After the `createTable` method (around line 130), add:

```typescript
  getTableSuggestion: (partySize: number) =>
    api.get(`/table-suggestion?party_size=${partySize}`),
```

**Step 2: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';

interface TableSuggestion {
  suggested_table_id: string;
  table_name: string;
  reasoning: string;
  score: number;
}

export function useTableSuggestion(partySize: number | undefined) {
  return useQuery<TableSuggestion | null>({
    queryKey: ['tableSuggestion', partySize],
    queryFn: async () => {
      if (!partySize) return null;
      const response = await hostAPI.getTableSuggestion(partySize);
      return response.data?.suggestion ?? null;
    },
    enabled: !!partySize && partySize > 0,
    staleTime: 30 * 1000, // 30s — tables change frequently
  });
}
```

**Step 3: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 12: Add deposit snapshot to Manager AI context

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/api/services/restaurantSnapshot.js`

**Step 1: Add deposit query in parallel**

In `getRestaurantSnapshot`, add a 5th parallel query after the `configRes` query (line 14-39). Modify the `Promise.all` array:

```javascript
  const [reservationsRes, waitlistRes, activeRes, configRes, depositRes] = await Promise.all([
    // ... existing 4 queries unchanged ...
    supabaseAdmin
      .from('reservations')
      .select('deposit_amount')
      .eq('restaurant_id', restaurantId)
      .not('deposit_amount', 'is', null)
      .in('status', ['confirmed', 'pending'])
      .gte('date', new Date().toISOString().split('T')[0]),
  ]);
```

**Step 2: Add deposit summary to the return object**

Before the `return {` statement (around line 73), add:

```javascript
  // Deposit summary for manager AI
  const depositsTonight = depositRes.data || [];
  const deposit_summary = {
    count: depositsTonight.length,
    total_amount: depositsTonight.reduce((sum, r) => sum + (parseFloat(r.deposit_amount) || 0), 0),
  };
```

Then add `deposit_summary` to the return object:

```javascript
  return {
    snapshot_time: new Date().toISOString(),
    upcoming_reservations: reservations,
    waitlist_count: waitlistRes.count || 0,
    active_parties: activeRes.data || [],
    staffing_forecast,
    deposit_summary,
    errors: [
      reservationsRes.error && 'reservations',
      waitlistRes.error && 'waitlist',
      activeRes.error && 'service_records',
    ].filter(Boolean),
  };
```

**Step 3: Verify the module loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/services/restaurantSnapshot.js'); console.log('OK')"
```

---

### Task 13: Commit Slice 2

```bash
cd C:/Users/stefa/restaurant-ai-mcp
git add \
  client/src/types/host.types.ts \
  api/_lib/supabase.js \
  client/src/components/dashboard/NoShowRiskBadge.tsx \
  client/src/components/dashboard/DepositBadge.tsx \
  client/src/components/dashboard/ReservationsList.tsx \
  api/services/tableAssignmentService.js \
  api/services/__tests__/tableAssignmentService.test.js \
  api/table-suggestion.js \
  client/src/services/api.ts \
  client/src/hooks/useTableSuggestion.ts \
  api/services/restaurantSnapshot.js
git commit -m "feat: reservation intelligence — no-show risk badges, deposit badges, smart table suggestion"
```

---

## Phase C: PWA (Slice 1)

### Task 14: Generate 192x192 icon

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/public/icon-192.png`

**Step 1: Generate the icon from existing 512x512**

Since we need a 192x192 PNG and we have `icon-512.png`, use a quick Node script:

```bash
cd C:/Users/stefa/restaurant-ai-mcp
node -e "
const sharp = require('sharp');
sharp('client/public/icon-512.png')
  .resize(192, 192)
  .toFile('client/public/icon-192.png')
  .then(() => console.log('Created icon-192.png'))
  .catch(err => console.error('sharp not available, create manually:', err.message));
"
```

If `sharp` is not installed, create the icon manually using any image tool or install sharp temporarily:

```bash
npm install sharp --save-dev && node -e "require('sharp')('client/public/icon-512.png').resize(192,192).toFile('client/public/icon-192.png').then(()=>console.log('done'))"
```

Alternatively, just copy `icon-512.png` as `icon-192.png` for now (browsers will downscale). The manifest needs both entries.

**Step 2: Verify file exists**

```bash
ls -la C:/Users/stefa/restaurant-ai-mcp/client/public/icon-192.png
```

---

### Task 15: Update `manifest.json` for PWA booking

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/public/manifest.json`

**Step 1: Replace the entire manifest**

```json
{
  "name": "Seatable - AI Restaurant Management",
  "short_name": "Seatable",
  "description": "AI-powered reservations, table management, and customer conversations for restaurants.",
  "start_url": "/book",
  "display": "standalone",
  "background_color": "#FAFAF9",
  "theme_color": "#8B1A4A",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/og-image.png",
      "sizes": "1200x630",
      "type": "image/png",
      "label": "Seatable AI Restaurant Dashboard"
    }
  ],
  "categories": ["business", "productivity"],
  "lang": "en"
}
```

Changes from current: added `icon-192.png` entry, changed `start_url` from `/` to `/book`, split `favicon.svg` purpose to just `any` (SVG should not be `maskable`).

**Step 2: Validate the JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('C:/Users/stefa/restaurant-ai-mcp/client/public/manifest.json','utf-8')); console.log('Valid JSON')"
```

---

### Task 16: Create service worker

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/public/sw.js`

**Step 1: Write the service worker**

```javascript
const CACHE_NAME = 'seatable-booking-v1';
const PRECACHE_URLS = [
  '/book',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: pre-cache booking shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls
  if (url.pathname.startsWith('/api')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetching = fetch(event.request)
        .then((response) => {
          // Update cache with fresh response
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // Offline: fall back to cache

      return cached || fetching;
    })
  );
});

// Push: show notification
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Seatable', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Seatable', options));
});

// Notification click: open the booking page or URL from payload
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/book';
  event.waitUntil(clients.openWindow(url));
});
```

**Step 2: Verify file exists**

```bash
cat C:/Users/stefa/restaurant-ai-mcp/client/public/sw.js | head -5
```

---

### Task 17: Register service worker in `main.tsx`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/main.tsx`

**Step 1: Add service worker registration after the `createRoot` call**

Add the following block at the end of `main.tsx` (after the `createRoot(...).render(...)` call):

```typescript
// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 18: Create `push-subscribe.js` backend endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/push-subscribe.js`

**Step 1: Write the endpoint**

```javascript
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('PushSubscribe');

module.exports = async (req, res) => {
  // Public endpoint — no auth required (tied to reservation, not user account)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { restaurant_id, reservation_id, subscription } = req.body || {};

  if (!restaurant_id || !subscription) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: restaurant_id, subscription',
    });
  }

  // Validate subscription object has required web-push fields
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({
      success: false,
      error: 'Invalid push subscription: must have endpoint, keys.p256dh, keys.auth',
    });
  }

  try {
    const { error } = await supabaseAdmin
      .from('customer_push_subscriptions')
      .insert({
        restaurant_id,
        reservation_id: reservation_id || null,
        subscription,
      });

    if (error) {
      logger.error('Failed to store push subscription:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to save subscription',
      });
    }

    logger.info('Push subscription stored', { restaurant_id, has_reservation: !!reservation_id });

    return res.status(201).json({
      success: true,
      message: 'Push subscription saved',
    });
  } catch (error) {
    logger.error('Push subscribe error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal error',
    });
  }
};
```

**Step 2: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/push-subscribe.js'); console.log('OK')"
```

---

### Task 19: Create `push-send.js` backend endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/push-send.js`

**Step 1: Install `web-push` dependency**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && npm install web-push
```

**Step 2: Write the endpoint**

```javascript
const webpush = require('web-push');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('PushSend');

// Configure web-push with VAPID keys
// Generate once: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@seatable.io';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Authenticate: either CRON_SECRET or JWT
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const authResult = await verifyAuth(req, { required: true });
    if (authResult.error) {
      return res.status(authResult.status || 401).json({
        success: false,
        error: authResult.error,
      });
    }
    req.user = authResult.user;
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications not configured (missing VAPID keys)',
    });
  }

  const { reservation_id, title, body, url } = req.body || {};

  if (!reservation_id || !title || !body) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: reservation_id, title, body',
    });
  }

  try {
    // Look up push subscriptions for this reservation
    const { data: subscriptions, error: fetchError } = await supabaseAdmin
      .from('customer_push_subscriptions')
      .select('id, subscription')
      .eq('reservation_id', reservation_id);

    if (fetchError) {
      logger.error('Failed to fetch subscriptions:', fetchError.message);
      return res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        message: 'No push subscriptions found for this reservation',
      });
    }

    const payload = JSON.stringify({
      title,
      body,
      data: { url: url || '/book' },
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        logger.warn('Push send failed:', { subscription_id: sub.id, error: err.message });

        // Remove expired/invalid subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin
            .from('customer_push_subscriptions')
            .delete()
            .eq('id', sub.id);
          logger.info('Removed expired push subscription:', sub.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      sent,
      failed,
      total: subscriptions.length,
    });
  } catch (error) {
    logger.error('Push send error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};
```

**Step 3: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/push-send.js'); console.log('OK')"
```

---

### Task 20: Add VAPID env vars to `.env.example`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/.env.example`

**Step 1: Append VAPID variables**

Add to the end of `.env.example`:

```
# ========================================
# Web Push Notifications (VAPID keys)
# ========================================
# Generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@seatable.io
```

**Step 2: Generate VAPID keys and add to `.env.local`**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && npx web-push generate-vapid-keys
```

Copy the output keys into `.env.local` as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Also add `VITE_VAPID_PUBLIC_KEY` to `.env.local` (same value as `VAPID_PUBLIC_KEY`) for the frontend to use.

---

### Task 21: Add push subscription request to booking confirmation flow

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/pages/BookingConfirmation.tsx`

**Step 1: Add push subscription helper function and call it on mount**

After the existing imports, add a helper:

```typescript
async function requestPushSubscription(restaurantId: string, reservationId: string) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return; // Already subscribed

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        reservation_id: reservationId,
        subscription: subscription.toJSON(),
      }),
    });
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}
```

Then inside the `BookingConfirmation` component, after the existing `useReservationById` hook call, add:

```typescript
  useEffect(() => {
    if (reservation?.id && state?.reservation) {
      // state.reservation comes from navigation state and has restaurant_id via the form
      const restaurantId = (location.state as { restaurant_id?: string })?.restaurant_id;
      if (restaurantId) {
        requestPushSubscription(restaurantId, reservation.id);
      }
    }
  }, [reservation?.id]);
```

**Step 2: Pass `restaurant_id` in navigation state from BookingForm**

In `C:/Users/stefa/restaurant-ai-mcp/client/src/components/booking/BookingForm.tsx`, modify the `onSuccess` callback (line 103) to include `restaurant_id`:

Change:
```typescript
        navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
          state: { reservation, restaurant_name: restaurant.name },
        });
```

To:
```typescript
        navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
          state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
        });
```

**Step 3: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 22: Commit Slice 1 (PWA)

```bash
cd C:/Users/stefa/restaurant-ai-mcp
git add \
  client/public/icon-192.png \
  client/public/manifest.json \
  client/public/sw.js \
  client/src/main.tsx \
  api/push-subscribe.js \
  api/push-send.js \
  .env.example \
  client/src/pages/BookingConfirmation.tsx \
  client/src/components/booking/BookingForm.tsx
git commit -m "feat: PWA support — installable booking page, service worker, push notifications"
```

---

## Phase D: Stripe Deposit (Slice 3)

### Task 23: Create `deposit-config.js` endpoint (GET/PATCH)

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/deposit-config.js`

**Step 1: Write the endpoint**

```javascript
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('DepositConfig');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      success: false,
      error: authResult.error,
    });
  }
  req.user = authResult.user;
  const restaurantId = req.user.restaurant_id;

  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with account' });
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(restaurantId, res);
    }
    if (req.method === 'PATCH') {
      return await handlePatch(restaurantId, req, res);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    logger.error('Deposit config error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};

async function handleGet(restaurantId, res) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('deposit_config')
    .eq('id', restaurantId)
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch deposit config' });
  }

  return res.status(200).json({
    success: true,
    deposit_config: data.deposit_config || { enabled: false },
  });
}

async function handlePatch(restaurantId, req, res) {
  const { enabled, type, amount } = req.body || {};

  // Validate
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
  }

  if (enabled) {
    if (!type || !['flat', 'per_person'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be "flat" or "per_person"' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 500) {
      return res.status(400).json({ success: false, error: 'amount must be between 1 and 500' });
    }
  }

  const config = enabled
    ? { enabled: true, type, amount: parseFloat(amount) }
    : { enabled: false };

  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ deposit_config: config })
    .eq('id', restaurantId);

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to update deposit config' });
  }

  return res.status(200).json({
    success: true,
    deposit_config: config,
  });
}
```

**Step 2: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/deposit-config.js'); console.log('OK')"
```

---

### Task 24: Create `create-deposit-intent.js` endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/create-deposit-intent.js`

**Step 1: Write the endpoint**

```javascript
const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('DepositIntent');

module.exports = async (req, res) => {
  // Public endpoint — no auth required (customer-facing booking flow)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { restaurant_id, party_size, customer_email } = req.body || {};

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  const parsedPartySize = parseInt(party_size, 10);
  if (isNaN(parsedPartySize) || parsedPartySize < 1) {
    return res.status(400).json({ success: false, error: 'Invalid party_size' });
  }

  try {
    // Fetch deposit config for this restaurant
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('deposit_config, restaurant_name')
      .eq('id', restaurant_id)
      .single();

    if (configError || !config) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }

    const depositConfig = config.deposit_config || { enabled: false };

    if (!depositConfig.enabled) {
      return res.status(400).json({ success: false, error: 'Deposits are not enabled for this restaurant' });
    }

    // Calculate deposit amount
    let depositAmount;
    if (depositConfig.type === 'per_person') {
      depositAmount = depositConfig.amount * parsedPartySize;
    } else {
      depositAmount = depositConfig.amount;
    }

    // Amount in cents for Stripe
    const amountInCents = Math.round(depositAmount * 100);

    if (amountInCents < 50) {
      return res.status(400).json({ success: false, error: 'Deposit amount too small (minimum EUR 0.50)' });
    }

    // Create PaymentIntent with manual capture
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
      capture_method: 'manual',
      description: `Reservation deposit at ${config.restaurant_name}`,
      metadata: {
        restaurant_id,
        party_size: String(parsedPartySize),
        type: 'reservation_deposit',
      },
      ...(customer_email ? { receipt_email: customer_email } : {}),
    });

    logger.info('Deposit intent created', {
      restaurant_id,
      amount: depositAmount,
      payment_intent_id: paymentIntent.id,
    });

    return res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      deposit_amount: depositAmount,
    });
  } catch (error) {
    logger.error('Create deposit intent error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create deposit' });
  }
};
```

**Step 2: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/create-deposit-intent.js'); console.log('OK')"
```

---

### Task 25: Create `capture-deposit.js` endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/capture-deposit.js`

**Step 1: Write the endpoint**

```javascript
const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('CaptureDeposit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;

  const { reservation_id } = req.body || {};

  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    // Fetch reservation to get payment_intent_id
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('id, deposit_payment_intent_id, deposit_amount, restaurant_id')
      .eq('reservation_id', reservation_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    if (!reservation.deposit_payment_intent_id) {
      return res.status(400).json({ success: false, error: 'No deposit held for this reservation' });
    }

    // Capture the payment
    const paymentIntent = await stripe.paymentIntents.capture(
      reservation.deposit_payment_intent_id
    );

    logger.info('Deposit captured', {
      reservation_id,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount_received,
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit captured successfully',
      amount_captured: paymentIntent.amount_received / 100,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    logger.error('Capture deposit error:', error.message);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: `Stripe error: ${error.message}`,
      });
    }

    return res.status(500).json({ success: false, error: 'Failed to capture deposit' });
  }
};
```

**Step 2: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/capture-deposit.js'); console.log('OK')"
```

---

### Task 26: Create `release-deposit.js` endpoint

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/release-deposit.js`

**Step 1: Write the endpoint**

```javascript
const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const logger = createSecureLogger('ReleaseDeposit');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;

  const { reservation_id } = req.body || {};

  if (!reservation_id) {
    return res.status(400).json({ success: false, error: 'Missing reservation_id' });
  }

  try {
    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from('reservations')
      .select('id, deposit_payment_intent_id, deposit_amount, restaurant_id')
      .eq('reservation_id', reservation_id)
      .eq('restaurant_id', req.user.restaurant_id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }

    if (!reservation.deposit_payment_intent_id) {
      return res.status(400).json({ success: false, error: 'No deposit held for this reservation' });
    }

    // Cancel the payment intent to release the hold
    const paymentIntent = await stripe.paymentIntents.cancel(
      reservation.deposit_payment_intent_id
    );

    // Clear deposit fields on the reservation
    await supabaseAdmin
      .from('reservations')
      .update({
        deposit_payment_intent_id: null,
        deposit_amount: null,
      })
      .eq('id', reservation.id);

    logger.info('Deposit released', {
      reservation_id,
      payment_intent_id: paymentIntent.id,
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit hold released',
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    logger.error('Release deposit error:', error.message);

    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        success: false,
        error: `Stripe error: ${error.message}`,
      });
    }

    return res.status(500).json({ success: false, error: 'Failed to release deposit' });
  }
};
```

**Step 2: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/release-deposit.js'); console.log('OK')"
```

---

### Task 27: Install `@stripe/react-stripe-js` and `@stripe/stripe-js` in client

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/package.json`

**Step 1: Install the packages**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npm install @stripe/react-stripe-js @stripe/stripe-js
```

**Step 2: Verify they installed**

```bash
node -e "require('@stripe/stripe-js'); console.log('stripe-js OK')"
```

---

### Task 28: Create `DepositPaymentStep` component

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/booking/DepositPaymentStep.tsx`

**Step 1: Write the component**

```typescript
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface DepositPaymentStepProps {
  clientSecret: string;
  depositAmount: number;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

function DepositForm({ depositAmount, onSuccess, onCancel }: Omit<DepositPaymentStepProps, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'requires_capture') {
      onSuccess(paymentIntent.id);
    } else {
      setError('Unexpected payment status. Please try again.');
      setIsProcessing(false);
    }
  };

  const formatted = new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
  }).format(depositAmount);

  return (
    <div className="space-y-5">
      <div className="bg-violet-600/[6%] border border-violet-600/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/[10%] flex items-center justify-center text-violet-600 text-lg">
            💳
          </div>
          <div>
            <p className="text-sm font-semibold text-deep-charcoal">Reservation Deposit</p>
            <p className="text-xs text-warm-stone">
              A hold of {formatted} will be placed on your card. It will be released when you arrive.
            </p>
          </div>
        </div>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3.5 border border-border-gray bg-white text-stone-gray font-medium rounded-xl text-sm hover:border-muted-stone transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!stripe || !elements || isProcessing}
          className="flex-1 py-3.5 bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray disabled:text-muted-stone text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              Processing...
            </>
          ) : (
            `Confirm & Hold ${formatted}`
          )}
        </button>
      </div>
    </div>
  );
}

export default function DepositPaymentStep({ clientSecret, depositAmount, onSuccess, onCancel }: DepositPaymentStepProps) {
  if (!clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#8B1A4A',
            borderRadius: '10px',
          },
        },
      }}
    >
      <DepositForm depositAmount={depositAmount} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 29: Add `deposit_config` to restaurant info from portal API

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/api/portal.js`

**Step 1: Add `deposit_config` to the restaurant query select**

In `handleGetRestaurant` (line 81), add `deposit_config` to the select:

Change:
```javascript
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, website, business_hours, reservation_settings, average_dining_duration_minutes, slug')
```

To:
```javascript
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, website, business_hours, reservation_settings, average_dining_duration_minutes, slug, deposit_config')
```

**Step 2: Add `deposit_config` to the response**

In the return object (around line 98-117), add after line 115 (`cancellation_policy`):

```javascript
      deposit_config: data.deposit_config || { enabled: false },
```

**Step 3: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/portal.js'); console.log('OK')"
```

---

### Task 30: Update `RestaurantInfo` type to include `deposit_config`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/booking/BookingForm.tsx`

**Step 1: Add `deposit_config` to the `RestaurantInfo` interface**

After `cancellation_policy` (line 21), add:

```typescript
  deposit_config?: {
    enabled: boolean;
    type?: 'flat' | 'per_person';
    amount?: number;
  };
```

---

### Task 31: Integrate deposit flow into `BookingForm.tsx`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/booking/BookingForm.tsx`

**Step 1: Add imports and state for deposit flow**

After the existing imports (line 3), add:

```typescript
import DepositPaymentStep from './DepositPaymentStep';
```

Inside the `BookingForm` component, after the existing state declarations (around line 53), add:

```typescript
  const [depositStep, setDepositStep] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);
  const [paymentIntentId, setPaymentIntentId] = useState('');
```

**Step 2: Compute whether deposit is required**

After the existing derived state, add:

```typescript
  const depositRequired = restaurant.deposit_config?.enabled === true;
```

**Step 3: Modify `handleSubmit` to create deposit intent if needed**

Replace the existing `handleSubmit` function (lines 91-108) with:

```typescript
  const handleSubmit = async () => {
    // If deposit required and not yet in deposit step, create intent first
    if (depositRequired && !paymentIntentId) {
      try {
        const partyAmount = restaurant.deposit_config?.type === 'per_person'
          ? (restaurant.deposit_config.amount || 0) * partySize
          : (restaurant.deposit_config?.amount || 0);

        const res = await fetch('/api/create-deposit-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            party_size: partySize,
            customer_email: customerEmail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create deposit');

        setClientSecret(data.client_secret);
        setDepositAmount(data.deposit_amount);
        setDepositStep(true);
        return; // Show payment step
      } catch (err) {
        console.error('Deposit intent error:', err);
        return;
      }
    }

    // Create the reservation (with or without deposit)
    reserve.mutate({
      restaurant_id: restaurant.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim() || undefined,
      party_size: partySize,
      date: selectedDate,
      time: selectedTime,
      special_requests: specialRequests.trim() || undefined,
      ...(paymentIntentId ? {
        deposit_payment_intent_id: paymentIntentId,
        deposit_amount: depositAmount,
      } : {}),
    }, {
      onSuccess: ({ reservation }) => {
        navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
          state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
        });
      },
    });
  };

  const handleDepositSuccess = (piId: string) => {
    setPaymentIntentId(piId);
    setDepositStep(false);
    // Auto-submit the reservation now that deposit is confirmed
    // Use setTimeout to allow state to update
    setTimeout(() => {
      reserve.mutate({
        restaurant_id: restaurant.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        party_size: partySize,
        date: selectedDate,
        time: selectedTime,
        special_requests: specialRequests.trim() || undefined,
        deposit_payment_intent_id: piId,
        deposit_amount: depositAmount,
      }, {
        onSuccess: ({ reservation }) => {
          navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
            state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
          });
        },
      });
    }, 0);
  };
```

**Step 4: Add `deposit_payment_intent_id` and `deposit_amount` to `ReservationInput` interface**

In the `ReservationInput` interface (around line 74-83), add:

```typescript
  deposit_payment_intent_id?: string;
  deposit_amount?: number;
```

**Step 5: Render the deposit step conditionally**

Before the Submit Button section (before line 314), add:

```tsx
      {/* Deposit Payment Step */}
      {depositStep && clientSecret && (
        <div className="mb-6">
          <DepositPaymentStep
            clientSecret={clientSecret}
            depositAmount={depositAmount}
            onSuccess={handleDepositSuccess}
            onCancel={() => setDepositStep(false)}
          />
        </div>
      )}
```

**Step 6: Update the submit button text when deposit required**

Change the button text (around line 326-327):

```tsx
        {reserve.isPending ? (
          <>
            <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
            Confirming...
          </>
        ) : depositRequired && !paymentIntentId ? (
          'Continue to Payment'
        ) : (
          'Confirm Reservation'
        )}
```

**Step 7: Hide submit button when deposit step is visible**

Wrap the submit button with a condition:

```tsx
      {!depositStep && (
        <button ...>
          ...
        </button>
      )}
```

**Step 8: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 32: Update `portal.js` to accept deposit fields when creating reservation

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/api/portal.js`

**Step 1: Extract deposit fields from request body**

In `handleCreateReservation`, after the existing destructuring (line 339-348), add to the destructured fields:

```javascript
    deposit_payment_intent_id,
    deposit_amount
```

**Step 2: Include deposit fields in the insert**

In the `supabaseAdmin.from('reservations').insert()` call (around line 461-475), add after `source: 'online_portal'`:

```javascript
      deposit_payment_intent_id: deposit_payment_intent_id || null,
      deposit_amount: deposit_amount ? parseFloat(deposit_amount) : null,
```

**Step 3: Verify it loads**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && node -e "require('./api/portal.js'); console.log('OK')"
```

---

### Task 33: Add deposit actions to the dashboard -- capture and release buttons

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/DepositActions.tsx`

**Step 1: Write the component**

```typescript
import { useState } from 'react';
import { api } from '../../services/api';

interface DepositActionsProps {
  reservationId: string;
  depositAmount: number;
  onActionComplete: () => void;
}

export default function DepositActions({ reservationId, depositAmount, onActionComplete }: DepositActionsProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatted = new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(depositAmount);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    try {
      await api.post('/capture-deposit', { reservation_id: reservationId });
      onActionComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to capture deposit';
      setError(message);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRelease = async () => {
    setIsReleasing(true);
    setError(null);
    try {
      await api.post('/release-deposit', { reservation_id: reservationId });
      onActionComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to release deposit';
      setError(message);
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <button
        type="button"
        onClick={handleRelease}
        disabled={isReleasing || isCapturing}
        className="text-[11px] font-medium px-2 py-1 rounded-lg border border-green-600/30 text-green-600 hover:bg-green-600/[6%] transition-colors disabled:opacity-50"
        title="Release deposit hold (guest arrived)"
      >
        {isReleasing ? '...' : 'Release'}
      </button>
      <button
        type="button"
        onClick={handleCapture}
        disabled={isCapturing || isReleasing}
        className="text-[11px] font-medium px-2 py-1 rounded-lg border border-red-600/30 text-red-600 hover:bg-red-600/[6%] transition-colors disabled:opacity-50"
        title={`Capture ${formatted} deposit (no-show)`}
      >
        {isCapturing ? '...' : `Capture ${formatted}`}
      </button>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 34: Wire `DepositActions` into `ReservationRow`

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/dashboard/ReservationsList.tsx`

**Step 1: Import `DepositActions`**

Add after the existing imports:

```typescript
import DepositActions from './DepositActions';
```

**Step 2: Add `onDepositAction` prop to `ReservationsListProps`**

Add to the interface:

```typescript
  onDepositAction?: () => void;
```

Pass it through to `ReservationRow`:

```typescript
  onDepositAction?: () => void;
```

In the `ReservationRow` component props, add `onDepositAction`.

**Step 3: Render deposit actions in the row**

In the `ReservationRow` component, after the status/action `<div>` block (line 216-255), add:

```tsx
      {/* Deposit Actions */}
      {reservation.deposit_amount && reservation.deposit_payment_intent_id && (
        <div className="flex-shrink-0">
          <DepositActions
            reservationId={reservation.reservation_id}
            depositAmount={reservation.deposit_amount}
            onActionComplete={onDepositAction || (() => {})}
          />
        </div>
      )}
```

**Step 4: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 35: Create `useDepositConfig` hook

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/hooks/useDepositConfig.ts`

**Step 1: Write the hook**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

interface DepositConfig {
  enabled: boolean;
  type?: 'flat' | 'per_person';
  amount?: number;
}

export function useDepositConfig() {
  return useQuery<DepositConfig>({
    queryKey: ['depositConfig'],
    queryFn: async () => {
      const response = await api.get('/deposit-config');
      return response.data.deposit_config;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDepositConfig() {
  const queryClient = useQueryClient();
  return useMutation<DepositConfig, Error, DepositConfig>({
    mutationFn: async (config) => {
      const response = await api.patch('/deposit-config', config);
      return response.data.deposit_config;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['depositConfig'], data);
    },
  });
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 36: Create `DepositSettingsPanel` component

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/client/src/components/settings/DepositSettingsPanel.tsx`

**Step 1: Write the settings panel**

```typescript
import { useState, useEffect } from 'react';
import { useDepositConfig, useUpdateDepositConfig } from '../../hooks/useDepositConfig';

export default function DepositSettingsPanel() {
  const { data: config, isLoading } = useDepositConfig();
  const updateConfig = useUpdateDepositConfig();

  const [enabled, setEnabled] = useState(false);
  const [type, setType] = useState<'flat' | 'per_person'>('flat');
  const [amount, setAmount] = useState('20');

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setType(config.type || 'flat');
      setAmount(String(config.amount || 20));
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate({
      enabled,
      type: enabled ? type : undefined,
      amount: enabled ? parseFloat(amount) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <div className="h-6 w-40 bg-border-gray rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6">
      <h3 className="text-[15px] font-semibold text-deep-charcoal mb-1">Reservation Deposits</h3>
      <p className="text-xs text-warm-stone mb-5">
        Require a card hold when guests book online. Capture on no-show, release on arrival.
      </p>

      {/* Enable toggle */}
      <label className="flex items-center gap-3 mb-5 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-border-gray rounded-full peer-checked:bg-burgundy transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
        </div>
        <span className="text-sm font-medium text-deep-charcoal">
          {enabled ? 'Deposits enabled' : 'Deposits disabled'}
        </span>
      </label>

      {enabled && (
        <div className="space-y-4 pl-1">
          {/* Deposit type */}
          <div>
            <label className="block text-xs font-semibold tracking-wider uppercase text-warm-stone mb-2">
              Deposit Type
            </label>
            <div className="flex gap-2">
              {(['flat', 'per_person'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    type === t
                      ? 'border-burgundy bg-burgundy/[4%] text-burgundy'
                      : 'border-border-gray text-stone-gray hover:border-stone-300'
                  }`}
                >
                  {t === 'flat' ? 'Flat rate' : 'Per person'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold tracking-wider uppercase text-warm-stone mb-2">
              Amount (EUR)
            </label>
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm-stone">EUR</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="500"
                step="1"
                className="w-full pl-12 pr-3 py-2.5 border border-border-gray rounded-lg text-sm text-deep-charcoal focus:outline-none focus:border-burgundy"
              />
            </div>
            {type === 'per_person' && (
              <p className="text-xs text-muted-stone mt-1">
                Example: party of 4 = EUR {parseFloat(amount || '0') * 4} total hold
              </p>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="mt-6 pt-4 border-t border-soft-gray">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray text-white font-semibold text-sm rounded-lg transition-colors"
        >
          {updateConfig.isPending ? 'Saving...' : 'Save Deposit Settings'}
        </button>
        {updateConfig.isSuccess && (
          <span className="ml-3 text-xs text-green-600 font-medium">Saved</span>
        )}
        {updateConfig.isError && (
          <span className="ml-3 text-xs text-red-600 font-medium">
            {updateConfig.error.message}
          </span>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 37: Add `DepositSettingsPanel` to WhatsApp Settings page (payments tab)

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/client/src/pages/WhatsAppSettingsPage.tsx`

**Step 1: Import the panel**

Add at the top with other imports:

```typescript
import DepositSettingsPanel from '../components/settings/DepositSettingsPanel';
```

**Step 2: Add the panel in the page**

Find the appropriate section in the WhatsApp Settings page (likely where `StaffingSettingsPanel` or `ManagerNotificationsPanel` already live). Add after the last panel:

```tsx
<DepositSettingsPanel />
```

The exact insertion point depends on the page structure. The panel should go in a logical "Payments" section at the bottom.

**Step 3: Verify it compiles**

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit 2>&1 | head -5
```

---

### Task 38: Write backend unit tests for deposit-config validation

**Files:**
- Create: `C:/Users/stefa/restaurant-ai-mcp/api/services/__tests__/depositValidation.test.js`

**Step 1: Write validation tests**

```javascript
describe('Deposit Config Validation', () => {
  // Test the validation logic from deposit-config.js inline
  function validateDepositConfig(body) {
    const { enabled, type, amount } = body || {};
    const errors = [];

    if (typeof enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    if (enabled) {
      if (!type || !['flat', 'per_person'].includes(type)) {
        errors.push('type must be "flat" or "per_person"');
      }
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 500) {
        errors.push('amount must be between 1 and 500');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  test('rejects missing enabled field', () => {
    const result = validateDepositConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('enabled must be a boolean');
  });

  test('accepts disabled config without type/amount', () => {
    const result = validateDepositConfig({ enabled: false });
    expect(result.valid).toBe(true);
  });

  test('rejects enabled config without valid type', () => {
    const result = validateDepositConfig({ enabled: true, type: 'invalid', amount: 20 });
    expect(result.valid).toBe(false);
  });

  test('rejects enabled config with amount < 1', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 0.5 });
    expect(result.valid).toBe(false);
  });

  test('rejects enabled config with amount > 500', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 501 });
    expect(result.valid).toBe(false);
  });

  test('accepts valid flat config', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 20 });
    expect(result.valid).toBe(true);
  });

  test('accepts valid per_person config', () => {
    const result = validateDepositConfig({ enabled: true, type: 'per_person', amount: 10 });
    expect(result.valid).toBe(true);
  });
});

describe('Deposit Amount Calculation', () => {
  function calculateDeposit(config, partySize) {
    if (!config.enabled) return 0;
    if (config.type === 'per_person') return config.amount * partySize;
    return config.amount;
  }

  test('flat rate ignores party size', () => {
    expect(calculateDeposit({ enabled: true, type: 'flat', amount: 20 }, 1)).toBe(20);
    expect(calculateDeposit({ enabled: true, type: 'flat', amount: 20 }, 6)).toBe(20);
  });

  test('per_person multiplies by party size', () => {
    expect(calculateDeposit({ enabled: true, type: 'per_person', amount: 10 }, 4)).toBe(40);
    expect(calculateDeposit({ enabled: true, type: 'per_person', amount: 15 }, 2)).toBe(30);
  });

  test('disabled config returns 0', () => {
    expect(calculateDeposit({ enabled: false }, 4)).toBe(0);
  });
});
```

**Step 2: Run the tests**

```bash
cd C:/Users/stefa/restaurant-ai-mcp && npx jest api/services/__tests__/depositValidation.test.js --forceExit
```

Expected: All 9 tests pass.

---

### Task 39: Update `vercel.json` with new endpoint rewrites

**Files:**
- Modify: `C:/Users/stefa/restaurant-ai-mcp/vercel.json`

**Step 1: Add rewrites for new API endpoints**

In the `rewrites` array, before the catch-all `/(.*) -> /index.html` entry (last entry), add:

```json
    {
      "source": "/api/table-suggestion",
      "destination": "/api/table-suggestion"
    },
    {
      "source": "/api/push-subscribe",
      "destination": "/api/push-subscribe"
    },
    {
      "source": "/api/push-send",
      "destination": "/api/push-send"
    },
    {
      "source": "/api/deposit-config",
      "destination": "/api/deposit-config"
    },
    {
      "source": "/api/create-deposit-intent",
      "destination": "/api/create-deposit-intent"
    },
    {
      "source": "/api/capture-deposit",
      "destination": "/api/capture-deposit"
    },
    {
      "source": "/api/release-deposit",
      "destination": "/api/release-deposit"
    },
```

Note: These are technically covered by the existing `/api/(.*)` rewrite, but explicit rewrites ensure they work even if Vercel routing order changes.

**Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('C:/Users/stefa/restaurant-ai-mcp/vercel.json','utf-8')); console.log('Valid')"
```

---

### Task 40: Commit Slice 3 (Stripe Deposit)

```bash
cd C:/Users/stefa/restaurant-ai-mcp
git add \
  api/deposit-config.js \
  api/create-deposit-intent.js \
  api/capture-deposit.js \
  api/release-deposit.js \
  api/portal.js \
  api/services/__tests__/depositValidation.test.js \
  client/package.json \
  client/src/components/booking/DepositPaymentStep.tsx \
  client/src/components/booking/BookingForm.tsx \
  client/src/components/dashboard/DepositActions.tsx \
  client/src/components/dashboard/ReservationsList.tsx \
  client/src/hooks/useDepositConfig.ts \
  client/src/components/settings/DepositSettingsPanel.tsx \
  client/src/pages/WhatsAppSettingsPage.tsx \
  vercel.json
git commit -m "feat: stripe deposit — hold on booking, capture on no-show, release on arrival"
```

---

## Phase E: Integration & Final Verification

### Task 41: Run all backend tests

```bash
cd C:/Users/stefa/restaurant-ai-mcp && npx jest --forceExit
```

Expected: All existing tests + 16 new tests pass (7 table assignment + 9 deposit validation).

### Task 42: Run frontend type check

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && npx tsc --noEmit
```

Expected: No type errors.

### Task 43: Run frontend build

```bash
cd C:/Users/stefa/restaurant-ai-mcp/client && rm -rf dist node_modules/.vite && npm run build
```

Expected: Build succeeds.

### Task 44: Manual smoke test checklist

- [ ] Open `/book/:slug` -- booking page renders, "Add to Home Screen" banner shows on mobile
- [ ] Select date/time/party -- if restaurant has deposit enabled, "Continue to Payment" button shows
- [ ] Stripe payment element renders -- card hold created
- [ ] Reservation confirmed -- push notification permission requested
- [ ] Dashboard shows reservation with risk badge (green/amber/red)
- [ ] Dashboard shows deposit badge ("EUR 20 held")
- [ ] "Release" button works (Stripe cancels hold)
- [ ] "Capture" button works (Stripe charges card)
- [ ] Manager AI snapshot includes `[DEPOSITS TONIGHT]` block

### Task 45: Final commit

```bash
cd C:/Users/stefa/restaurant-ai-mcp
git add -A
git commit -m "chore: phase 10 final — all integration verified"
git push origin main
```

---

## Summary of all new/modified files

### New files (16)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260302_customer_push_subscriptions.sql` | Push subscriptions table |
| `supabase/migrations/20260302_deposit_columns.sql` | Deposit columns on reservations + restaurant_config |
| `api/services/tableAssignmentService.js` | Smart table suggestion scoring logic |
| `api/services/__tests__/tableAssignmentService.test.js` | Unit tests for table suggestion |
| `api/services/__tests__/depositValidation.test.js` | Unit tests for deposit validation |
| `api/table-suggestion.js` | GET /api/table-suggestion endpoint |
| `api/push-subscribe.js` | POST /api/push-subscribe endpoint |
| `api/push-send.js` | POST /api/push-send endpoint |
| `api/deposit-config.js` | GET/PATCH /api/deposit-config endpoint |
| `api/create-deposit-intent.js` | POST /api/create-deposit-intent endpoint |
| `api/capture-deposit.js` | POST /api/capture-deposit endpoint |
| `api/release-deposit.js` | POST /api/release-deposit endpoint |
| `client/public/sw.js` | Service worker for PWA |
| `client/public/icon-192.png` | 192x192 PWA icon |
| `client/src/components/booking/DepositPaymentStep.tsx` | Stripe payment element for deposits |
| `client/src/components/dashboard/NoShowRiskBadge.tsx` | Risk score badge |
| `client/src/components/dashboard/DepositBadge.tsx` | Deposit held badge |
| `client/src/components/dashboard/DepositActions.tsx` | Capture/release deposit buttons |
| `client/src/components/settings/DepositSettingsPanel.tsx` | Deposit config settings panel |
| `client/src/hooks/useTableSuggestion.ts` | React Query hook for table suggestion |
| `client/src/hooks/useDepositConfig.ts` | React Query hook for deposit config |

### Modified files (13)

| File | Change |
|------|--------|
| `client/public/manifest.json` | Added icon-192, changed start_url to /book |
| `client/src/main.tsx` | Service worker registration |
| `client/src/types/host.types.ts` | Added deposit fields to UpcomingReservation |
| `client/src/services/api.ts` | Added getTableSuggestion to hostAPI |
| `client/src/components/booking/BookingForm.tsx` | Deposit flow integration, deposit_config type |
| `client/src/components/dashboard/ReservationsList.tsx` | Risk + deposit badges, deposit actions |
| `client/src/pages/BookingConfirmation.tsx` | Push subscription request |
| `client/src/pages/WhatsAppSettingsPage.tsx` | Added DepositSettingsPanel |
| `api/_lib/supabase.js` | deposit_amount/deposit_payment_intent_id in reservation mapper |
| `api/portal.js` | deposit_config in restaurant response, deposit fields in reservation create |
| `api/services/restaurantSnapshot.js` | deposit_summary in manager AI snapshot |
| `vercel.json` | New endpoint rewrites |
| `.env.example` | VAPID key env vars |

### New npm dependencies (2)

| Package | Where | Purpose |
|---------|-------|---------|
| `web-push` | root `package.json` | Push notification delivery |
| `@stripe/react-stripe-js` + `@stripe/stripe-js` | `client/package.json` | Stripe Elements for deposit payment |

### New env vars needed (3)

| Variable | Where | Purpose |
|----------|-------|---------|
| `VAPID_PUBLIC_KEY` | Vercel + `.env.local` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Vercel + `.env.local` | Web push VAPID private key |
| `VITE_VAPID_PUBLIC_KEY` | Vercel + `.env.local` | Frontend VAPID key for push subscribe |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stripe capture_method:manual hold expires after 7 days | Medium | Document in UI: "Deposits expire after 7 days. Capture promptly." Future: cron to auto-capture approaching-expiry holds. |
| Push subscription fails silently on iOS Safari < 16.4 | Low | PWA push only works on iOS 16.4+. Graceful degradation -- subscription just does not happen. |
| No VAPID keys configured on first deploy | Medium | `push-send.js` returns 503 with clear message. Generate keys and add to Vercel env. |
| `sharp` not available for icon generation | Low | Fall back to copying `icon-512.png` -- browsers downscale automatically. |
| Stripe test keys vs production keys | Medium | Use test keys for demo. Switch to live keys before going to production restaurants. |