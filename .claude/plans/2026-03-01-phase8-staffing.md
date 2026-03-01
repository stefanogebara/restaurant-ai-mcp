# Phase 8 — Staffing Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 7-day staffing forecast — dashboard widget + Manager AI integration, driven by per-role ratio config.

**Architecture:** staffing_config JSONB in restaurant_config → staffingService.js calculates headcount → forecast API + config API → StaffingForecastWidget + StaffingSettingsPanel + snapshot injection.

**Tech Stack:** Node.js serverless (Jest), React + Vitest, Supabase (Playwright SQL editor for migration), React Query v5.

---

## Task 1: DB Migration — add staffing_config column

**Files:**
- Create: `supabase/migrations/20260301_staffing_config.sql`

**Step 1: Write the migration SQL**

```sql
ALTER TABLE restaurant_config
  ADD COLUMN IF NOT EXISTS staffing_config JSONB DEFAULT '{"roles": [
    {"name": "FOH", "covers_per_staff": 15},
    {"name": "BOH", "covers_per_staff": 20},
    {"name": "Bar", "covers_per_staff": 25}
  ]}'::jsonb;
```

**Step 2: Apply via Playwright Supabase SQL Editor**

Navigate to `https://supabase.com/dashboard/project/ckforlwdhewexyqljsaf/sql/new`.

Use Monaco editor API to set content (NEVER type directly — it mangles the SQL):
```js
window.monaco.editor.getEditors()[0].setValue(sql)
```

Click "Run". Verify "Success. No rows returned."

**Step 3: Save migration file**

```bash
# Save the SQL to the migration file
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260301_staffing_config.sql
git commit -m "feat: add staffing_config column to restaurant_config"
```

---

## Task 2: staffingService.js + tests

**Files:**
- Create: `api/services/staffingService.js`
- Create: `api/__tests__/staffingService.test.js`

**Step 1: Write failing tests**

```js
// api/__tests__/staffingService.test.js
const { calculateStaffing, buildForecast } = require('../services/staffingService');

const DEFAULT_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

it('rounds up fractional staff', () => {
  const result = calculateStaffing(16, DEFAULT_ROLES);
  expect(result.find(r => r.name === 'FOH').recommended).toBe(2); // ceil(16/15)
});

it('minimum 1 staff per role even with 0 covers', () => {
  const result = calculateStaffing(0, DEFAULT_ROLES);
  result.forEach(r => expect(r.recommended).toBe(1));
});

it('calculates each role independently', () => {
  const result = calculateStaffing(30, DEFAULT_ROLES);
  expect(result.find(r => r.name === 'FOH').recommended).toBe(2); // ceil(30/15)
  expect(result.find(r => r.name === 'BOH').recommended).toBe(2); // ceil(30/20)
  expect(result.find(r => r.name === 'Bar').recommended).toBe(2); // ceil(30/25)
});

it('returns empty array when roles config is empty', () => {
  const result = calculateStaffing(50, []);
  expect(result).toEqual([]);
});

it('buildForecast shapes output correctly', () => {
  const reservationsByDate = [
    { date: '2026-03-02', covers: 42 },
  ];
  const forecast = buildForecast(reservationsByDate, DEFAULT_ROLES);
  expect(forecast[0]).toMatchObject({
    date: '2026-03-02',
    expected_covers: 42,
    roles: expect.arrayContaining([
      expect.objectContaining({ name: 'FOH', recommended: 3 }),
    ]),
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx jest api/__tests__/staffingService.test.js --forceExit
```

Expected: FAIL — "Cannot find module"

**Step 3: Implement staffingService.js**

```js
// api/services/staffingService.js

function calculateStaffing(covers, roles) {
  return roles.map(role => ({
    name: role.name,
    recommended: Math.max(1, Math.ceil(covers / role.covers_per_staff)),
  }));
}

function buildForecast(reservationsByDate, roles) {
  return reservationsByDate.map(({ date, covers }) => ({
    date,
    day: new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    expected_covers: covers,
    roles: calculateStaffing(covers, roles),
  }));
}

module.exports = { calculateStaffing, buildForecast };
```

**Step 4: Run tests — expect PASS**

```bash
npx jest api/__tests__/staffingService.test.js --forceExit
```

Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add api/services/staffingService.js api/__tests__/staffingService.test.js
git commit -m "feat: add staffingService with calculateStaffing and buildForecast"
```

---

## Task 3: staffing-forecast.js endpoint + tests

**Files:**
- Create: `api/staffing-forecast.js`
- Create: `api/__tests__/staffing-forecast.test.js`

**Step 1: Write failing tests**

```js
// api/__tests__/staffing-forecast.test.js
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

const handler = require('../staffing-forecast');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurantId: 'rest-1' });
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

it('returns 7-day forecast array', async () => {
  // Mock config query
  const configChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  configChain.select.mockReturnValue(configChain);
  configChain.eq.mockReturnValue(configChain);
  configChain.single.mockResolvedValue({
    data: { staffing_config: { roles: [{ name: 'FOH', covers_per_staff: 15 }] } },
    error: null,
  });

  // Mock reservations query
  const resChain = { select: jest.fn(), eq: jest.fn(), gte: jest.fn(), lt: jest.fn() };
  resChain.select.mockReturnValue(resChain);
  resChain.eq.mockReturnValue(resChain);
  resChain.gte.mockReturnValue(resChain);
  resChain.lt.mockResolvedValue({
    data: [{ date: '2026-03-02', party_size: 4 }, { date: '2026-03-02', party_size: 6 }],
    error: null,
  });

  let call = 0;
  mockSupabaseAdmin.from.mockImplementation(() => {
    call++;
    return call === 1 ? configChain : resChain;
  });

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ forecast: expect.any(Array) })
  );
});

it('returns empty roles when no config set', async () => {
  const configChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  configChain.select.mockReturnValue(configChain);
  configChain.eq.mockReturnValue(configChain);
  configChain.single.mockResolvedValue({ data: { staffing_config: null }, error: null });

  const resChain = { select: jest.fn(), eq: jest.fn(), gte: jest.fn(), lt: jest.fn() };
  resChain.select.mockReturnValue(resChain);
  resChain.eq.mockReturnValue(resChain);
  resChain.gte.mockReturnValue(resChain);
  resChain.lt.mockResolvedValue({ data: [], error: null });

  let call = 0;
  mockSupabaseAdmin.from.mockImplementation(() => {
    call++;
    return call === 1 ? configChain : resChain;
  });

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ forecast: expect.any(Array) })
  );
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx jest api/__tests__/staffing-forecast.test.js --forceExit
```

**Step 3: Implement staffing-forecast.js**

```js
// api/staffing-forecast.js
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { buildForecast } = require('./services/staffingService');

const logger = createSecureLogger('staffing-forecast');

const DEFAULT_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));

    // Fetch config
    const { data: config, error: configError } = await supabaseAdmin
      .from('restaurant_config')
      .select('staffing_config')
      .eq('id', restaurantId)
      .single();
    if (configError) throw new Error(configError.message);

    const roles = config?.staffing_config?.roles || DEFAULT_ROLES;

    // Fetch next 7 days of reservations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    const { data: reservations, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('date, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('date', today.toISOString().split('T')[0])
      .lt('date', endDate.toISOString().split('T')[0]);
    if (resError) throw new Error(resError.message);

    // Group covers by date
    const coversByDate = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      coversByDate[d.toISOString().split('T')[0]] = 0;
    }
    (reservations || []).forEach(r => {
      if (coversByDate[r.date] !== undefined) {
        coversByDate[r.date] += r.party_size || 0;
      }
    });

    const reservationsByDate = Object.entries(coversByDate).map(([date, covers]) => ({ date, covers }));
    const forecast = buildForecast(reservationsByDate, roles);

    return res.json({ forecast });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('staffing-forecast error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
```

**Step 4: Run tests — expect PASS**

```bash
npx jest api/__tests__/staffing-forecast.test.js --forceExit
```

Expected: 4/4 PASS

**Step 5: Commit**

```bash
git add api/staffing-forecast.js api/__tests__/staffing-forecast.test.js
git commit -m "feat: add staffing-forecast endpoint"
```

---

## Task 4: staffing-config.js endpoint + tests

**Files:**
- Create: `api/staffing-config.js`
- Create: `api/__tests__/staffing-config.test.js`

**Step 1: Write failing tests**

```js
// api/__tests__/staffing-config.test.js
var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));

function makeChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn(), update: jest.fn() };
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

const handler = require('../staffing-config');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurantId: 'rest-1' });
});

it('GET returns staffing_config', async () => {
  const config = { roles: [{ name: 'FOH', covers_per_staff: 15 }] };
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ staffing_config: config }));
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer tok' } }, res);
  expect(res.json).toHaveBeenCalledWith({ staffing_config: config });
});

it('PATCH updates staffing_config', async () => {
  const newConfig = { roles: [{ name: 'FOH', covers_per_staff: 12 }] };
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ staffing_config: newConfig }));
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: newConfig,
  }, res);
  expect(res.json).toHaveBeenCalledWith({ staffing_config: newConfig });
});

it('PATCH returns 400 when roles is not an array', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { roles: 'not-array' },
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('PATCH returns 400 when a role is missing name or covers_per_staff', async () => {
  const res = mockRes();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer tok' },
    body: { roles: [{ name: 'FOH' }] }, // missing covers_per_staff
  }, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad' } }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 405 for DELETE', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx jest api/__tests__/staffing-config.test.js --forceExit
```

**Step 3: Implement staffing-config.js**

```js
// api/staffing-config.js
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('staffing-config');

module.exports = async (req, res) => {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    const { data, error } = await supabaseAdmin
      .from('restaurant_config')
      .select('staffing_config')
      .eq('id', restaurantId)
      .single();
    if (error) throw new Error(error.message);
    return res.json({ staffing_config: data?.staffing_config || null });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('staffing-config GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const { restaurantId } = verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    const body = req.body || {};

    // Validate
    if (!Array.isArray(body.roles)) {
      return res.status(400).json({ error: 'roles must be an array' });
    }
    for (const role of body.roles) {
      if (!role.name || typeof role.covers_per_staff !== 'number') {
        return res.status(400).json({ error: 'Each role must have name (string) and covers_per_staff (number)' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('restaurant_config')
      .update({ staffing_config: body })
      .eq('id', restaurantId)
      .select('staffing_config')
      .single();
    if (error) throw new Error(error.message);

    logger.info('staffing_config updated', { restaurantId, roleCount: body.roles.length });
    return res.json({ staffing_config: data.staffing_config });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('staffing-config PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
```

**Step 4: Run tests — expect PASS**

```bash
npx jest api/__tests__/staffing-config.test.js --forceExit
```

Expected: 6/6 PASS

**Step 5: Commit**

```bash
git add api/staffing-config.js api/__tests__/staffing-config.test.js
git commit -m "feat: add staffing-config GET/PATCH endpoint"
```

---

## Task 5: Inject staffing forecast into restaurantSnapshot.js

**Files:**
- Modify: `api/services/restaurantSnapshot.js`
- Modify: `api/__tests__/restaurantSnapshot.test.js`

**Step 1: Read restaurantSnapshot.js** to understand existing structure (supabaseAdmin queries, how sections are assembled).

**Step 2: Add staffing forecast section**

At the end of the snapshot assembly (before returning the string), add:

```js
// Fetch staffing config + today's forecast
const { data: configData } = await supabaseAdmin
  .from('restaurant_config')
  .select('staffing_config')
  .eq('id', restaurantId)
  .single();

const roles = configData?.staffing_config?.roles || [];
if (roles.length > 0) {
  const { buildForecast } = require('./staffingService');
  // Use the next 3 days for the snapshot (not 7 — keep prompt concise)
  const today = new Date();
  const days3 = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days3.push(d.toISOString().split('T')[0]);
  }

  // Count covers already fetched in snapshot reservations data
  const coversByDate = {};
  days3.forEach(d => { coversByDate[d] = 0; });
  (reservations || []).forEach(r => {
    if (coversByDate[r.date] !== undefined) coversByDate[r.date] += r.party_size || 0;
  });

  const forecast = buildForecast(
    days3.map(d => ({ date: d, covers: coversByDate[d] })),
    roles
  );

  const forecastLines = forecast.map(f =>
    `${f.day} ${f.date}: ${f.expected_covers} covers → ${f.roles.map(r => `${r.name}: ${r.recommended}`).join(', ')}`
  ).join('\n');

  snapshot += `\n\n[STAFFING FORECAST - NEXT 3 DAYS]\n${forecastLines}`;
}
```

**Step 3: Add test assertion**

In `api/__tests__/restaurantSnapshot.test.js`, add one test that mocks `staffing_config` with roles and asserts `[STAFFING FORECAST` appears in the snapshot string.

**Step 4: Run full backend suite**

```bash
npx jest --forceExit
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add api/services/restaurantSnapshot.js api/__tests__/restaurantSnapshot.test.js
git commit -m "feat: inject staffing forecast into manager AI snapshot"
```

---

## Task 6: Frontend — hooks + StaffingForecastWidget + StaffingSettingsPanel

**Files:**
- Create: `client/src/hooks/useStaffingForecast.ts`
- Create: `client/src/hooks/useStaffingConfig.ts`
- Create: `client/src/components/dashboard/StaffingForecastWidget.tsx`
- Create: `client/src/components/dashboard/__tests__/StaffingForecastWidget.test.tsx`
- Create: `client/src/components/dashboard/StaffingSettingsPanel.tsx`
- Create: `client/src/components/dashboard/__tests__/StaffingSettingsPanel.test.tsx`
- Modify: `client/src/pages/Dashboard.tsx` — add StaffingForecastWidget
- Modify: `client/src/pages/WhatsAppSettingsPage.tsx` — add StaffingSettingsPanel

**Step 1: Create useStaffingForecast.ts**

```ts
// client/src/hooks/useStaffingForecast.ts
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface StaffingRole { name: string; recommended: number; }
export interface StaffingDay {
  date: string; day: string; expected_covers: number; roles: StaffingRole[];
}

async function fetchForecast(): Promise<StaffingDay[]> {
  const res = await authFetch('/staffing-forecast');
  if (!res.ok) throw new Error('Failed to load staffing forecast');
  const json = await res.json();
  return json.forecast || [];
}

export function useStaffingForecast() {
  return useQuery({
    queryKey: ['staffing-forecast'],
    queryFn: fetchForecast,
    staleTime: 10 * 60 * 1000,
  });
}
```

**Step 2: Create useStaffingConfig.ts**

```ts
// client/src/hooks/useStaffingConfig.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface StaffingRole { name: string; covers_per_staff: number; }
export interface StaffingConfig { roles: StaffingRole[]; }

async function fetchConfig(): Promise<StaffingConfig | null> {
  const res = await authFetch('/staffing-config');
  if (!res.ok) throw new Error('Failed to load staffing config');
  const json = await res.json();
  return json.staffing_config;
}

async function patchConfig(config: StaffingConfig): Promise<StaffingConfig> {
  const res = await authFetch('/staffing-config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save staffing config');
  const json = await res.json();
  return json.staffing_config;
}

export function useStaffingConfig() {
  return useQuery({
    queryKey: ['staffing-config'],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveStaffingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['staffing-config'], updated);
      queryClient.invalidateQueries({ queryKey: ['staffing-forecast'] });
    },
  });
}
```

**Step 3: Create StaffingForecastWidget.tsx**

```tsx
// client/src/components/dashboard/StaffingForecastWidget.tsx
import { useStaffingForecast } from '../../hooks/useStaffingForecast';

export default function StaffingForecastWidget() {
  const { data: forecast, isLoading } = useStaffingForecast();

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse">
        <div className="h-4 w-32 bg-soft-gray rounded mb-4" />
        <div className="space-y-2">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-8 bg-soft-gray rounded" />)}
        </div>
      </div>
    );
  }

  if (!forecast || forecast.length === 0) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider mb-3">
          Staffing Forecast
        </h2>
        <p className="text-sm text-warm-stone">
          No staffing config set.{' '}
          <a href="/host-dashboard/whatsapp" className="text-burgundy hover:underline">
            Configure ratios →
          </a>
        </p>
      </div>
    );
  }

  // Collect all role names from first day
  const roleNames = forecast[0]?.roles.map(r => r.name) || [];

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          Staffing Forecast
        </h2>
        <span className="text-xs text-warm-stone">7 days</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-warm-stone border-b border-border-gray">
              <th className="pb-2 font-medium">Day</th>
              <th className="pb-2 font-medium">Covers</th>
              {roleNames.map(name => (
                <th key={name} className="pb-2 font-medium">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecast.map(day => (
              <tr key={day.date} className="border-b border-soft-gray last:border-0">
                <td className="py-2 font-medium text-deep-charcoal">
                  {day.day} <span className="text-warm-stone font-normal text-xs">{day.date.slice(5)}</span>
                </td>
                <td className="py-2 text-deep-charcoal">{day.expected_covers}</td>
                {day.roles.map(role => (
                  <td key={role.name} className="py-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-burgundy/10 text-burgundy text-xs font-semibold">
                      {role.recommended}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 4: Create StaffingSettingsPanel.tsx**

```tsx
// client/src/components/dashboard/StaffingSettingsPanel.tsx
import { useState } from 'react';
import { useStaffingConfig, useSaveStaffingConfig } from '../../hooks/useStaffingConfig';
import type { StaffingRole } from '../../hooks/useStaffingConfig';
import { useToast } from '../../contexts/ToastContext';

const DEFAULT_ROLES: StaffingRole[] = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

export default function StaffingSettingsPanel() {
  const toast = useToast();
  const { data: config, isLoading } = useStaffingConfig();
  const saveMutation = useSaveStaffingConfig();

  const [roles, setRoles] = useState<StaffingRole[] | null>(null);
  const currentRoles = roles ?? config?.roles ?? DEFAULT_ROLES;
  const isDirty = roles !== null;

  const updateRole = (i: number, field: keyof StaffingRole, value: string | number) =>
    setRoles(currentRoles.map((r, idx) => idx === i ? { ...r, [field]: value } : r));

  const addRole = () => setRoles([...currentRoles, { name: '', covers_per_staff: 15 }]);

  const removeRole = (i: number) => setRoles(currentRoles.filter((_, idx) => idx !== i));

  const handleSave = () => {
    saveMutation.mutate({ roles: currentRoles }, {
      onSuccess: () => { toast.success('Staffing config saved'); setRoles(null); },
      onError: () => toast.error('Failed to save staffing config'),
    });
  };

  if (isLoading) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          Staffing Ratios
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-warm-stone">
        Set how many covers each staff member can handle per shift.
      </p>
      <div className="space-y-2">
        {currentRoles.map((role, i) => (
          <div key={i} className="flex items-center gap-3">
            <input
              type="text"
              value={role.name}
              onChange={e => updateRole(i, 'name', e.target.value)}
              placeholder="Role name"
              aria-label={`Role ${i + 1} name`}
              className="flex-1 px-3 py-1.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
            <input
              type="number"
              value={role.covers_per_staff}
              onChange={e => updateRole(i, 'covers_per_staff', Number(e.target.value))}
              min={1}
              aria-label={`Role ${i + 1} covers per staff`}
              className="w-20 px-3 py-1.5 border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
            />
            <span className="text-xs text-warm-stone whitespace-nowrap">covers/staff</span>
            <button
              type="button"
              onClick={() => removeRole(i)}
              aria-label={`Remove role ${i + 1}`}
              className="text-warm-stone hover:text-red-500 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRole}
        className="text-sm text-burgundy hover:underline"
      >
        + Add role
      </button>
    </div>
  );
}
```

**Step 5: Write tests**

`StaffingForecastWidget.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import StaffingForecastWidget from '../StaffingForecastWidget';

vi.mock('../../../hooks/useStaffingForecast', () => ({ useStaffingForecast: vi.fn() }));

import { useStaffingForecast } from '../../../hooks/useStaffingForecast';
const mockHook = vi.mocked(useStaffingForecast);

const SAMPLE_FORECAST = [
  { date: '2026-03-02', day: 'Mon', expected_covers: 30,
    roles: [{ name: 'FOH', recommended: 2 }, { name: 'BOH', recommended: 2 }] },
  { date: '2026-03-03', day: 'Tue', expected_covers: 0,
    roles: [{ name: 'FOH', recommended: 1 }, { name: 'BOH', recommended: 1 }] },
];

describe('StaffingForecastWidget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders skeleton while loading', () => {
    mockHook.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useStaffingForecast>);
    const { container } = render(<StaffingForecastWidget />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders empty state with configure link when no forecast', () => {
    mockHook.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useStaffingForecast>);
    render(<StaffingForecastWidget />);
    expect(screen.getByText(/Configure ratios/i)).toBeInTheDocument();
  });

  it('renders table headers for each role', () => {
    mockHook.mockReturnValue({ data: SAMPLE_FORECAST, isLoading: false } as ReturnType<typeof useStaffingForecast>);
    render(<StaffingForecastWidget />);
    expect(screen.getByText('FOH')).toBeInTheDocument();
    expect(screen.getByText('BOH')).toBeInTheDocument();
  });

  it('renders recommended headcount for each day', () => {
    mockHook.mockReturnValue({ data: SAMPLE_FORECAST, isLoading: false } as ReturnType<typeof useStaffingForecast>);
    render(<StaffingForecastWidget />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows minimum 1 for zero-cover days', () => {
    mockHook.mockReturnValue({ data: SAMPLE_FORECAST, isLoading: false } as ReturnType<typeof useStaffingForecast>);
    render(<StaffingForecastWidget />);
    expect(screen.getByText('Tue')).toBeInTheDocument();
    // recommended is 1 for zero covers
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThan(0);
  });
});
```

`StaffingSettingsPanel.test.tsx` — mock `useStaffingConfig` + `useSaveStaffingConfig` + `useToast`, assert default roles render, save button disabled until dirty, add/remove role, mutate called on save.

**Step 6: Wire into pages**

In `Dashboard.tsx`, import `StaffingForecastWidget` and place below `ManagerAIUsageBar`.
In `WhatsAppSettingsPage.tsx`, import `StaffingSettingsPanel` and place below `ManagerNotificationsPanel`.

**Step 7: Run frontend suite**

```bash
cd client && npx vitest run
```

Expected: All tests pass.

**Step 8: TypeScript check**

```bash
cd client && npx tsc --noEmit
```

**Step 9: Commit**

```bash
git add client/src/hooks/useStaffingForecast.ts client/src/hooks/useStaffingConfig.ts \
  client/src/components/dashboard/StaffingForecastWidget.tsx \
  "client/src/components/dashboard/__tests__/StaffingForecastWidget.test.tsx" \
  client/src/components/dashboard/StaffingSettingsPanel.tsx \
  "client/src/components/dashboard/__tests__/StaffingSettingsPanel.test.tsx" \
  client/src/pages/Dashboard.tsx client/src/pages/WhatsAppSettingsPage.tsx
git commit -m "feat: add StaffingForecastWidget and StaffingSettingsPanel"
```

---

## Task 7: Full verification + CLAUDE.md update + push

**Step 1: Run full backend suite**

```bash
npx jest --forceExit
```

Expected: All tests pass.

**Step 2: Run full frontend suite**

```bash
cd client && npx vitest run
```

Expected: All tests pass.

**Step 3: TypeScript check**

```bash
cd client && npx tsc --noEmit
```

**Step 4: Update CLAUDE.md**

Add Phase 8 section after Phase 7:

```markdown
### Phase 8 — Staffing Intelligence ✅ COMPLETE
- [x] DB migration — staffing_config JSONB column on restaurant_config
- [x] staffingService.js — calculateStaffing (Math.ceil, min 1) + buildForecast
- [x] staffing-forecast.js — GET /api/staffing-forecast, 7-day array
- [x] staffing-config.js — GET/PATCH /api/staffing-config with role validation
- [x] restaurantSnapshot.js — [STAFFING FORECAST] block injected into Manager AI context
- [x] useStaffingForecast + useStaffingConfig hooks
- [x] StaffingForecastWidget — 7-day table on dashboard with skeleton/empty states
- [x] StaffingSettingsPanel — role ratio config UI in WhatsApp Settings page
```

**Step 5: Push**

```bash
git push
```
