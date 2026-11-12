'use strict';

// A restaurant's agent_language changed in the database never reached its
// ElevenLabs agent (Osteria del Sole, 2026-11-12: database 'pt', agent 'en').
// planLanguageSync decides what one PATCH must change; the script reads every
// agent, and writes only for the one restaurant named with --apply.

const { planLanguageSync } = require('../_lib/elevenlabs-language-sync');
const { run, parseArgs } = require('../../scripts/elevenlabs-agent-language-sync.cjs');

const osteria = { id: '152dc287-46e6-4139-b8eb-12d1877b121f', restaurant_name: 'Osteria del Sole', country: 'Brazil',
  agent_language: 'pt', agent_greeting: null, elevenlabs_agent_id: 'agent_osteria_0001', ai_config: { language: 'pt-BR' } };
const agent = (language, model = 'eleven_flash_v2', summary = 'en') => ({
  conversation_config: { agent: { language, first_message: 'Thank you for calling.' }, tts: { model_id: model } },
  platform_settings: { summary_language: summary },
});
const deps = { buildPersonaPrompt: config => `PROMPT(${config.agent_language})` };

describe('planLanguageSync', () => {
  test('an English agent for a Portuguese restaurant gets language, model, summary, greeting and prompt in one patch', () => {
    const plan = planLanguageSync(osteria, agent('en'), deps);
    expect(plan.status).toBe('mismatch');
    expect(plan.patch).toEqual({
      conversation_config: {
        agent: { language: 'pt', first_message: 'Obrigado por ligar para Osteria del Sole. Como posso ajudá-lo hoje?', prompt: { prompt: 'PROMPT(pt)' } },
        tts: { model_id: 'eleven_flash_v2_5' },
      },
      platform_settings: { summary_language: 'pt-br' },
    });
  });

  test('the dashboard value pt-BR reaches the agent as pt, with the Brazilian summary', () => {
    const plan = planLanguageSync({ ...osteria, agent_language: 'pt-BR' }, agent('en'), deps);
    expect(plan.patch.conversation_config.agent.language).toBe('pt');
    expect(plan.patch.platform_settings.summary_language).toBe('pt-br');
    expect(plan.patch.conversation_config.agent.first_message).toMatch(/^Obrigado por ligar/);
  });

  test('an owner greeting is kept', () => {
    const plan = planLanguageSync({ ...osteria, agent_greeting: 'Olá, Osteria!' }, agent('en'), deps);
    expect(plan.patch.conversation_config.agent.first_message).toBe('Olá, Osteria!');
  });

  test('an agent already in the language, model and summary is left alone', () => {
    expect(planLanguageSync(osteria, agent('pt', 'eleven_flash_v2_5', 'pt-br'), deps)).toMatchObject({ status: 'ok', patch: null });
    expect(planLanguageSync({ ...osteria, agent_language: 'pt-BR' }, agent('pt-br', 'eleven_flash_v2_5', 'pt-br'), deps).status).toBe('ok');
  });

  test('an English restaurant on the English-only model is in sync', () => {
    expect(planLanguageSync({ ...osteria, country: 'US', agent_language: 'en' }, agent('en', 'eleven_flash_v2', 'en'), deps).status).toBe('ok');
  });

  test('missing data is reported, never patched', () => {
    expect(planLanguageSync({ ...osteria, agent_language: '' }, agent('en'), deps).status).toBe('invalid');
    expect(planLanguageSync(osteria, { conversation_config: { agent: { language: 'en' } } }, deps).status).toBe('invalid');
  });
});

describe('sync script', () => {
  const ok = body => ({ ok: true, json: async () => body, text: async () => '' });
  const other = { ...osteria, id: '27b0272b-fd5f-41e2-81c0-e27faca99ac6', restaurant_name: 'Casa del Sol', country: 'Spain',
    agent_language: 'es', elevenlabs_agent_id: 'agent_casa_00002' };

  test('without --apply it only reads', async () => {
    const fetchImpl = jest.fn(async () => ok(agent('en')));
    const { rows, applied } = await run({ configs: [osteria, other], apply: null, key: 'k', fetchImpl, log: () => {} });
    expect(rows.map(r => r.plan.status)).toEqual(['mismatch', 'mismatch']);
    expect(applied).toBeNull();
    expect(fetchImpl.mock.calls.every(([, init]) => !init.method || init.method === 'GET')).toBe(true);
  });

  test('--apply patches only the named restaurant and verifies it afterwards', async () => {
    let osteriaAgent = agent('en');
    const fetchImpl = jest.fn(async (url, init = {}) => {
      if (init.method === 'PATCH') {
        expect(url).toMatch(/agent_osteria_0001$/);
        const body = JSON.parse(init.body);
        osteriaAgent = agent(body.conversation_config.agent.language, body.conversation_config.tts.model_id, body.platform_settings.summary_language);
        return ok({});
      }
      return ok(url.endsWith('agent_osteria_0001') ? osteriaAgent : agent('en'));
    });
    const { applied } = await run({ configs: [osteria, other], apply: osteria.id, key: 'k', fetchImpl, log: () => {} });
    expect(applied).toMatchObject({ status: 'ok', changed: true, after: { language: 'pt', model: 'eleven_flash_v2_5', summary: 'pt-br' } });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  });

  test('a PATCH that does not stick is an error', async () => {
    const fetchImpl = jest.fn(async (url, init = {}) => ok(init.method === 'PATCH' ? {} : agent('en')));
    await expect(run({ configs: [osteria], apply: osteria.id, key: 'k', fetchImpl, log: () => {} }))
      .rejects.toThrow(/still out of sync/);
  });

  test('arguments are strict', () => {
    expect(() => parseArgs([])).toThrow(/--configs/);
    expect(() => parseArgs(['--configs', 'x.json', '--apply', 'not-a-uuid'])).toThrow(/UUID/);
    expect(parseArgs(['--configs', 'x.json', '--apply', osteria.id])).toEqual({ configs: 'x.json', apply: osteria.id });
  });
});
