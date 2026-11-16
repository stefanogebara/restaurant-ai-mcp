'use strict';

// A restaurant's agent_language changed in the database never reached its
// ElevenLabs agent (Osteria del Sole, 2026-11-12: database 'pt', agent 'en').
// planLanguageSync decides what one PATCH must change; the script reads every
// agent, and writes only for the one restaurant named with --apply.

const { planLanguageSync } = require('../_lib/elevenlabs-language-sync');
const { run, parseArgs } = require('../../scripts/elevenlabs-agent-language-sync.cjs');

const osteria = { id: '152dc287-46e6-4139-b8eb-12d1877b121f', restaurant_name: 'Osteria del Sole', country: 'Brazil',
  agent_language: 'pt', agent_greeting: null, elevenlabs_agent_id: 'agent_osteria_0001', ai_config: { language: 'pt-BR' } };
const { CLIENT_EVENTS, END_CALL_TOOL } = require('../_lib/elevenlabs-call-setup');
// Agents in these fixtures already have browser audio and the end_call tool;
// the 'call setup' tests below remove them on purpose.
const agent = (language, model = 'eleven_flash_v2', summary = 'en', prompt = `PROMPT(${language})`, timezone) => ({
  conversation_config: {
    agent: { language, first_message: 'Thank you for calling.',
      prompt: { prompt, built_in_tools: { end_call: { ...END_CALL_TOOL } }, ...(timezone ? { timezone } : {}) } },
    tts: { model_id: model }, conversation: { client_events: [...CLIENT_EVENTS] },
  },
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
        tts: { model_id: 'eleven_v4_turbo' },
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

  test('an agent already in the language, model, summary and prompt is left alone', () => {
    expect(planLanguageSync(osteria, agent('pt', 'eleven_v4_turbo', 'pt-br'), deps)).toMatchObject({ status: 'ok', patch: null });
    expect(planLanguageSync({ ...osteria, agent_language: 'pt-BR' }, agent('pt-br', 'eleven_v4_turbo', 'pt-br', 'PROMPT(pt-BR)'), deps).status).toBe('ok');
    // ElevenLabs may trim the stored prompt.
    expect(planLanguageSync(osteria, agent('pt', 'eleven_v4_turbo', 'pt-br', '  PROMPT(pt)\n'), deps).status).toBe('ok');
  });

  // 2026-11-12: the agents guessed the year (sent 2023-11-14). The fix lives in
  // the prompt and in the agent's time zone, which only this sync delivers.
  test('right language with an old prompt is outdated: the patch changes only prompt and zone', () => {
    const plan = planLanguageSync({ ...osteria, timezone: 'America/Sao_Paulo' },
      agent('pt', 'eleven_v4_turbo', 'pt-br', 'old prompt'), deps);
    expect(plan.status).toBe('outdated');
    expect(plan.reasons).toEqual(['prompt outdated', 'timezone null != America/Sao_Paulo']);
    expect(plan.patch).toEqual({ conversation_config: { agent: { prompt: { prompt: 'PROMPT(pt)', timezone: 'America/Sao_Paulo' } } } });
  });

  test('a missing time zone alone is outdated; a matching one is in sync', () => {
    const config = { ...osteria, timezone: 'America/Sao_Paulo' };
    expect(planLanguageSync(config, agent('pt', 'eleven_v4_turbo', 'pt-br'), deps).reasons).toEqual(['timezone null != America/Sao_Paulo']);
    expect(planLanguageSync(config, agent('pt', 'eleven_v4_turbo', 'pt-br', 'PROMPT(pt)', 'America/Sao_Paulo'), deps).status).toBe('ok');
  });

  test('a language mismatch carries the zone in its full patch', () => {
    const plan = planLanguageSync({ ...osteria, timezone: 'America/Sao_Paulo' }, agent('en'), deps);
    expect(plan.status).toBe('mismatch');
    expect(plan.patch.conversation_config.agent.prompt).toEqual({ prompt: 'PROMPT(pt)', timezone: 'America/Sao_Paulo' });
  });

  test('an English restaurant on the English-only model is in sync', () => {
    expect(planLanguageSync({ ...osteria, country: 'US', agent_language: 'en' }, agent('en', 'eleven_v4_turbo', 'en'), deps).status).toBe('ok');
  });

  test('missing data is reported, never patched', () => {
    expect(planLanguageSync({ ...osteria, agent_language: '' }, agent('en'), deps).status).toBe('invalid');
    expect(planLanguageSync(osteria, { conversation_config: { agent: { language: 'en' } } }, deps).status).toBe('invalid');
  });
});

// 2026-11-16, first browser test call of the new onboarding: the owner heard
// nothing (no 'audio' event) and the agent never hung up (no end_call tool).
// 2026-11-16 (Stefano: "I need a real voice, use v4 turbo"): our old default
// models move to eleven_v4_turbo; a model set on purpose stays.
describe('voice model', () => {
  test('an agent on an old default model is outdated, and the patch changes only the model besides prompt', () => {
    for (const old of ['eleven_flash_v2_5', 'eleven_turbo_v2_5']) {
      const plan = planLanguageSync(osteria, agent('pt', old, 'pt-br'), deps);
      expect(plan.status).toBe('outdated');
      expect(plan.reasons).toEqual([`voice model ${old} -> eleven_v4_turbo`]);
      expect(plan.patch.conversation_config.tts).toEqual({ model_id: 'eleven_v4_turbo' });
      expect(plan.patch.conversation_config.agent.language).toBeUndefined();
    }
  });

  test('an English agent on the English-only Flash v2 moves to v4 Turbo too', () => {
    const plan = planLanguageSync({ ...osteria, country: 'US', agent_language: 'en' }, agent('en', 'eleven_flash_v2', 'en'), deps);
    expect(plan).toMatchObject({ status: 'outdated', patch: { conversation_config: { tts: { model_id: 'eleven_v4_turbo' } } } });
  });

  test('a model set on purpose is kept', () => {
    expect(planLanguageSync(osteria, agent('pt', 'eleven_multilingual_v2', 'pt-br'), deps).status).toBe('ok');
    expect(planLanguageSync(osteria, agent('pt', 'eleven_v4', 'pt-br'), deps).status).toBe('ok');
  });

  test('a language mismatch lands on v4 Turbo in the same patch', () => {
    expect(planLanguageSync(osteria, agent('en'), deps).patch.conversation_config.tts).toEqual({ model_id: 'eleven_v4_turbo' });
  });
});

describe('call setup', () => {
  const ready = { ...osteria, timezone: 'America/Sao_Paulo' };
  const upToDate = () => agent('pt', 'eleven_v4_turbo', 'pt-br', 'PROMPT(pt)', 'America/Sao_Paulo');
  const created = () => {
    const a = upToDate();
    a.conversation_config.conversation.client_events = ['agent_response', 'agent_response_correction', 'user_transcript', 'internal_tentative_agent_response'];
    a.conversation_config.agent.prompt.built_in_tools = { language_detection: null, end_call: null };
    return a;
  };

  test('an agent made before the fix is outdated, and the patch adds audio and end_call', () => {
    const plan = planLanguageSync(ready, created(), deps);
    expect(plan.status).toBe('outdated');
    expect(plan.reasons).toEqual(['call events missing: audio, interruption', 'end_call tool missing']);
    expect(plan.patch.conversation_config.conversation.client_events).toEqual([
      'agent_response', 'agent_response_correction', 'user_transcript', 'internal_tentative_agent_response', 'audio', 'interruption']);
    expect(plan.patch.conversation_config.agent.prompt.built_in_tools).toEqual({
      language_detection: null,
      end_call: { type: 'system', name: 'end_call', description: '', params: { system_tool_type: 'end_call' } },
    });
    // Same prompt and zone as before: the patch only adds.
    expect(plan.patch.conversation_config.agent.prompt).toMatchObject({ prompt: 'PROMPT(pt)', timezone: 'America/Sao_Paulo' });
  });

  test('an agent with both is in sync, whatever other events it has', () => {
    const a = upToDate();
    a.conversation_config.conversation.client_events.push('ping');
    expect(planLanguageSync(ready, a, deps)).toMatchObject({ status: 'ok', patch: null });
  });

  test('a language mismatch also carries the call setup', () => {
    const a = created();
    a.conversation_config.agent.language = 'en';
    const plan = planLanguageSync(ready, a, deps);
    expect(plan.status).toBe('mismatch');
    expect(plan.patch.conversation_config.conversation.client_events).toContain('audio');
    expect(plan.patch.conversation_config.agent.prompt.built_in_tools.end_call).toBeTruthy();
  });

  test('the sync patches an old agent and reads it back as in sync', async () => {
    const { syncAgentLanguage } = require('../_lib/elevenlabs-language-sync');
    let stored = created();
    const fetchImpl = jest.fn(async (url, init = {}) => {
      if (init.method === 'PATCH') {
        const body = JSON.parse(init.body).conversation_config;
        stored.conversation_config.conversation.client_events = body.conversation.client_events;
        stored.conversation_config.agent.prompt.built_in_tools = body.agent.prompt.built_in_tools;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => stored };
    });
    const result = await syncAgentLanguage(ready, 'k', { fetchImpl, deps, onlyOutdated: true });
    expect(result).toMatchObject({ changed: true, before: { status: 'outdated' }, after: { status: 'ok' } });
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
        osteriaAgent = agent(body.conversation_config.agent.language, body.conversation_config.tts.model_id,
          body.platform_settings.summary_language, body.conversation_config.agent.prompt.prompt);
        return ok({});
      }
      return ok(url.endsWith('agent_osteria_0001') ? osteriaAgent : agent('en'));
    });
    const { applied } = await run({ configs: [osteria, other], apply: osteria.id, key: 'k', fetchImpl, log: () => {} });
    expect(applied).toMatchObject({ status: 'ok', changed: true, after: { language: 'pt', model: 'eleven_v4_turbo', summary: 'pt-br' } });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  });

  test('an outdated agent is patched with prompt and zone only, then read back', async () => {
    const { syncAgentLanguage } = require('../_lib/elevenlabs-language-sync');
    const config = { ...osteria, timezone: 'America/Sao_Paulo' };
    let stored = agent('pt', 'eleven_v4_turbo', 'pt-br', 'old prompt');
    const fetchImpl = jest.fn(async (url, init = {}) => {
      if (init.method === 'PATCH') {
        const { prompt } = JSON.parse(init.body).conversation_config.agent;
        expect(Object.keys(JSON.parse(init.body).conversation_config.agent)).toEqual(['prompt']);
        stored = agent('pt', 'eleven_v4_turbo', 'pt-br', prompt.prompt, prompt.timezone);
        return ok({});
      }
      return ok(stored);
    });
    const result = await syncAgentLanguage(config, 'k', { fetchImpl, deps });
    expect(result).toMatchObject({ changed: true, before: { status: 'outdated' }, after: { status: 'ok' } });
  });

  test('onlyOutdated leaves an agent with a different language untouched', async () => {
    const { syncAgentLanguage } = require('../_lib/elevenlabs-language-sync');
    const fetchImpl = jest.fn(async () => ok(agent('es', 'eleven_turbo_v2_5', 'es')));
    const result = await syncAgentLanguage({ ...osteria, agent_language: 'en', country: 'US' }, 'k', { fetchImpl, deps, onlyOutdated: true });
    expect(result).toMatchObject({ changed: false, skipped: true, before: { status: 'mismatch' } });
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
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
