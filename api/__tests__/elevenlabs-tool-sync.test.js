'use strict';

// Own agents keep the tool definitions they were created with. After audit F4
// the guest tools changed (lookup needs code + phone; change/cancel refused by
// phone). syncAgentTools brings the three guest tools to the current
// definitions, sending the full config and reading each tool back.

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {} }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

const { buildToolDefinitions } = require('../_services/elevenlabsAgentService');
const { planToolSync, syncAgentTools, GUEST_TOOLS } = require('../_lib/elevenlabs-tool-sync');

const BASE = 'https://seatable.one';
const config = { id: '152dc287-46e6-4139-b8eb-12d1877b121f', restaurant_name: 'Osteria del Sole', elevenlabs_webhook_secret: 'el_whsec_test_secret' };
const current = buildToolDefinitions(BASE, config.id, config.elevenlabs_webhook_secret);

// The pre-F4 lookup: by phone or name, no code field.
const oldLookup = {
  ...current.find(t => t.name === 'lookup_reservation'),
  description: 'Find an existing reservation by customer phone number or name.',
  api_schema: { ...current.find(t => t.name === 'lookup_reservation').api_schema,
    request_body_schema: { type: 'object', properties: { customer_phone: { type: 'string' }, customer_name: { type: 'string' } } } },
};
const oldCancel = { ...current.find(t => t.name === 'cancel_reservation'), description: 'Cancel an existing reservation by ID.' };

function storeFrom(defs) {
  const tools = new Map(defs.map((def, i) => [`tool_${String(i).padStart(4, '0')}`, { id: `tool_${String(i).padStart(4, '0')}`, tool_config: def }]));
  const agent = { conversation_config: { agent: { prompt: { tool_ids: [...tools.keys()] } } } };
  const fetchImpl = jest.fn(async (url, init = {}) => {
    const id = url.split('/').pop();
    if (init.method === 'PATCH') {
      tools.set(id, { id, tool_config: JSON.parse(init.body).tool_config });
      return { ok: true, json: async () => tools.get(id) };
    }
    return tools.has(id) ? { ok: true, json: async () => tools.get(id) } : { ok: false, status: 404, json: async () => ({}) };
  });
  return { tools, agent, fetchImpl };
}
const withOld = () => current.map(t => (t.name === 'lookup_reservation' ? oldLookup : t.name === 'cancel_reservation' ? oldCancel : t));

describe('planToolSync', () => {
  test('current definitions are in sync', () => {
    const plan = planToolSync(config, current.map((t, i) => ({ id: `t${i}`, tool_config: t })), buildToolDefinitions, BASE);
    expect(plan).toMatchObject({ status: 'ok', changes: [] });
  });

  test('pre-F4 lookup and cancel are outdated, with the full current config ready', () => {
    const plan = planToolSync(config, withOld().map((t, i) => ({ id: `t${i}`, tool_config: t })), buildToolDefinitions, BASE);
    expect(plan.status).toBe('outdated');
    expect(plan.changes.map(c => c.name).sort()).toEqual(['cancel_reservation', 'lookup_reservation']);
    const lookup = plan.changes.find(c => c.name === 'lookup_reservation').config;
    expect(lookup.api_schema.request_body_schema.required).toEqual(['reservation_id', 'customer_phone']);
    expect(lookup.api_schema.request_headers).toEqual({ Authorization: 'Bearer el_whsec_test_secret' });
  });

  test('a missing or duplicated guest tool, or no secret, is reported and never patched', () => {
    const missing = current.filter(t => t.name !== 'modify_reservation').map((t, i) => ({ id: `t${i}`, tool_config: t }));
    expect(planToolSync(config, missing, buildToolDefinitions, BASE)).toMatchObject({ status: 'invalid', changes: [] });
    const dup = [...current, current.find(t => t.name === 'cancel_reservation')].map((t, i) => ({ id: `t${i}`, tool_config: t }));
    expect(planToolSync(config, dup, buildToolDefinitions, BASE).status).toBe('invalid');
    expect(planToolSync({ ...config, elevenlabs_webhook_secret: null }, [], buildToolDefinitions, BASE).status).toBe('invalid');
  });

  test('only the three guest tools are considered', () => {
    expect(GUEST_TOOLS).toEqual(['lookup_reservation', 'cancel_reservation', 'modify_reservation']);
  });
});

describe('syncAgentTools', () => {
  const originalEnv = process.env.VERCEL_ENV;
  beforeAll(() => { process.env.VERCEL_ENV = 'production'; });
  afterAll(() => { process.env.VERCEL_ENV = originalEnv; });

  test('report mode only reads', async () => {
    const { agent, fetchImpl } = storeFrom(withOld());
    const result = await syncAgentTools(config, agent, 'k', { buildToolDefinitions, fetchImpl });
    expect(result).toMatchObject({ changed: false, plan: { status: 'outdated' } });
    expect(fetchImpl.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  test('apply patches only the outdated guest tools, with the full config, and verifies', async () => {
    const { tools, agent, fetchImpl } = storeFrom(withOld());
    const result = await syncAgentTools(config, agent, 'k', { buildToolDefinitions, apply: true, fetchImpl });
    expect(result.changed).toBe(true);
    expect(result.after.status).toBe('ok');
    const patches = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches).toHaveLength(2);
    for (const [, init] of patches) {
      const body = JSON.parse(init.body).tool_config;
      expect(body.type).toBe('webhook');
      expect(body.api_schema.url).toMatch(/^https:\/\/seatable\.one\/api\/elevenlabs-webhook\?action=/);
      expect(body.api_schema.request_headers.Authorization).toBe('Bearer el_whsec_test_secret');
    }
    expect([...tools.values()].find(t => t.tool_config.name === 'get_current_datetime').tool_config)
      .toEqual(current.find(t => t.name === 'get_current_datetime'));
  });

  test('a tool that reads back unchanged stops the sync', async () => {
    const { agent } = storeFrom(withOld());
    const stuck = jest.fn(async (url, init = {}) => {
      const id = url.split('/').pop();
      const def = withOld()[Number(id.split('_')[1])];
      return { ok: true, json: async () => ({ id, tool_config: def }) };
    });
    await expect(syncAgentTools(config, agent, 'k', { buildToolDefinitions, apply: true, fetchImpl: stuck }))
      .rejects.toThrow(/did not read back/);
  });

  test('a read-back with another restaurant secret stops the sync', async () => {
    const { agent, tools } = storeFrom(withOld());
    const swap = jest.fn(async (url, init = {}) => {
      const id = url.split('/').pop();
      if (init.method === 'PATCH') {
        const cfg = JSON.parse(init.body).tool_config;
        tools.set(id, { id, tool_config: { ...cfg, api_schema: { ...cfg.api_schema, request_headers: { Authorization: 'Bearer el_whsec_OTHER' } } } });
      }
      return { ok: true, json: async () => tools.get(id) };
    });
    await expect(syncAgentTools(config, agent, 'k', { buildToolDefinitions, apply: true, fetchImpl: swap }))
      .rejects.toThrow(/different secret/);
  });
});
