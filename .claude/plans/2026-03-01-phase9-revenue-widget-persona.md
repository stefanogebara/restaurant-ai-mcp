# Phase 9: Revenue Forecasting + Embeddable Widget + Voice Persona Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add revenue tracking + 7-day forecast, a copy-paste iframe booking widget, and voice agent name/greeting config.

**Architecture:** Three independent vertical slices — no shared infrastructure. Revenue: `total_bill` on `service_records` → `avg_spend_per_cover` stat → `RevenueStatsWidget`. Widget: static `widget.js` + `?embed=true` on BookingPage + `EmbedSnippetPanel`. Persona: two columns on `restaurant_config` → read by `persona-prompt-builder.js` → `VoicePersonaPanel` in Voice Settings.

**Tech Stack:** Node.js/Express serverless (backend), React 18 + React Query v5 + Tailwind (frontend), Supabase PostgreSQL, Jest (backend tests), Vitest + RTL (frontend tests).

---

## Task 1: DB Migration — total_bill on service_records

**Files:**
- Create: `supabase/migrations/20260301_service_records_total_bill.sql`

**Step 1: Write the migration SQL**

```sql
ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS total_bill NUMERIC(10,2);
```

**Step 2: Apply via Playwright Supabase SQL editor**

Navigate to Supabase SQL editor for `ckforlwdhewexyqljsaf.supabase.co`.
Use Monaco API to set SQL: `window.monaco.editor.getEditors()[0].setValue(sql)`
Run it. Expected: `ALTER TABLE` success.

**Step 3: Save migration file and commit**

```bash
git add supabase/migrations/20260301_service_records_total_bill.sql
git commit -m "chore: add total_bill column to service_records"
```

---

## Task 2: DB Migration — agent_name + agent_greeting on restaurant_config

**Files:**
- Create: `supabase/migrations/20260301_restaurant_config_persona.sql`

**Step 1: Write the migration SQL**

```sql
ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_greeting TEXT;
```

**Step 2: Apply via Playwright Supabase SQL editor**

Same approach as Task 1. Expected: `ALTER TABLE` success.

**Step 3: Save and commit**

```bash
git add supabase/migrations/20260301_restaurant_config_persona.sql
git commit -m "chore: add agent_name and agent_greeting to restaurant_config"
```

---

## Task 3: Backend — revenue-stats endpoint + tests

**Files:**
- Create: `api/revenue-stats.js`
- Create: `api/__tests__/revenue-stats.test.js`

### Step 1: Write the failing tests

`api/__tests__/revenue-stats.test.js`:

```js
var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../revenue-stats');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurantId: 'rest-1' });
});

it('GET returns avg_spend_per_cover and data_points from service_records', async () => {
  const rows = [
    { total_bill: 120, party_size: 4 },
    { total_bill: 90,  party_size: 3 },
    { total_bill: 150, party_size: 5 },
    { total_bill: 80,  party_size: 2 },
    { total_bill: 100, party_size: 4 },
  ];
  const chain = { select: jest.fn(), eq: jest.fn(), not: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockResolvedValue({ data: rows, error: null });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    avg_spend_per_cover: expect.any(Number),
    data_points: 5,
    using_default: false,
  }));
});

it('GET returns default avg_spend when fewer than 5 data points', async () => {
  const chain = { select: jest.fn(), eq: jest.fn(), not: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockResolvedValue({ data: [{ total_bill: 100, party_size: 2 }], error: null });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);

  const call = res.json.mock.calls[0][0];
  expect(call.using_default).toBe(true);
  expect(call.avg_spend_per_cover).toBe(40);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for POST', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
```

### Step 2: Run tests — verify they fail

```bash
npx jest api/__tests__/revenue-stats.test.js --forceExit
```
Expected: FAIL with "Cannot find module '../revenue-stats'"

### Step 3: Implement `api/revenue-stats.js`

```js
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('revenue-stats');
const DEFAULT_AVG_SPEND = 40;
const MIN_DATA_POINTS = 5;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));

    const { data, error } = await supabaseAdmin
      .from('service_records')
      .select('total_bill, party_size')
      .eq('restaurant_id', restaurantId)
      .not('total_bill', 'is', null);

    if (error) throw new Error(error.message);

    const rows = data || [];
    const dataPoints = rows.length;

    if (dataPoints < MIN_DATA_POINTS) {
      return res.json({
        avg_spend_per_cover: DEFAULT_AVG_SPEND,
        data_points: dataPoints,
        using_default: true,
      });
    }

    const totalBill = rows.reduce((s, r) => s + (r.total_bill || 0), 0);
    const totalCovers = rows.reduce((s, r) => s + (r.party_size || 1), 0);
    const avg = totalCovers > 0 ? Math.round((totalBill / totalCovers) * 100) / 100 : DEFAULT_AVG_SPEND;

    return res.json({
      avg_spend_per_cover: avg,
      data_points: dataPoints,
      using_default: false,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('revenue-stats error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
```

### Step 4: Run tests — verify they pass

```bash
npx jest api/__tests__/revenue-stats.test.js --forceExit
```
Expected: 4 passed

### Step 5: Add route to `vercel.json`

In `vercel.json`, find the `rewrites` array and add:
```json
{ "source": "/api/revenue-stats", "destination": "/api/revenue-stats" }
```

### Step 6: Commit

```bash
git add api/revenue-stats.js api/__tests__/revenue-stats.test.js vercel.json
git commit -m "feat: revenue-stats endpoint — avg spend per cover from service_records"
```

---

## Task 4: Backend — voice-persona endpoint + tests

**Files:**
- Create: `api/voice-persona.js`
- Create: `api/__tests__/voice-persona.test.js`

### Step 1: Write the failing tests

`api/__tests__/voice-persona.test.js`:

```js
var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function makeChain(data) {
  const chain = {
    select: jest.fn(), eq: jest.fn(), single: jest.fn(),
    update: jest.fn(), schema: jest.fn(),
  };
  chain.schema.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data, error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const handler = require('../voice-persona');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurantId: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ agent_name: 'Sofia', agent_greeting: 'Welcome!' }));
});

it('GET returns agent_name and agent_greeting', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith({ agent_name: 'Sofia', agent_greeting: 'Welcome!' });
});

it('PATCH updates agent_name and agent_greeting', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'Marco', agent_greeting: 'Ciao!' },
  }, res);
  expect(res.json).toHaveBeenCalledWith({ agent_name: 'Sofia', agent_greeting: 'Welcome!' });
});

it('PATCH returns 400 when agent_name exceeds 50 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_name: 'A'.repeat(51) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when agent_greeting exceeds 200 chars', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { agent_greeting: 'X'.repeat(201) },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
```

### Step 2: Run tests — verify they fail

```bash
npx jest api/__tests__/voice-persona.test.js --forceExit
```
Expected: FAIL with "Cannot find module '../voice-persona'"

### Step 3: Implement `api/voice-persona.js`

```js
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('voice-persona');

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('agent_name, agent_greeting')
      .eq('id', restaurantId)
      .single();
    if (error) throw new Error(error.message);
    return res.json({
      agent_name: data?.agent_name || null,
      agent_greeting: data?.agent_greeting || null,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('voice-persona GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    const { agent_name, agent_greeting } = req.body || {};

    if (agent_name !== undefined && (typeof agent_name !== 'string' || agent_name.length > 50)) {
      return res.status(400).json({ error: 'agent_name must be a string of max 50 characters' });
    }
    if (agent_greeting !== undefined && (typeof agent_greeting !== 'string' || agent_greeting.length > 200)) {
      return res.status(400).json({ error: 'agent_greeting must be a string of max 200 characters' });
    }

    const updates = {};
    if (agent_name !== undefined) updates.agent_name = agent_name;
    if (agent_greeting !== undefined) updates.agent_greeting = agent_greeting;

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update(updates)
      .eq('id', restaurantId)
      .select('agent_name, agent_greeting')
      .single();
    if (error) throw new Error(error.message);

    logger.info('voice persona updated', { restaurantId });
    return res.json({
      agent_name: data.agent_name,
      agent_greeting: data.agent_greeting,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('voice-persona PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
```

### Step 4: Run tests — verify they pass

```bash
npx jest api/__tests__/voice-persona.test.js --forceExit
```
Expected: 6 passed

### Step 5: Inject persona into persona-prompt-builder.js

In `api/_lib/persona-prompt-builder.js`, find (~line 74):
```js
prompt += `You are the ${lang.role} for ${restaurantName}.\n\n`;
```

Replace with:
```js
const agentName = restaurantConfig.agent_name;
const agentGreeting = restaurantConfig.agent_greeting;
prompt += agentName
  ? `You are ${agentName}, the ${lang.role} for ${restaurantName}.\n\n`
  : `You are the ${lang.role} for ${restaurantName}.\n\n`;
if (agentGreeting) {
  prompt += `Your opening greeting is: "${agentGreeting}"\n\n`;
}
```

### Step 6: Add to vercel.json rewrites

```json
{ "source": "/api/voice-persona", "destination": "/api/voice-persona" }
```

### Step 7: Commit

```bash
git add api/voice-persona.js api/__tests__/voice-persona.test.js api/_lib/persona-prompt-builder.js vercel.json
git commit -m "feat: voice-persona endpoint + persona-prompt-builder injection"
```

---

## Task 5: Backend — update complete-service to accept total_bill

**Files:**
- Modify: `api/host-dashboard.js` (~line 548 `handleCompleteService`)

**Step 1: Check if complete-service is already tested**

```bash
grep -n "complete-service\|handleCompleteService" api/__tests__/*.test.js
```

**Step 2: Modify handleCompleteService**

Find (~line 550):
```js
const { service_record_id } = req.body;
```
Change to:
```js
const { service_record_id, total_bill } = req.body;
```

Find (~line 561):
```js
const updateResult = await updateServiceRecord(restaurantId, service_record_id, {
  'Actual Departure': departedAt,
  'Status': 'completed'
});
```
Change to:
```js
const recordUpdates = {
  'Actual Departure': departedAt,
  'Status': 'completed',
};
if (total_bill !== undefined && total_bill !== null) {
  const parsed = parseFloat(total_bill);
  if (!isNaN(parsed) && parsed >= 0) {
    recordUpdates.total_bill = parsed;
  }
}
const updateResult = await updateServiceRecord(restaurantId, service_record_id, recordUpdates);
```

**Step 3: Verify full backend suite still passes**

```bash
npx jest --forceExit
```
Expected: all suites pass

**Step 4: Commit**

```bash
git add api/host-dashboard.js
git commit -m "feat: accept total_bill in complete-service action"
```

---

## Task 6: Frontend — useRevenueStats hook + tests

**Files:**
- Create: `client/src/hooks/useRevenueStats.ts`
- Create: `client/src/hooks/__tests__/useRevenueStats.test.ts`

### Step 1: Write failing test

`client/src/hooks/__tests__/useRevenueStats.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

let mockFetchResponse: { ok: boolean; json: () => Promise<unknown> } = {
  ok: true,
  json: async () => ({ avg_spend_per_cover: 45, data_points: 10, using_default: false }),
};

vi.mock('../../services/api', () => ({
  authFetch: vi.fn(() => Promise.resolve(mockFetchResponse)),
}));

import { useRevenueStats } from '../useRevenueStats';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useRevenueStats', () => {
  beforeEach(() => {
    mockFetchResponse = { ok: true, json: async () => ({ avg_spend_per_cover: 45, data_points: 10, using_default: false }) };
  });

  it('returns avg_spend_per_cover', async () => {
    const { result } = renderHook(() => useRevenueStats(), { wrapper });
    await waitFor(() => expect(result.current.data?.avg_spend_per_cover).toBe(45));
  });

  it('throws on non-ok response', async () => {
    mockFetchResponse = { ok: false, json: async () => ({}) };
    const { result } = renderHook(() => useRevenueStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### Step 2: Run — verify fails

```bash
cd client && npx vitest run src/hooks/__tests__/useRevenueStats.test.ts
```
Expected: FAIL

### Step 3: Implement `client/src/hooks/useRevenueStats.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface RevenueStats {
  avg_spend_per_cover: number;
  data_points: number;
  using_default: boolean;
}

async function fetchRevenueStats(): Promise<RevenueStats> {
  const res = await authFetch('/revenue-stats');
  if (!res.ok) throw new Error('Failed to load revenue stats');
  return res.json() as Promise<RevenueStats>;
}

export function useRevenueStats() {
  return useQuery({
    queryKey: ['revenue-stats'],
    queryFn: fetchRevenueStats,
    staleTime: 10 * 60 * 1000,
  });
}
```

### Step 4: Run — verify passes

```bash
cd client && npx vitest run src/hooks/__tests__/useRevenueStats.test.ts
```
Expected: 2 passed

### Step 5: Commit

```bash
git add client/src/hooks/useRevenueStats.ts client/src/hooks/__tests__/useRevenueStats.test.ts
git commit -m "feat: useRevenueStats hook"
```

---

## Task 7: Frontend — RevenueStatsWidget + wire into Dashboard

**Files:**
- Create: `client/src/components/dashboard/RevenueStatsWidget.tsx`
- Create: `client/src/components/dashboard/__tests__/RevenueStatsWidget.test.tsx`
- Modify: `client/src/pages/Dashboard.tsx`

### Step 1: Write failing widget test

`client/src/components/dashboard/__tests__/RevenueStatsWidget.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useRevenueStats', () => ({ useRevenueStats: vi.fn() }));
vi.mock('../../../hooks/useStaffingForecast', () => ({ useStaffingForecast: vi.fn() }));

import { useRevenueStats } from '../../../hooks/useRevenueStats';
import { useStaffingForecast } from '../../../hooks/useStaffingForecast';
import RevenueStatsWidget from '../RevenueStatsWidget';

const mockStats = useRevenueStats as ReturnType<typeof vi.fn>;
const mockForecast = useStaffingForecast as ReturnType<typeof vi.fn>;

const forecast = [
  { date: '2026-03-01', day: 'Sun', expected_covers: 40, roles: [] },
  { date: '2026-03-02', day: 'Mon', expected_covers: 20, roles: [] },
  { date: '2026-03-03', day: 'Tue', expected_covers: 0,  roles: [] },
];

describe('RevenueStatsWidget', () => {
  beforeEach(() => {
    mockStats.mockReturnValue({ data: { avg_spend_per_cover: 50, data_points: 10, using_default: false }, isLoading: false });
    mockForecast.mockReturnValue({ data: forecast, isLoading: false });
  });

  it('renders loading skeleton when loading', () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: true });
    mockForecast.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<RevenueStatsWidget />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders heading', () => {
    render(<RevenueStatsWidget />);
    expect(screen.getByText('Revenue Forecast')).toBeInTheDocument();
  });

  it('shows projected revenue (40 covers × €50 = €2,000)', () => {
    render(<RevenueStatsWidget />);
    expect(screen.getByText('€2,000')).toBeInTheDocument();
  });

  it('shows estimated badge when using default', () => {
    mockStats.mockReturnValue({ data: { avg_spend_per_cover: 40, data_points: 2, using_default: true }, isLoading: false });
    render(<RevenueStatsWidget />);
    expect(screen.getByText(/estimated/i)).toBeInTheDocument();
  });

  it('returns null when no data', () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: false });
    mockForecast.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<RevenueStatsWidget />);
    expect(container.firstChild).toBeNull();
  });
});
```

### Step 2: Run — verify fails

```bash
cd client && npx vitest run src/components/dashboard/__tests__/RevenueStatsWidget.test.tsx
```
Expected: FAIL

### Step 3: Implement `client/src/components/dashboard/RevenueStatsWidget.tsx`

```tsx
import { useRevenueStats } from '../../hooks/useRevenueStats';
import { useStaffingForecast } from '../../hooks/useStaffingForecast';

function fmt(amount: number): string {
  return '€' + Math.round(amount).toLocaleString('en-US');
}

export default function RevenueStatsWidget() {
  const { data: stats, isLoading: statsLoading } = useRevenueStats();
  const { data: forecast, isLoading: forecastLoading } = useStaffingForecast();

  if (statsLoading || forecastLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}
      </div>
    );
  }

  if (!stats || !forecast || forecast.length === 0) return null;

  const days = forecast.slice(0, 7);
  const totalProjected = days.reduce((s, d) => s + d.expected_covers * stats.avg_spend_per_cover, 0);
  const maxProjected = Math.max(...days.map(d => d.expected_covers * stats.avg_spend_per_cover), 1);

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          Revenue Forecast
        </h2>
        <div className="flex items-center gap-2">
          {stats.using_default && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              estimated
            </span>
          )}
          <span className="text-sm font-semibold text-deep-charcoal">{fmt(totalProjected)}</span>
          <span className="text-xs text-warm-stone">/ 7 days</span>
        </div>
      </div>

      <div className="space-y-2">
        {days.map((day) => {
          const projected = day.expected_covers * stats.avg_spend_per_cover;
          const pct = Math.round((projected / maxProjected) * 100);
          return (
            <div key={day.date} className="flex items-center gap-3">
              <span className="text-xs font-medium text-warm-stone w-8">{day.day}</span>
              <div className="flex-1 h-2 bg-soft-gray rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-deep-charcoal w-16 text-right">
                {fmt(projected)}
              </span>
            </div>
          );
        })}
      </div>

      {stats.using_default && (
        <p className="text-xs text-warm-stone">
          Based on estimated €{stats.avg_spend_per_cover}/cover. Add bills when completing service to improve accuracy.
        </p>
      )}
    </div>
  );
}
```

### Step 4: Add import + wire into Dashboard.tsx left column

In `client/src/pages/Dashboard.tsx`:

Add import:
```tsx
import RevenueStatsWidget from '../components/dashboard/RevenueStatsWidget';
```

After `<StaffingForecastWidget />`, add:
```tsx
<RevenueStatsWidget />
```

### Step 5: Run full frontend suite

```bash
cd client && npx vitest run
```
Expected: all tests pass

### Step 6: Commit

```bash
git add client/src/components/dashboard/RevenueStatsWidget.tsx \
  "client/src/components/dashboard/__tests__/RevenueStatsWidget.test.tsx" \
  client/src/pages/Dashboard.tsx
git commit -m "feat: RevenueStatsWidget — 7-day revenue projection bar chart"
```

---

## Task 8: Frontend — update ActivePartiesPanel + useCompleteService for total_bill

**Files:**
- Modify: `client/src/hooks/useCompleteService.ts`
- Modify: `client/src/services/api.ts`
- Modify: `client/src/components/dashboard/ActivePartiesPanel.tsx`
- Modify: `client/src/pages/Dashboard.tsx`

**Step 1: Update `useCompleteService.ts`**

Change mutation input type from `string` to an object, and invalidate `revenue-stats` on success:

```ts
interface CompleteServiceInput {
  serviceRecordId: string;
  totalBill?: number;
}

export function useCompleteService() {
  const queryClient = useQueryClient();
  return useMutation<CompleteServiceResponse, Error, CompleteServiceInput>({
    mutationFn: async ({ serviceRecordId, totalBill }) => {
      const response = await hostAPI.completeService(serviceRecordId, totalBill);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-stats'] });
    },
  });
}
```

**Step 2: Update `api.ts` completeService**

```ts
completeService: (serviceRecordId: string, totalBill?: number) =>
  api.post('/host-dashboard?action=complete-service', {
    service_record_id: serviceRecordId,
    ...(totalBill !== undefined ? { total_bill: totalBill } : {}),
  }),
```

**Step 3: Update ActivePartiesPanel — add bill input + update onCompleteService signature**

Add `useState` import. Add state at top of component:
```tsx
const [billInputs, setBillInputs] = useState<Record<string, string>>({});
```

Update prop type:
```ts
onCompleteService: (party: ActiveParty, totalBill?: number) => void;
```

Find the "Complete Service" button. Wrap it with a flex container adding the optional bill input:
```tsx
<div className="flex items-center gap-2 mt-2">
  <input
    type="number"
    min={0}
    placeholder="€ bill (optional)"
    value={billInputs[party.service_id] || ''}
    onChange={e => setBillInputs(prev => ({ ...prev, [party.service_id]: e.target.value }))}
    className="w-28 border border-border-gray rounded-lg px-2 py-1 text-xs text-deep-charcoal focus:outline-none focus:ring-1 focus:ring-burgundy/30"
    aria-label="Total bill amount"
  />
  <button
    type="button"
    onClick={() => {
      const raw = billInputs[party.service_id];
      const parsed = raw ? parseFloat(raw) : undefined;
      onCompleteService(party, parsed !== undefined && !isNaN(parsed) ? parsed : undefined);
    }}
    // keep existing className
  >
    {/* keep existing label */}
  </button>
</div>
```

**Step 4: Update Dashboard.tsx handleCompleteService**

```tsx
const handleCompleteService = (party: ActiveParty, totalBill?: number) => {
  completeServiceMutation.mutate({ serviceRecordId: party.service_id, totalBill });
};
```

**Step 5: Run full frontend suite**

```bash
cd client && npx vitest run
```
Expected: all tests pass (existing ActivePartiesPanel tests should still pass since they don't test the new optional input)

**Step 6: Commit**

```bash
git add client/src/hooks/useCompleteService.ts client/src/services/api.ts \
  client/src/components/dashboard/ActivePartiesPanel.tsx client/src/pages/Dashboard.tsx
git commit -m "feat: total_bill input on complete service + revenue-stats cache invalidation"
```

---

## Task 9: Frontend — VoicePersonaPanel + EmbedSnippetPanel + wire into VoiceSettingsPage

**Files:**
- Create: `client/src/hooks/useVoicePersona.ts`
- Create: `client/src/hooks/__tests__/useVoicePersona.test.ts`
- Create: `client/src/components/dashboard/VoicePersonaPanel.tsx`
- Create: `client/src/components/dashboard/__tests__/VoicePersonaPanel.test.tsx`
- Create: `client/src/components/dashboard/EmbedSnippetPanel.tsx`
- Create: `client/src/components/dashboard/__tests__/EmbedSnippetPanel.test.tsx`
- Create: `client/public/widget.js`
- Modify: `client/src/pages/VoiceSettingsPage.tsx`
- Modify: `client/src/pages/BookingPage.tsx`

### Step 1: Implement `client/src/hooks/useVoicePersona.ts`

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface VoicePersona {
  agent_name: string | null;
  agent_greeting: string | null;
}

async function fetchPersona(): Promise<VoicePersona> {
  const res = await authFetch('/voice-persona');
  if (!res.ok) throw new Error('Failed to load voice persona');
  return res.json() as Promise<VoicePersona>;
}

async function patchPersona(updates: Partial<VoicePersona>): Promise<VoicePersona> {
  const res = await authFetch('/voice-persona', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save voice persona');
  return res.json() as Promise<VoicePersona>;
}

export function useVoicePersona() {
  return useQuery({ queryKey: ['voice-persona'], queryFn: fetchPersona, staleTime: 10 * 60 * 1000 });
}

export function useSaveVoicePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPersona,
    onSuccess: (updated) => { queryClient.setQueryData(['voice-persona'], updated); },
  });
}
```

### Step 2: Write + run hook test

`client/src/hooks/__tests__/useVoicePersona.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import React from 'react';

vi.mock('../../services/api', () => ({
  authFetch: vi.fn(() => Promise.resolve({
    ok: true,
    json: async () => ({ agent_name: 'Sofia', agent_greeting: 'Welcome!' }),
  })),
}));

import { useVoicePersona } from '../useVoicePersona';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useVoicePersona', () => {
  it('returns agent_name', async () => {
    const { result } = renderHook(() => useVoicePersona(), { wrapper });
    await waitFor(() => expect(result.current.data?.agent_name).toBe('Sofia'));
  });
});
```

Run:
```bash
cd client && npx vitest run src/hooks/__tests__/useVoicePersona.test.ts
```
Expected: 1 passed

### Step 3: Implement VoicePersonaPanel

`client/src/components/dashboard/VoicePersonaPanel.tsx`:

```tsx
import { useState } from 'react';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';

export default function VoicePersonaPanel() {
  const toast = useToast();
  const { data: persona, isLoading } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});

  const getValue = (key: keyof VoicePersona): string =>
    ((key in pending ? pending[key] : persona?.[key]) ?? '') as string;

  const set = (key: keyof VoicePersona, value: string) =>
    setPending(p => ({ ...p, [key]: value }));

  const isDirty = Object.keys(pending).length > 0;

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate(pending, {
      onSuccess: () => { toast.success('Agent persona saved'); setPending({}); },
      onError: () => toast.error('Failed to save persona'),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        <div className="h-10 bg-gray-100 rounded" />
        <div className="h-10 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">Agent Persona</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor="agent-name" className="block text-xs font-medium text-warm-stone mb-1">
            Agent name <span className="text-gray-400">(max 50 chars)</span>
          </label>
          <input
            id="agent-name"
            type="text"
            maxLength={50}
            placeholder="e.g. Sofia"
            value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)}
            className="w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="block text-xs font-medium text-warm-stone mb-1">
            Opening greeting <span className="text-gray-400">(max 200 chars)</span>
          </label>
          <input
            id="agent-greeting"
            type="text"
            maxLength={200}
            placeholder="e.g. Welcome to our restaurant!"
            value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)}
            className="w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Write + run VoicePersonaPanel test

`client/src/components/dashboard/__tests__/VoicePersonaPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../hooks/useVoicePersona', () => ({
  useVoicePersona: vi.fn(),
  useSaveVoicePersona: vi.fn(),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { useVoicePersona, useSaveVoicePersona } from '../../../hooks/useVoicePersona';
import VoicePersonaPanel from '../VoicePersonaPanel';

const mockUse = useVoicePersona as ReturnType<typeof vi.fn>;
const mockSave = useSaveVoicePersona as ReturnType<typeof vi.fn>;

describe('VoicePersonaPanel', () => {
  beforeEach(() => {
    mockSave.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUse.mockReturnValue({ data: { agent_name: 'Sofia', agent_greeting: 'Welcome!' }, isLoading: false });
  });

  it('renders heading', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByText('Agent Persona')).toBeInTheDocument();
  });

  it('renders agent name input with current value', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByDisplayValue('Sofia')).toBeInTheDocument();
  });

  it('save button disabled when no changes', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('save button enabled after editing', async () => {
    const user = userEvent.setup();
    render(<VoicePersonaPanel />);
    const input = screen.getByDisplayValue('Sofia');
    await user.clear(input);
    await user.type(input, 'Marco');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });
});
```

Run:
```bash
cd client && npx vitest run src/components/dashboard/__tests__/VoicePersonaPanel.test.tsx
```
Expected: 4 passed

### Step 5: Implement EmbedSnippetPanel

`client/src/components/dashboard/EmbedSnippetPanel.tsx`:

```tsx
import { useState } from 'react';

interface Props { slug: string; }

export default function EmbedSnippetPanel({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="https://restaurant-ai-mcp.vercel.app/widget.js?slug=${slug}"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">Booking Widget</h2>
      <p className="text-xs text-warm-stone">
        Paste this snippet anywhere on your website to add a "Book a Table" button.
      </p>
      <div className="relative">
        <pre className="bg-soft-gray rounded-xl px-4 py-3 text-xs text-deep-charcoal overflow-x-auto whitespace-pre-wrap break-all">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy snippet"
          className="absolute top-2 right-2 px-3 py-1 bg-deep-charcoal text-white text-xs rounded-lg hover:bg-charcoal-dark transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
```

### Step 6: Write + run EmbedSnippetPanel test

`client/src/components/dashboard/__tests__/EmbedSnippetPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmbedSnippetPanel from '../EmbedSnippetPanel';

describe('EmbedSnippetPanel', () => {
  it('renders heading', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByText('Booking Widget')).toBeInTheDocument();
  });

  it('renders snippet containing the slug', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByText(/la-rosa/)).toBeInTheDocument();
  });

  it('renders copy button', () => {
    render(<EmbedSnippetPanel slug="la-rosa" />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });
});
```

Run:
```bash
cd client && npx vitest run src/components/dashboard/__tests__/EmbedSnippetPanel.test.tsx
```
Expected: 3 passed

### Step 7: Create `client/public/widget.js`

```js
(function () {
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var src = script.src || '';
  var match = src.match(/[?&]slug=([^&]+)/);
  if (!match) return;
  var slug = decodeURIComponent(match[1]);
  var BASE = 'https://restaurant-ai-mcp.vercel.app';

  var btn = document.createElement('button');
  btn.textContent = 'Book a Table';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:#1a1a2e;color:#fff;border:none;border-radius:9999px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)';

  var iframe = document.createElement('iframe');
  iframe.src = BASE + '/book/' + slug + '?embed=true';
  iframe.style.cssText = 'display:none;position:fixed;bottom:80px;right:24px;z-index:9998;width:420px;height:600px;border:none;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2)';

  btn.addEventListener('click', function () {
    iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none';
  });

  document.body.appendChild(iframe);
  document.body.appendChild(btn);
})();
```

### Step 8: Update BookingPage to hide nav in embed mode

In `client/src/pages/BookingPage.tsx`:

Add import (if not already present):
```tsx
import { useSearchParams } from 'react-router-dom';
```

In the component body add:
```tsx
const [searchParams] = useSearchParams();
const isEmbed = searchParams.get('embed') === 'true';
```

Find the nav/header render. Wrap with `{!isEmbed && ( ... )}`.

### Step 9: Wire both panels into VoiceSettingsPage

In `client/src/pages/VoiceSettingsPage.tsx`, add imports:
```tsx
import VoicePersonaPanel from '../components/dashboard/VoicePersonaPanel';
import EmbedSnippetPanel from '../components/dashboard/EmbedSnippetPanel';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
```

Add slug query near the top of the component:
```tsx
const { data: dashData } = useQuery({
  queryKey: ['hostDashboard'],
  queryFn: async () => {
    const res = await authFetch('/host-dashboard?action=dashboard');
    return res.json();
  },
  staleTime: 5 * 60 * 1000,
});
const slug: string = (dashData as { restaurant_slug?: string })?.restaurant_slug || '';
```

Add at the bottom of the settings content:
```tsx
<VoicePersonaPanel />
{slug && <EmbedSnippetPanel slug={slug} />}
```

### Step 10: Run full frontend suite

```bash
cd client && npx vitest run
```
Expected: all tests pass

### Step 11: Commit

```bash
git add client/src/hooks/useVoicePersona.ts client/src/hooks/__tests__/useVoicePersona.test.ts \
  client/src/components/dashboard/VoicePersonaPanel.tsx \
  "client/src/components/dashboard/__tests__/VoicePersonaPanel.test.tsx" \
  client/src/components/dashboard/EmbedSnippetPanel.tsx \
  "client/src/components/dashboard/__tests__/EmbedSnippetPanel.test.tsx" \
  client/public/widget.js client/src/pages/VoiceSettingsPage.tsx \
  client/src/pages/BookingPage.tsx
git commit -m "feat: VoicePersonaPanel + EmbedSnippetPanel + widget.js"
```

---

## Task 10: Full verification + CLAUDE.md + push

### Step 1: Run full backend suite

```bash
npx jest --forceExit
```
Expected: all suites pass

### Step 2: Run full frontend suite

```bash
cd client && npx vitest run
```
Expected: all tests pass

### Step 3: TypeScript check

```bash
cd client && npx tsc --noEmit
```
Expected: no errors

### Step 4: Update CLAUDE.md

Add after Phase 8 in `CLAUDE.md`:

```markdown
### Phase 9 — Revenue Forecasting + Booking Widget + Voice Persona ✅ COMPLETE
- [x] DB migration — total_bill NUMERIC on service_records
- [x] DB migration — agent_name + agent_greeting TEXT on restaurant_config
- [x] revenue-stats.js — avg_spend_per_cover (5+ data point threshold, €40 default)
- [x] voice-persona.js — GET/PATCH agent_name + agent_greeting with length validation
- [x] host-dashboard.js — complete-service accepts optional total_bill
- [x] persona-prompt-builder.js — injects agent_name + agent_greeting into voice prompt
- [x] useRevenueStats + RevenueStatsWidget — 7-day revenue projection with bar chart in Dashboard
- [x] useVoicePersona + VoicePersonaPanel — name + greeting config in Voice Settings
- [x] widget.js — iframe booking button served from /widget.js?slug=
- [x] EmbedSnippetPanel — copy-paste snippet panel in Voice Settings
- [x] BookingPage — ?embed=true hides nav for iframe mode
- [x] ActivePartiesPanel — optional total_bill input on Complete Service
```

### Step 5: Commit and push

```bash
git add CLAUDE.md
git commit -m "docs: add Phase 9 to CLAUDE.md roadmap"
git push
```
