#!/usr/bin/env node
/**
 * Rotate ElevenLabs agent webhook credentials: CRON_SECRET → per-restaurant secrets.
 *
 * Background: agent tool definitions embed a Bearer token in request_headers,
 * stored on ElevenLabs's servers. Until 2026-06-10 that token was the global
 * CRON_SECRET — a shared internal credential, not tenant-scoped. This script
 * re-points every existing agent at its own per-restaurant secret so
 * CRON_SECRET can then be rotated dead.
 *
 * For each restaurant_config row with an elevenlabs_agent_id:
 *   1. Ensure elevenlabs_webhook_secret exists (generate + persist if null)
 *   2. Create a fresh set of webhook tools at ElevenLabs with the new secret
 *   3. PATCH the agent's prompt.tool_ids to the new tools
 *   4. Delete the old tools (which carry the leaked CRON_SECRET)
 *
 * Usage:
 *   node scripts/rotate-elevenlabs-secrets.mjs            # dry-run (default)
 *   node scripts/rotate-elevenlabs-secrets.mjs --apply    # do it
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY
 * (loaded from .env via dotenv). The migration
 * supabase/migrations/20260610_elevenlabs_webhook_secret.sql must be applied
 * first or the secret writes will fail.
 *
 * AFTER this script succeeds: rotate CRON_SECRET in Vercel env settings and
 * redeploy — the old value is dead weight at ElevenLabs until then.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const APPLY = process.argv.includes('--apply');

const {
  getOrCreateWebhookSecret,
  buildToolDefinitions,
  createToolsViaAPI,
} = require('../api/_services/elevenlabsAgentService');
const { supabaseAdmin } = require('../api/_lib/supabase');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai';
const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://seatable.one';

if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(1);
}

const headers = { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' };

async function getAgent(agentId) {
  const res = await fetch(`${ELEVENLABS_BASE}/agents/${agentId}`, { headers });
  if (!res.ok) throw new Error(`GET agent ${agentId}: HTTP ${res.status}`);
  return res.json();
}

async function patchAgentToolIds(agentId, toolIds) {
  const res = await fetch(`${ELEVENLABS_BASE}/agents/${agentId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { tool_ids: toolIds } } },
    }),
  });
  if (!res.ok) throw new Error(`PATCH agent ${agentId}: HTTP ${res.status} ${await res.text()}`);
}

async function deleteTool(toolId) {
  const res = await fetch(`${ELEVENLABS_BASE}/tools/${toolId}`, { method: 'DELETE', headers });
  // 404 is fine — already gone
  if (!res.ok && res.status !== 404) {
    console.warn(`  warn: DELETE tool ${toolId}: HTTP ${res.status}`);
  }
}

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to execute)'}\n`);

const { data: restaurants, error } = await supabaseAdmin
  .schema('restaurant')
  .from('restaurant_config')
  .select('id, restaurant_name, elevenlabs_agent_id, elevenlabs_webhook_secret')
  .not('elevenlabs_agent_id', 'is', null);

if (error) {
  console.error('Failed to list restaurants:', error.message);
  process.exit(1);
}

console.log(`${restaurants.length} restaurants with ElevenLabs agents\n`);

let ok = 0, failed = 0;
for (const r of restaurants) {
  const label = `${r.restaurant_name} (${r.id.slice(0, 8)})`;
  try {
    const agent = await getAgent(r.elevenlabs_agent_id);
    const oldToolIds = agent?.conversation_config?.agent?.prompt?.tool_ids || [];
    console.log(`${label}: agent ${r.elevenlabs_agent_id}, ${oldToolIds.length} existing tools, secret ${r.elevenlabs_webhook_secret ? 'present' : 'MISSING'}`);

    if (!APPLY) { ok++; continue; }

    const secret = await getOrCreateWebhookSecret(r.id);
    if (!secret) throw new Error('could not provision webhook secret (migration applied?)');

    const toolDefs = buildToolDefinitions(BASE_URL, r.id, secret);
    const { toolIds: newToolIds, errors: toolErrors } = await createToolsViaAPI(toolDefs, API_KEY);
    if (newToolIds.length !== toolDefs.length) {
      throw new Error(`only ${newToolIds.length}/${toolDefs.length} tools created: ${JSON.stringify(toolErrors)}`);
    }

    await patchAgentToolIds(r.elevenlabs_agent_id, newToolIds);
    console.log(`  -> re-pointed to ${newToolIds.length} new tools`);

    for (const oldId of oldToolIds) await deleteTool(oldId);
    console.log(`  -> deleted ${oldToolIds.length} old tools (carried leaked CRON_SECRET)`);
    ok++;
  } catch (err) {
    console.error(`  FAILED ${label}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${ok} ok, ${failed} failed`);
if (APPLY && failed === 0) {
  console.log('\nNEXT STEP: rotate CRON_SECRET —');
  console.log('  npx vercel env rm CRON_SECRET production');
  console.log('  npx vercel env add CRON_SECRET production   # paste a fresh `openssl rand -hex 32`');
  console.log('  then redeploy so functions + cron headers pick up the new value.');
}
process.exit(failed > 0 ? 1 : 0);
