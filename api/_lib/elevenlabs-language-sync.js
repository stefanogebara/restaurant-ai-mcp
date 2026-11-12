'use strict';

// Compare a restaurant's own ElevenLabs agent with restaurant_config and plan
// the one PATCH that brings the agent to the restaurant's agent_language.
// Changing agent_language in the database does not reach ElevenLabs; until
// 2026-11-12 nothing replayed it (Osteria del Sole: database 'pt', agent 'en').
//
// The patch uses the same helpers as the app's own paths:
// - language + matching TTS model + summary language, as the voice settings
//   PATCH does (api/elevenlabs-voice-settings.js);
// - prompt and first message rebuilt from the config, as
//   refreshVoiceAgentPrompt does (api/_services/voiceAgentService.js).

const { compatibleTtsModel, summaryLanguageFor } = require('./elevenlabs-voice-config');
const { buildFirstMessage } = require('./voice-first-message');

const base = value => String(value || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0];

/**
 * @param {object} config restaurant_config row (fields used by buildPersonaPrompt)
 * @param {object} agent  GET /v1/convai/agents/{id} body
 * @param {object} [deps] { buildPersonaPrompt } — injectable for tests
 * @returns {{ status: 'ok'|'mismatch'|'invalid', reasons: string[], current: object, patch: object|null }}
 */
function planLanguageSync(config, agent, deps = {}) {
  const wanted = config?.agent_language;
  const agentConfig = agent?.conversation_config || {};
  const current = {
    language: agentConfig.agent?.language ?? null,
    model: agentConfig.tts?.model_id ?? null,
    summary: agent?.platform_settings?.summary_language ?? null,
    first_message: agentConfig.agent?.first_message ?? null,
  };
  if (typeof wanted !== 'string' || !wanted.trim()) {
    return { status: 'invalid', reasons: ['restaurant has no agent_language'], current, patch: null };
  }
  if (typeof current.model !== 'string' || !current.model) {
    return { status: 'invalid', reasons: ['agent has no TTS model'], current, patch: null };
  }

  const reasons = [];
  if (base(current.language) !== base(wanted)) reasons.push(`language ${current.language} != ${wanted}`);
  const model = compatibleTtsModel(wanted, current.model);
  if (model !== current.model) reasons.push(`model ${current.model} cannot speak ${wanted}`);
  const summary = summaryLanguageFor(wanted, current.summary, config);
  if (base(current.summary) !== base(summary)) reasons.push(`summary ${current.summary} != ${summary}`);
  if (!reasons.length) return { status: 'ok', reasons, current, patch: null };

  const buildPersonaPrompt = deps.buildPersonaPrompt || require('./persona-prompt-builder').buildPersonaPrompt;
  const patch = {
    conversation_config: {
      agent: {
        // The dashboard language selector stores 'pt-BR'; the agent takes the
        // base language (the region goes to summary_language below).
        language: base(wanted),
        first_message: buildFirstMessage({
          restaurant_name: config.restaurant_name, language: wanted, custom_greeting: config.agent_greeting,
        }),
        prompt: { prompt: buildPersonaPrompt(config, { channel: 'voice' }) },
      },
      tts: { model_id: model },
    },
    platform_settings: { summary_language: summary },
  };
  return { status: 'mismatch', reasons, current, patch };
}

const AGENTS_URL = 'https://api.elevenlabs.io/v1/convai/agents';
const AGENT_ID = /^[A-Za-z0-9_-]{8,80}$/;

async function fetchAgent(agentId, key, fetchImpl = fetch) {
  if (!AGENT_ID.test(String(agentId || ''))) throw new Error('invalid agent id');
  const res = await fetchImpl(`${AGENTS_URL}/${agentId}`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET agent ${res.status}`);
  return res.json();
}

async function patchAgent(agentId, patch, key, fetchImpl = fetch) {
  if (!AGENT_ID.test(String(agentId || ''))) throw new Error('invalid agent id');
  const res = await fetchImpl(`${AGENTS_URL}/${agentId}`, {
    method: 'PATCH', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch), signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`PATCH agent ${res.status}`);
}

/** PATCH a mismatched agent, read it back, and fail unless it is now in sync. */
async function syncAgentLanguage(config, key, { fetchImpl = fetch, deps = {} } = {}) {
  const before = planLanguageSync(config, await fetchAgent(config.elevenlabs_agent_id, key, fetchImpl), deps);
  if (before.status !== 'mismatch') return { changed: false, before, after: before };
  await patchAgent(config.elevenlabs_agent_id, before.patch, key, fetchImpl);
  const after = planLanguageSync(config, await fetchAgent(config.elevenlabs_agent_id, key, fetchImpl), deps);
  if (after.status !== 'ok') throw new Error(`agent still out of sync: ${after.reasons.join('; ')}`);
  return { changed: true, before, after };
}

// Columns buildPersonaPrompt reads (same list as refreshVoiceAgentPrompt).
const CONFIG_COLUMNS = 'id, restaurant_name, restaurant_type, phone, email, website, city, country, business_hours, average_dining_duration_minutes, timezone, agent_language, reservation_settings, deposit_config, elevenlabs_agent_id, agent_name, agent_greeting, ai_config, metric_profile, restaurant_profile, scraped_data, ai_strategy_doc, persona_prompt_override';

module.exports = { planLanguageSync, fetchAgent, patchAgent, syncAgentLanguage, CONFIG_COLUMNS };
