/**
 * Referral flow: registrar_responsavel → own lead (source='indicacao') →
 * auto-intro via dispatchReferralIntros.
 *
 * Guards the load-bearing contracts: number normalization/validation before
 * any row exists, suppression-list check BEFORE creation, 9th-digit-aware
 * dedup, no google_place_id inheritance (UNIQUE), and the dispatcher honoring
 * dry-run / kill switches / dispatch window / warm-up cap like every other
 * cold send. (Context: the first live campaign captured 5 owner numbers and
 * all 5 died inside handoff_motivo — this flow is why that can't recur.)
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

// ============================================================ createReferralLead
describe('createReferralLead — referred number becomes its own lead', () => {
  const fromLead = {
    id: 'L1',
    name: 'Cantina Mineira',
    sector: 'italian',
    address: 'R. X, 1',
    neighborhood: 'Centro',
    city: 'São Paulo, SP',
    uf: 'SP',
    website: 'https://cantina.example',
    rating: 4.5,
    reviews_count: 120,
    lead_score: 5,
    whatsapp_phone: '+5511988887777',
  };

  function mockSupabase({ optedOut = false, existing = null, insertError = null } = {}) {
    const inserts = [];
    const from = jest.fn((table) => {
      const api = {
        select: jest.fn(() => api),
        in: jest.fn(() => api),
        or: jest.fn(() => api),
        eq: jest.fn(() => api),
        is: jest.fn(() => api),
        not: jest.fn(() => api),
        order: jest.fn(() => api),
        insert: jest.fn((payload) => { inserts.push({ table, payload }); return api; }),
        single: jest.fn(async () => (insertError
          ? { data: null, error: { message: insertError } }
          : { data: { id: 'NEW1' }, error: null })),
        limit: jest.fn(async () => {
          if (table === 'prospect_optout') return { data: optedOut ? [{ id: 'o1' }] : [], error: null };
          if (table === 'prospect_leads') return { data: existing ? [existing] : [], error: null };
          return { data: [], error: null };
        }),
      };
      return api;
    });
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from } }));
    return { from, inserts };
  }

  beforeEach(() => jest.resetModules());
  afterEach(() => jest.resetModules());

  test('happy path: normalized E.164, source=indicacao, no google_place_id', async () => {
    const { inserts } = mockSupabase({});
    const { createReferralLead } = require('../_lib/prospecting/prospect-store');
    const r = await createReferralLead(fromLead, '(11) 95913-6656', 'Miguel');
    expect(r).toEqual({ ok: true, created: true, leadId: 'NEW1' });
    expect(inserts).toHaveLength(1);
    const payload = inserts[0].payload;
    expect(payload).toMatchObject({
      name: 'Cantina Mineira',
      source: 'indicacao',
      owner_name: 'Miguel',
      whatsapp_phone: '+5511959136656',
      whatsapp_status: 'found',
    });
    expect(payload).not.toHaveProperty('google_place_id');
    expect(payload.conversa_fatos.nome_responsavel).toBe('Miguel');
    expect(payload.conversa_fatos.notas[0]).toContain('indicad');
  });

  test('un-normalizable number → numero_invalido, nothing inserted', async () => {
    const { inserts } = mockSupabase({});
    const { createReferralLead } = require('../_lib/prospecting/prospect-store');
    const r = await createReferralLead(fromLead, '0800 123', null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('numero_invalido');
    expect(inserts).toHaveLength(0);
  });

  test('suppression list wins BEFORE any row is created (LGPD)', async () => {
    const { inserts } = mockSupabase({ optedOut: true });
    const { createReferralLead } = require('../_lib/prospecting/prospect-store');
    const r = await createReferralLead(fromLead, '11959136656', null);
    expect(r).toEqual({ ok: false, reason: 'optedout' });
    expect(inserts).toHaveLength(0);
  });

  test('existing lead on the same line → dedup, returns its id', async () => {
    const { inserts } = mockSupabase({ existing: { id: 'OLD7' } });
    const { createReferralLead } = require('../_lib/prospecting/prospect-store');
    const r = await createReferralLead(fromLead, '+5511959136656', 'Miguel');
    expect(r).toEqual({ ok: false, reason: 'exists', leadId: 'OLD7' });
    expect(inserts).toHaveLength(0);
  });

  test('insert failure surfaces as reason=insert, never throws', async () => {
    mockSupabase({ insertError: 'boom' });
    const { createReferralLead } = require('../_lib/prospecting/prospect-store');
    const r = await createReferralLead(fromLead, '11959136656', null);
    expect(r).toEqual({ ok: false, reason: 'insert' });
  });
});

// ============================================================ dispatchReferralIntros
describe('dispatchReferralIntros — auto-intro to referred owners', () => {
  const refLead = { id: 'R1', name: 'Cantina Mineira', whatsapp_phone: '+5511959136656', whatsapp_status: 'found' };
  // Tuesday 2026-07-07 15:00 BRT — inside the 10-17 weekday dispatch window.
  const IN_WINDOW = new Date('2026-07-07T15:00:00-03:00').getTime();
  // Sunday 2026-07-12 15:00 BRT — outside (weekend).
  const OFF_WINDOW = new Date('2026-07-12T15:00:00-03:00').getTime();

  function mockDeps({ candidates, optedOut = false, slotAllowed = true, templates } = {}) {
    jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => 'PNUM' }));
    const consumeSendSlot = jest.fn(async () => (slotAllowed
      ? { allowed: true, count: 1, cap: 40 }
      : { allowed: false, count: 40, cap: 40 }));
    jest.doMock('../_lib/prospecting/prospect-warmup', () => ({ consumeSendSlot }));
    jest.doMock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
    const sendTemplateMessage = jest.fn(async () => ({ success: true, messageId: 'wamid-ref1' }));
    jest.doMock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage }));
    const markIntro = jest.fn(async () => ({}));
    const patchLead = jest.fn(async () => ({}));
    const storeMessage = jest.fn(async () => ({}));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({
      isOptedOut: async () => optedOut,
      selectIntroCandidates: async () => [],
      selectReferralIntroCandidates: jest.fn(async () => (candidates !== undefined ? candidates : [refLead])),
      selectDueTouches: async () => [],
      selectDueReengages: async () => [],
      loadLastMessage: async () => null,
      listTemplates: async (touch) => (templates !== undefined ? templates : (touch === 1
        ? [{ touch_number: 1, variant_label: 'A', meta_template_name: 'olimpia_apresentacao', template_lang: 'pt_BR', active: true }]
        : [])),
      claimIntro: async () => true,
      markIntro, patchLead, storeMessage,
      REENGAGE_STATES: ['conversando', 'agendando'],
    }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));
    return { sendTemplateMessage, markIntro, patchLead, storeMessage, consumeSendSlot };
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.PROSPECTING_DRY_RUN = 'false';
    delete process.env.PROSPECTING_INTRO_TEMPLATE; // no env fallback for the no-template test
    delete process.env.PROSPECTING_IGNORE_HOURS;
  });
  afterEach(() => { jest.resetModules(); delete process.env.PROSPECTING_DRY_RUN; });

  test('sends the touch-1 template and arms the follow-up cadence', async () => {
    const { sendTemplateMessage, markIntro, patchLead, storeMessage } = mockDeps({});
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: IN_WINDOW });
    expect(s.sent).toBe(1);
    expect(sendTemplateMessage).toHaveBeenCalledWith(
      '+5511959136656', 'olimpia_apresentacao', 'pt_BR', ['Cantina Mineira'], { phoneNumberId: 'PNUM' });
    expect(markIntro).toHaveBeenCalledWith('R1', { status: 'sent', wamid: 'wamid-ref1' });
    expect(patchLead).toHaveBeenCalledWith('R1', expect.objectContaining({ touch_count: 1 }));
    expect(storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'R1', tipo: 'template', corpo: '[template:olimpia_apresentacao]',
    }));
  });

  test('outside the dispatch window → clean no-op, flush retries later', async () => {
    const { sendTemplateMessage } = mockDeps({});
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: OFF_WINDOW });
    expect(s.outsideWindow).toBe(true);
    expect(s.sent).toBe(0);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('dry-run → nothing leaves the building', async () => {
    process.env.PROSPECTING_DRY_RUN = 'true';
    const { sendTemplateMessage } = mockDeps({});
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: IN_WINDOW });
    expect(s.dryRun).toBe(true);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('opted-out referral → skipped, never contacted', async () => {
    const { sendTemplateMessage } = mockDeps({ optedOut: true });
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: IN_WINDOW });
    expect(s.skipped).toBe(1);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('warm-up cap exhausted → blocked with capHit, no send', async () => {
    const { sendTemplateMessage } = mockDeps({ slotAllowed: false });
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: IN_WINDOW });
    expect(s.blocked).toBe(1);
    expect(s.capHit).toBe(true);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('no active intro template → halted visibly, not sent blind', async () => {
    const { sendTemplateMessage } = mockDeps({ templates: [] });
    const { dispatchReferralIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReferralIntros({ limit: 1, nowMs: IN_WINDOW });
    expect(s.skipped).toBe(1);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });
});
