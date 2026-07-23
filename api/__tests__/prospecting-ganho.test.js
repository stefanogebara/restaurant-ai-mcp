'use strict';

/**
 * 'ganho' — the terminal CLOSED WON state the prospect FSM never had.
 *
 * The bug it closes: a lead the founder closed OFFLINE (via the digest's wa.me
 * link) stayed in 'handoff', and the cold-handoff reclaim sweep would flip it
 * back to 'conversando' after 4 days — re-warming a paying customer with a sales
 * template. Everything here guards that: the state is silent, invisible to the
 * reclaim, honest in the funnel, and reachable in one tap (cockpit + signed link).
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));

const {
  SILENT_STATES, WON_STATE, deveResponder, elegivelParaReclaim,
} = require('../_lib/prospecting/prospect-state');
const { statusBucket, bucketCounts, BUCKETS } = require('../_lib/prospecting/prospect-admin-view');
const {
  signCloseToken, verifyCloseToken, closeUrlFor,
} = require('../_lib/prospecting/prospect-close-token');

const NOW = Date.parse('2026-07-23T14:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const LEAD = '3f7c1a2e-9b44-4d1e-8c77-2a5b6d0e1f33';
const SECRET = 'test-close-secret';

// ============================================================ FSM
describe('ganho is terminal + silent', () => {
  test('the agent never speaks to a won lead', () => {
    expect(WON_STATE).toBe('ganho');
    expect(SILENT_STATES.has('ganho')).toBe(true);
    expect(deveResponder('ganho')).toBe(false);
  });

  test('the cold-handoff reclaim can never pick up a won lead', () => {
    // THE regression this whole feature exists to prevent: a won customer
    // re-warmed with a sales template 4 days after the founder closed it.
    const r = elegivelParaReclaim({
      state: 'ganho',
      lastMsgDirecao: 'in',              // even the "lead came back muted" fast path
      lastInAtMs: NOW - 30 * DAY,        // even ice cold
      updatedAtMs: NOW - 30 * DAY,
      nowMs: NOW,
    });
    expect(r).toEqual({ eligible: false, reason: 'nao_handoff' });
  });
});

// ============================================================ funnel bucket
describe('statusBucket — won outranks every other signal', () => {
  test('a won lead is never shown as booked/handoff/replied', () => {
    expect(statusBucket({ prospect_state: 'ganho', whatsapp_send_status: 'replied' })).toBe('won');
    expect(statusBucket({ prospect_state: 'ganho', whatsapp_send_status: null })).toBe('won');
  });

  test('won is a first-class funnel bucket', () => {
    expect(BUCKETS).toContain('won');
    const c = bucketCounts([{ prospect_state: 'ganho' }, { prospect_state: 'ganho' }, { prospect_state: 'handoff' }]);
    expect(c.won).toBe(2);
    expect(c.handoff).toBe(1);
  });
});

// ============================================================ one-tap token
describe('prospect-close token — the credential in the founder digest', () => {
  test('round-trips a lead id and expiry', () => {
    const token = signCloseToken(LEAD, { nowMs: NOW, secret: SECRET });
    const r = verifyCloseToken(token, { nowMs: NOW, secret: SECRET });
    expect(r.valid).toBe(true);
    expect(r.leadId).toBe(LEAD);
    expect(r.expMs).toBeGreaterThan(NOW);
  });

  test('deterministic: same lead + same clock + same secret → same token', () => {
    expect(signCloseToken(LEAD, { nowMs: NOW, secret: SECRET }))
      .toBe(signCloseToken(LEAD, { nowMs: NOW, secret: SECRET }));
  });

  test('rejects a swapped lead id (signature covers it)', () => {
    const token = signCloseToken(LEAD, { nowMs: NOW, secret: SECRET });
    const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const forged = `${other}.${token.split('.')[1]}.${token.split('.')[2]}`;
    expect(verifyCloseToken(forged, { nowMs: NOW, secret: SECRET })).toEqual({ valid: false, reason: 'assinatura' });
  });

  test('rejects a stretched expiry, a tampered signature and a foreign secret', () => {
    const [id, exp, sig] = signCloseToken(LEAD, { nowMs: NOW, secret: SECRET }).split('.');
    expect(verifyCloseToken(`${id}.${Number(exp) + DAY}.${sig}`, { nowMs: NOW, secret: SECRET }).reason).toBe('assinatura');
    expect(verifyCloseToken(`${id}.${exp}.${sig}x`, { nowMs: NOW, secret: SECRET }).reason).toBe('assinatura');
    expect(verifyCloseToken(`${id}.${exp}.${sig}`, { nowMs: NOW, secret: 'outro-segredo' }).reason).toBe('assinatura');
  });

  test('expires — an archived digest stops working', () => {
    const token = signCloseToken(LEAD, { nowMs: NOW, ttlMs: DAY, secret: SECRET });
    expect(verifyCloseToken(token, { nowMs: NOW + DAY - 1000, secret: SECRET }).valid).toBe(true);
    expect(verifyCloseToken(token, { nowMs: NOW + DAY + 1000, secret: SECRET })).toEqual({ valid: false, reason: 'expirado' });
  });

  test('malformed input never throws and never validates', () => {
    for (const bad of [null, undefined, '', 'x', 'a.b', 'a.b.c.d', `nao-uuid.${NOW}.sig`]) {
      expect(verifyCloseToken(bad, { nowMs: NOW, secret: SECRET }).valid).toBe(false);
    }
    expect(signCloseToken('nao-e-uuid', { nowMs: NOW, secret: SECRET })).toBeNull();
  });

  test('no secret configured → no link minted, nothing validates', () => {
    const noEnv = { PROSPECTING_CLOSE_SECRET: process.env.PROSPECTING_CLOSE_SECRET, CRON_SECRET: process.env.CRON_SECRET };
    delete process.env.PROSPECTING_CLOSE_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(signCloseToken(LEAD, { nowMs: NOW })).toBeNull();
      expect(verifyCloseToken('anything', { nowMs: NOW })).toEqual({ valid: false, reason: 'sem_segredo' });
    } finally {
      if (noEnv.PROSPECTING_CLOSE_SECRET) process.env.PROSPECTING_CLOSE_SECRET = noEnv.PROSPECTING_CLOSE_SECRET;
      if (noEnv.CRON_SECRET) process.env.CRON_SECRET = noEnv.CRON_SECRET;
    }
  });

  test('closeUrlFor builds an absolute, url-encoded link', () => {
    const url = closeUrlFor(LEAD, { baseUrl: 'https://seatable.one/', nowMs: NOW, secret: SECRET });
    expect(url.startsWith('https://seatable.one/api/prospect-close?t=')).toBe(true);
    const token = decodeURIComponent(url.split('t=')[1]);
    expect(verifyCloseToken(token, { nowMs: NOW, secret: SECRET }).leadId).toBe(LEAD);
  });
});

// ============================================================ store mutation
describe('markLeadWon — the guarded transition', () => {
  function mockSupabase({ before, beforeError = null, updateRows = null, updateError = null } = {}) {
    const updates = [];
    const from = jest.fn(() => {
      let isUpdate = false;
      const api = {
        update: jest.fn((payload) => { isUpdate = true; updates.push(payload); return api; }),
        // select() is the terminal await on the update chain, but a link in the read chain
        select: jest.fn(() => (isUpdate
          ? Promise.resolve(updateError
            ? { data: null, error: { message: updateError } }
            : { data: updateRows, error: null })
          : api)),
        eq: jest.fn(() => api),
        neq: jest.fn(() => api),
        single: jest.fn(async () => (beforeError
          ? { data: null, error: { message: beforeError } }
          : { data: before, error: null })),
      };
      return api;
    });
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from } }));
    return { updates };
  }

  beforeEach(() => jest.resetModules());
  afterEach(() => jest.resetModules());

  test('handoff → ganho, clearing every proactive rail', async () => {
    const { updates } = mockSupabase({
      before: { id: LEAD, name: 'Cantina Bella', prospect_state: 'handoff' },
      updateRows: [{ id: LEAD, name: 'Cantina Bella', prospect_state: 'ganho' }],
    });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    const r = await markLeadWon(LEAD);
    expect(r).toMatchObject({ ok: true, updated: true, already: false });
    expect(updates[0]).toEqual({
      prospect_state: 'ganho', status: 'cliente',
      next_touch_at: null, nudge_em: null, reply_apos: null,
    });
  });

  test('an opted-out lead is refused (LGPD wins, no write attempted)', async () => {
    const { updates } = mockSupabase({ before: { id: LEAD, name: 'X', prospect_state: 'optout' } });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    const r = await markLeadWon(LEAD);
    expect(r).toMatchObject({ ok: false, updated: false, reason: 'optout' });
    expect(updates).toHaveLength(0);
  });

  test('already won → idempotent, no second write (so no duplicate outcome/event)', async () => {
    const { updates } = mockSupabase({ before: { id: LEAD, name: 'X', prospect_state: 'ganho' } });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    const r = await markLeadWon(LEAD);
    expect(r).toMatchObject({ ok: true, updated: false, already: true });
    expect(updates).toHaveLength(0);
  });

  test('unknown lead → nao_encontrado, never a silent success', async () => {
    mockSupabase({ before: null, beforeError: 'no rows' });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    expect(await markLeadWon(LEAD)).toMatchObject({ ok: false, reason: 'nao_encontrado' });
  });

  test('lost the state race (0 rows updated) → conflito, not a fake win', async () => {
    mockSupabase({ before: { id: LEAD, name: 'X', prospect_state: 'handoff' }, updateRows: [] });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    expect(await markLeadWon(LEAD)).toMatchObject({ ok: false, updated: false, reason: 'conflito' });
  });

  test('a DB error surfaces as a failure', async () => {
    mockSupabase({ before: { id: LEAD, name: 'X', prospect_state: 'handoff' }, updateError: 'boom' });
    const { markLeadWon } = require('../_lib/prospecting/prospect-store');
    expect(await markLeadWon(LEAD)).toMatchObject({ ok: false, reason: 'erro' });
  });
});

// ============================================================ public endpoint
describe('/api/prospect-close — unauthenticated, token-authorized', () => {
  const LEAD_ROW = { id: LEAD, name: 'Cantina Bella', city: 'São Paulo', prospect_state: 'handoff' };

  function load({ lead = LEAD_ROW, markResult } = {}) {
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
    jest.doMock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn(async () => false) }));
    const markLeadWon = jest.fn(async () => markResult
      || { ok: true, updated: true, already: false, reason: null, lead: { ...lead, prospect_state: 'ganho' } });
    const recordEvent = jest.fn(async () => ({ stored: true }));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({ markLeadWon, recordEvent }));
    const single = jest.fn(async () => ({ data: lead, error: null }));
    const from = jest.fn(() => {
      const api = { select: () => api, eq: () => api, single };
      return api;
    });
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from } }));
    return { handler: require('../prospect-close'), markLeadWon, recordEvent, single };
  }

  function mockRes() {
    const r = { statusCode: null, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.statusCode = c; return r; };
    r.send = (b) => { r.body = b; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }

  let token;
  beforeEach(() => {
    jest.resetModules();
    process.env.PROSPECTING_CLOSE_SECRET = SECRET;
    token = signCloseToken(LEAD, { secret: SECRET });
  });
  afterEach(() => { jest.resetModules(); delete process.env.PROSPECTING_CLOSE_SECRET; });

  test('GET only CONFIRMS — a mail scanner prefetch must not close a deal', async () => {
    const { handler, markLeadWon } = load();
    const res = mockRes();
    await handler({ method: 'GET', query: { t: token }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Cantina Bella');
    expect(res.body).toContain('<form method="POST"');
    expect(markLeadWon).not.toHaveBeenCalled(); // the whole point of the GET/POST split
  });

  test('POST with a valid token marks the lead won and logs the event', async () => {
    const { handler, markLeadWon, recordEvent } = load();
    const res = mockRes();
    await handler({ method: 'POST', body: { t: token }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(markLeadWon).toHaveBeenCalledWith(LEAD);
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(res.body).toContain('Fechado');
  });

  test('a forged token never reaches the database', async () => {
    const { handler, markLeadWon, single } = load();
    const res = mockRes();
    const [id, exp] = token.split('.');
    await handler({ method: 'POST', body: { t: `${id}.${exp}.assinaturafalsa` }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(markLeadWon).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
  });

  test('an expired link is gone (410), not silently accepted', async () => {
    const { handler, markLeadWon } = load();
    const stale = signCloseToken(LEAD, { nowMs: NOW - 400 * DAY, secret: SECRET });
    const res = mockRes();
    await handler({ method: 'POST', body: { t: stale }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(410);
    expect(markLeadWon).not.toHaveBeenCalled();
  });

  test('opted-out lead → 409 and no event written', async () => {
    const { handler, recordEvent } = load({
      markResult: { ok: false, updated: false, already: false, reason: 'optout', lead: LEAD_ROW },
    });
    const res = mockRes();
    await handler({ method: 'POST', body: { t: token }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(409);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  test('re-tapping the same link is idempotent — no duplicate event', async () => {
    const { handler, recordEvent } = load({
      markResult: { ok: true, updated: false, already: true, reason: null, lead: LEAD_ROW },
    });
    const res = mockRes();
    await handler({ method: 'POST', body: { t: token }, query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Já estava marcado');
    expect(recordEvent).not.toHaveBeenCalled();
  });

  test('other verbs are refused', async () => {
    const { handler } = load();
    const res = mockRes();
    await handler({ method: 'DELETE', query: { t: token }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
