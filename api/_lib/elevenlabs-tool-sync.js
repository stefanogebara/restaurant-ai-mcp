'use strict';

// Bring a restaurant's own ElevenLabs agent tools up to the current
// definitions in api/_services/elevenlabsAgentService.js (buildToolDefinitions).
//
// Why: tools live at ElevenLabs as separate objects created once, with the
// agent. Since 2026-11-12 (audit F4) the server refuses guest changes by phone
// and only looks a booking up with the full code + phone, but agents created
// earlier still describe lookup as "by phone or name" and have no code field:
// the agent asks for a code it cannot send. Only the three guest tools change.
//
// Safety:
// - the complete tool_config is sent (built exactly as at creation, with the
//   restaurant's own webhook secret read from the database on the server), so
//   the update does not depend on whether ElevenLabs merges or replaces;
// - every tool is read back and compared before the next one;
// - nothing about the config (URL, secret) is returned to the caller.

const GUEST_TOOLS = ['lookup_reservation', 'cancel_reservation', 'modify_reservation'];
const TOOLS_URL = 'https://api.elevenlabs.io/v1/convai/tools';
const TOOL_ID = /^[A-Za-z0-9_-]{6,80}$/;

function productionBaseUrl() {
  // Same expression as createAgent: tools must call the production alias.
  return process.env.VERCEL_ENV === 'production' ? 'https://seatable.one'
    : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://seatable.one';
}

function toolIdsOf(agent) {
  const cfg = agent?.conversation_config?.agent;
  const fromPrompt = Array.isArray(cfg?.prompt?.tool_ids) ? cfg.prompt.tool_ids : [];
  const legacy = Array.isArray(cfg?.tools) ? cfg.tools.map(tool => tool?.id) : [];
  return [...new Set([...fromPrompt, ...legacy])].filter(id => typeof id === 'string' && TOOL_ID.test(id));
}

const words = text => String(text || '').replace(/\s+/g, ' ').trim();
const sorted = list => [...(Array.isArray(list) ? list : [])].map(String).sort();

// ElevenLabs may decorate a stored schema; compare what the agent relies on:
// description, URL, method, field names and required fields.
function sameShape(stored, expected) {
  const s = stored?.tool_config || stored || {};
  const se = s.api_schema || {};
  const ee = expected.api_schema || {};
  const sBody = se.request_body_schema || {};
  const eBody = ee.request_body_schema || {};
  return words(s.description) === words(expected.description)
    && se.url === ee.url
    && String(se.method || '').toUpperCase() === String(ee.method || '').toUpperCase()
    && JSON.stringify(sorted(Object.keys(sBody.properties || {}))) === JSON.stringify(sorted(Object.keys(eBody.properties || {})))
    && JSON.stringify(sorted(sBody.required)) === JSON.stringify(sorted(eBody.required));
}

/**
 * @param {object} config restaurant_config (id, elevenlabs_webhook_secret)
 * @param {object[]} tools stored tools of the agent ({ id, tool_config })
 * @param {Function} buildToolDefinitions from elevenlabsAgentService
 */
function planToolSync(config, tools, buildToolDefinitions, baseUrl = productionBaseUrl()) {
  if (!config?.elevenlabs_webhook_secret) {
    return { status: 'invalid', reasons: ['restaurant has no webhook secret'], changes: [] };
  }
  const expected = Object.fromEntries(buildToolDefinitions(baseUrl, config.id, config.elevenlabs_webhook_secret)
    .filter(tool => GUEST_TOOLS.includes(tool.name)).map(tool => [tool.name, tool]));
  const reasons = [];
  const changes = [];
  for (const name of GUEST_TOOLS) {
    const stored = tools.filter(tool => tool?.tool_config?.name === name);
    if (stored.length !== 1) {
      reasons.push(stored.length ? `${name} appears ${stored.length} times` : `${name} missing`);
      continue;
    }
    if (!sameShape(stored[0], expected[name])) {
      reasons.push(`${name} outdated`);
      changes.push({ id: stored[0].id, name, config: expected[name] });
    }
  }
  if (reasons.some(reason => !reason.endsWith('outdated'))) return { status: 'invalid', reasons, changes: [] };
  return { status: changes.length ? 'outdated' : 'ok', reasons, changes };
}

async function request(fetchImpl, key, url, init = {}) {
  const res = await fetchImpl(url, {
    ...init, headers: { 'xi-api-key': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${url.split('/convai/')[1]?.split('/')[0] || 'tool'} ${res.status}`);
  return res.json();
}

async function readTools(agent, key, fetchImpl = fetch) {
  const tools = [];
  for (const id of toolIdsOf(agent)) tools.push(await request(fetchImpl, key, `${TOOLS_URL}/${id}`));
  return tools;
}

/** Report or apply. Apply PATCHes one tool at a time and verifies each. */
async function syncAgentTools(config, agent, key, { buildToolDefinitions, apply = false, fetchImpl = fetch } = {}) {
  const plan = planToolSync(config, await readTools(agent, key, fetchImpl), buildToolDefinitions);
  if (!apply || plan.status !== 'outdated') return { changed: false, plan };
  for (const change of plan.changes) {
    await request(fetchImpl, key, `${TOOLS_URL}/${change.id}`, { method: 'PATCH', body: JSON.stringify({ tool_config: change.config }) });
    const back = await request(fetchImpl, key, `${TOOLS_URL}/${change.id}`);
    if (!sameShape(back, change.config)) throw new Error(`${change.name} did not read back as updated`);
    const header = back?.tool_config?.api_schema?.request_headers?.Authorization;
    if (typeof header === 'string' && header.startsWith('Bearer el_whsec_') && header !== change.config.api_schema.request_headers.Authorization) {
      throw new Error(`${change.name} read back with a different secret`);
    }
  }
  const after = planToolSync(config, await readTools(agent, key, fetchImpl), buildToolDefinitions);
  if (after.status !== 'ok') throw new Error(`tools still outdated: ${after.reasons.join('; ')}`);
  return { changed: true, plan, after };
}

module.exports = { GUEST_TOOLS, planToolSync, syncAgentTools, toolIdsOf, sameShape, productionBaseUrl };
