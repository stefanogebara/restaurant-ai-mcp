#!/usr/bin/env node
'use strict';
/**
 * Compare each restaurant's own ElevenLabs agent with restaurant_config and,
 * only when asked, bring one agent to the restaurant's agent_language.
 *
 * Read-only by default: GETs every agent and prints a table. Nothing changes.
 *
 *   node scripts/elevenlabs-agent-language-sync.cjs --configs configs.json
 *   node scripts/elevenlabs-agent-language-sync.cjs --configs configs.json --apply <restaurant_id>
 *
 * --configs: JSON array of restaurant_config rows (export with the SQL in the
 *   header of api/_lib/elevenlabs-language-sync.js callers, or the query below).
 *   Reading configs from a file keeps this script away from the Supabase
 *   service key; it only needs ELEVENLABS_API_KEY in the environment.
 * --apply <id>: PATCH that one restaurant's agent (one PATCH: language, first
 *   message, prompt, compatible TTS model, summary language), then GET it
 *   again and fail unless it reports the wanted language.
 *
 * Config query (columns buildPersonaPrompt reads):
 *   select id, restaurant_name, restaurant_type, phone, email, website, city, country,
 *     business_hours, average_dining_duration_minutes, timezone, agent_language,
 *     reservation_settings, deposit_config, elevenlabs_agent_id, agent_name, agent_greeting,
 *     ai_config, metric_profile, restaurant_profile, scraped_data, ai_strategy_doc,
 *     persona_prompt_override
 *   from restaurant.restaurant_config where elevenlabs_agent_id is not null;
 */

const fs = require('fs');
const path = require('path');
const { planLanguageSync, fetchAgent: getAgent, syncAgentLanguage } = require(path.join(__dirname, '../api/_lib/elevenlabs-language-sync'));

function parseArgs(argv) {
  const args = { configs: null, apply: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--configs') args.configs = argv[++i];
    else if (argv[i] === '--apply') args.apply = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.configs) throw new Error('--configs <file> is required');
  if (args.apply !== null && !/^[0-9a-f-]{36}$/i.test(args.apply || '')) throw new Error('--apply needs a restaurant UUID');
  return args;
}

async function run({ configs, apply, key, fetchImpl = fetch, log = console.log }) {
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const rows = [];
  for (const config of configs.filter(c => c.elevenlabs_agent_id)) {
    try {
      const plan = planLanguageSync(config, await getAgent(config.elevenlabs_agent_id, key, fetchImpl));
      rows.push({ config, plan });
    } catch (error) {
      rows.push({ config, plan: { status: 'error', reasons: [error.message], current: {} } });
    }
  }
  log(rows.map(({ config, plan }) => [
    plan.status.padEnd(8), String(config.agent_language).padEnd(5), String(plan.current.language ?? '-').padEnd(6),
    String(plan.current.model ?? '-').padEnd(20), config.restaurant_name, plan.reasons.join('; '),
  ].join(' ')).join('\n'));

  if (!apply) return { rows, applied: null };
  const target = rows.find(r => r.config.id === apply);
  if (!target) throw new Error('restaurant not found among configs with an agent');
  if (target.plan.status !== 'mismatch') return { rows, applied: { status: target.plan.status, changed: false } };
  const { after } = await syncAgentLanguage(target.config, key, { fetchImpl });
  log(`applied: ${target.config.restaurant_name} now ${after.current.language} / ${after.current.model} / summary ${after.current.summary}`);
  return { rows, applied: { status: 'ok', changed: true, after: after.current } };
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const configs = JSON.parse(fs.readFileSync(args.configs, 'utf8'));
    await run({ configs, apply: args.apply, key: process.env.ELEVENLABS_API_KEY });
  })().catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { parseArgs, run };
