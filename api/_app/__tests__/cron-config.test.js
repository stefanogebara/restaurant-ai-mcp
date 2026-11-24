/**
 * Tests for Phase U.3 cron kill switch.
 *
 * The helper is intentionally fail-open: any DB error, missing row, or
 * unexpected exception returns enabled=true. We'd rather over-run a
 * cron during a transient Supabase blip than silently miss critical
 * work (post-visit feedback, no-show flagging, briefings).
 */

const mockMaybeSingle = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: () => mockMaybeSingle(),
    })),
  },
}));

const { isCronEnabled, getCronConfig } = require('../_lib/cron-config');

describe('cron-config kill switch', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
  });

  test('returns enabled=true when no row exists (legacy default)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await isCronEnabled('uninstalled-cron')).toBe(true);
  });

  test('returns enabled=false when row.enabled=false (kill switch hit)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { enabled: false, max_tenants_per_run: null, notes: 'paused for review' },
      error: null,
    });
    expect(await isCronEnabled('send-reminders')).toBe(false);
  });

  test('returns enabled=true when row.enabled=true', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { enabled: true, max_tenants_per_run: null, notes: null },
      error: null,
    });
    expect(await isCronEnabled('send-reminders')).toBe(true);
  });

  test('fails open on Supabase error (returns enabled=true)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    expect(await isCronEnabled('send-reminders')).toBe(true);
  });

  test('fails open if the lookup throws', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('PostgREST down'));
    expect(await isCronEnabled('send-reminders')).toBe(true);
  });

  test('getCronConfig exposes max_tenants_per_run + notes', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { enabled: true, max_tenants_per_run: 25, notes: 'rate-limited to 25' },
      error: null,
    });
    const cfg = await getCronConfig('manager-briefings');
    expect(cfg).toEqual({
      enabled: true,
      maxTenantsPerRun: 25,
      notes: 'rate-limited to 25',
    });
  });

  test('treats non-boolean enabled as truthy-coerced to strict-boolean', async () => {
    // Guards against a DB row that somehow ended up with `enabled = NULL`
    // (shouldn't happen — column is NOT NULL with default true — but if
    // it ever does, we don't want a truthy 'null' surprising us).
    mockMaybeSingle.mockResolvedValueOnce({
      data: { enabled: null, max_tenants_per_run: null, notes: null },
      error: null,
    });
    expect(await isCronEnabled('weird-row')).toBe(false);
  });
});
