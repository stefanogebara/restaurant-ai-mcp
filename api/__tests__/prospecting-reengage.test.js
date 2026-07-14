/**
 * Re-engagement after the 24h window (touch 4 'resgate') + WA management
 * template payload builder.
 *
 * Guards the load-bearing contracts: reengage only fires with an active
 * touch-4 template, only when WE spoke last with a NON-template message
 * (once per silence period), respects opt-out/caps, and the Graph template
 * payload builder validates/sanitizes before anything reaches Meta review.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { buildTemplatePayload } = require('../_lib/prospecting/wa-management');

// ============================================================ template payload
describe('buildTemplatePayload — Graph template creation (pure)', () => {
  test('builds a marketing template with param example and https button', () => {
    const r = buildTemplatePayload({
      name: 'Olimpia Intro V2', bodyText: 'Oi! Vi o {{1}} no Google Maps.',
      exampleParam: 'Cantina Bella', buttonText: 'Conhecer a Seatable', buttonUrl: 'https://seatable.one',
    });
    expect(r.ok).toBe(true);
    expect(r.payload.name).toBe('olimpia_intro_v2');
    expect(r.payload.category).toBe('MARKETING');
    const body = r.payload.components.find((c) => c.type === 'BODY');
    expect(body.example.body_text).toEqual([['Cantina Bella']]);
    const buttons = r.payload.components.find((c) => c.type === 'BUTTONS');
    expect(buttons.buttons[0]).toMatchObject({ type: 'URL', url: 'https://seatable.one' });
  });

  test('no {{1}} → no example block; no button → single component', () => {
    const r = buildTemplatePayload({ name: 'x', bodyText: 'corpo fixo sem parametro' });
    expect(r.ok).toBe(true);
    expect(r.payload.components).toHaveLength(1);
    expect(r.payload.components[0].example).toBeUndefined();
  });

  test('rejects missing body, oversize body, and non-https button', () => {
    expect(buildTemplatePayload({ name: 'x', bodyText: '' }).ok).toBe(false);
    expect(buildTemplatePayload({ name: 'x', bodyText: 'a'.repeat(1025) }).ok).toBe(false);
    expect(buildTemplatePayload({ name: 'x', bodyText: 'ok', buttonUrl: 'http://insecure.com' }).ok).toBe(false);
  });

  test('unknown category falls back to MARKETING', () => {
    const r = buildTemplatePayload({ name: 'x', bodyText: 'ok', category: 'AUTHENTICATION' });
    expect(r.payload.category).toBe('MARKETING');
  });
});

// ============================================================ dispatchReengages
describe('dispatchReengages — replied-then-silent leads past the 24h window', () => {
  const lead = { id: 'L9', name: 'Bistrô Central', whatsapp_phone: '+5511988887777', prospect_state: 'conversando' };

  function mockDeps({ lastMessage, templates, sendResult, claimRows } = {}) {
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info(){}, warn(){}, error(){}, debug(){} }) }));
    jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => 'PNUM' }));
    jest.doMock('../_lib/prospecting/prospect-warmup', () => ({ consumeSendSlot: jest.fn(async () => ({ allowed: true, count: 1, cap: 40 })) }));
    jest.doMock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
    const sendTemplateMessage = jest.fn(async () => sendResult || { success: true, messageId: 'wamid-r1' });
    jest.doMock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage }));
    const storeMessage = jest.fn(async () => ({ stored: true }));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({
      isOptedOut: async () => false,
      selectIntroCandidates: async () => [],
      selectDueTouches: async () => [],
      selectDueReengages: async () => [lead],
      loadLastMessage: async () => (lastMessage === undefined
        ? { direcao: 'out', tipo: 'text', corpo: 'oi, ficou de me falar', enviada_em: new Date().toISOString() }
        : lastMessage),
      listTemplates: async (touch) => (templates !== undefined ? templates : (touch === 4
        ? [{ touch_number: 4, variant_label: 'A', meta_template_name: 'olimpia_resgate', template_lang: 'pt_BR', active: true }]
        : [])),
      claimIntro: async () => true, markIntro: async () => ({}), patchLead: async () => ({}),
      storeMessage,
      REENGAGE_STATES: ['conversando', 'agendando'],
      selectReferralIntroCandidates: async () => [],
    }));
    // The snooze-claim RPC (claim_prospect_reengage): true = claimed,
    // null = lost the race / state changed.
    const rpc = jest.fn(async () => ({
      data: claimRows !== undefined ? (claimRows.length > 0 ? true : null) : true,
      error: null,
    }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), rpc } }));
    return { sendTemplateMessage, storeMessage, rpc };
  }

  beforeEach(() => { jest.resetModules(); process.env.PROSPECTING_DRY_RUN = 'false'; });
  afterEach(() => { jest.resetModules(); delete process.env.PROSPECTING_DRY_RUN; });

  test('sends the resgate template and logs it as a template message', async () => {
    const { sendTemplateMessage, storeMessage, rpc } = mockDeps({});
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.sent).toBe(1);
    expect(sendTemplateMessage).toHaveBeenCalledWith(
      '+5511988887777', 'olimpia_resgate', 'pt_BR', ['Bistrô Central'], { phoneNumberId: 'PNUM' });
    expect(storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'L9', tipo: 'template', corpo: '[template:olimpia_resgate]',
    }));
    // The claim goes through the RPC — the old UPDATE + or= claim 42703'd on
    // this project's PostgREST and NEVER succeeded (zero resgates ever sent).
    expect(rpc).toHaveBeenCalledWith('claim_prospect_reengage', expect.objectContaining({
      p_lead_id: 'L9',
    }));
  });

  test('REENGAGE_STATES (real store) covers conversando AND agendando', () => {
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));
    const { REENGAGE_STATES } = require('../_lib/prospecting/prospect-store');
    expect(REENGAGE_STATES).toEqual(['conversando', 'agendando']);
  });

  test('no active touch-4 template → clean no-op with noTemplate flag', async () => {
    const { sendTemplateMessage } = mockDeps({ templates: [] });
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.noTemplate).toBe(true);
    expect(s.sent).toBe(0);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('last message already a template → skip (once per silence period)', async () => {
    const { sendTemplateMessage } = mockDeps({
      lastMessage: { direcao: 'out', tipo: 'template', corpo: '[template:olimpia_resgate]' },
    });
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.sent).toBe(0);
    expect(s.skipped).toBe(1);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('lead spoke last + ≥3d silence → resgate fires (outage-orphan rescue)', async () => {
    // The selector only returns leads ≥3 days silent, so the 24h window is
    // closed and the responder CANNOT free-text — the template is the only
    // channel. The old skip-on-inbound-last stranded 14 real leads whose
    // replies fell into the Jul/10-11 outage.
    const { sendTemplateMessage } = mockDeps({
      lastMessage: { direcao: 'in', tipo: 'text', corpo: 'me chama semana que vem' },
    });
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.sent).toBe(1);
    expect(sendTemplateMessage).toHaveBeenCalledWith(
      '+5511988887777', 'olimpia_resgate', 'pt_BR', ['Bistrô Central'], { phoneNumberId: 'PNUM' });
  });

  test('lost the snooze claim (concurrent run) → skip without sending', async () => {
    const { sendTemplateMessage } = mockDeps({ claimRows: [] });
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.sent).toBe(0);
    expect(s.skipped).toBe(1);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  test('dry-run → nothing leaves the building', async () => {
    process.env.PROSPECTING_DRY_RUN = 'true';
    const { sendTemplateMessage } = mockDeps({});
    const { dispatchReengages } = require('../_lib/prospecting/sequencer');
    const s = await dispatchReengages({ limit: 5 });
    expect(s.dryRun).toBe(true);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });
});

// ============================================================ claimInbound RPC
// Both atomic claims moved to RPCs because this project's PostgREST 42703s any
// UPDATE carrying an or= filter (claimInbound failed on EVERY inbound Jul 3-13,
// masked by degrade-open). These pin the RPC contract.
describe('claimInbound — per-inbound claim via claim_prospect_inbound RPC', () => {
  function mockRpc(result) {
    const rpc = jest.fn(async () => result);
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), rpc } }));
    return rpc;
  }

  beforeEach(() => {
    jest.resetModules();
    // The dispatchReengages block doMocks the whole store — undo it here so
    // this block exercises the REAL claimInbound.
    jest.dontMock('../_lib/prospecting/prospect-store');
  });
  afterEach(() => jest.resetModules());

  test('rpc true → this caller owns the reply', async () => {
    const rpc = mockRpc({ data: true, error: null });
    const { claimInbound } = require('../_lib/prospecting/prospect-store');
    await expect(claimInbound('L1', 'wamid.X==')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('claim_prospect_inbound', { p_lead_id: 'L1', p_wamid: 'wamid.X==' });
  });

  test('rpc null (same wamid already claimed) → false, the loser skips', async () => {
    mockRpc({ data: null, error: null });
    const { claimInbound } = require('../_lib/prospecting/prospect-store');
    await expect(claimInbound('L1', 'wamid.X==')).resolves.toBe(false);
  });

  test('infra error → degrade OPEN (a DB hiccup never mutes the agent)', async () => {
    mockRpc({ data: null, error: { message: 'boom' } });
    const { claimInbound } = require('../_lib/prospecting/prospect-store');
    await expect(claimInbound('L1', 'wamid.X==')).resolves.toBe(true);
  });
});
