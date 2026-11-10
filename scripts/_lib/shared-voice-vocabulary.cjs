'use strict';
const { createHash } = require('node:crypto');
const TARGET = Object.freeze({ projectRef: 'ckforlwdhewexyqljsaf', workspaceId: '638a74e2dad648c4a0745edc358d7eae', agentId: 'agent_1101km6f8n10ehhv062j9xfep9y8', agentName: 'Seatable Orchestrator v2', phone: '+551150289356' });
const normalize = value => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
const key = value => normalize(value).toLowerCase();
function validateTerm(term) {
  if (typeof term !== 'string' || !normalize(term)) throw new Error('Missing canonical name or keyword');
  if ([...term].length > 20 || /[\p{Cc}\p{Cf}]/u.test(term)) throw new Error('Keyword/name must be at most 20 characters without controls');
}
function buildVocabulary(rows) {
  if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('Directory incomplete');
  const terms = [];
  for (const row of rows) {
    if (row.is_active !== true || row.onboarding_completed !== true || row.is_demo !== false || row.shared_routing_enabled !== true) continue;
    if (typeof row.restaurant_name !== 'string') throw new Error('Missing canonical name');
    const name = normalize(row.restaurant_name); validateTerm(name);
    terms.push(name, ...(name.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []));
  }
  return mergeKeywords([], [...new Set(terms)].sort());
}
function mergeKeywords(existing, additions) {
  if (!Array.isArray(existing) || !Array.isArray(additions)) throw new Error('Keywords must be arrays');
  const result = [...existing]; const seen = new Set();
  for (const term of existing) { validateTerm(term); seen.add(key(term)); }
  for (const term of additions) { validateTerm(term); if (!seen.has(key(term))) { result.push(term); seen.add(key(term)); } }
  if (result.length > 50) throw new Error('Realtime keyword limit is 50; refusing truncation');
  return result;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function digest(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fingerprint(agent, phones) {
  const config = structuredClone(agent.conversation_config); delete config.asr.keywords;
  return digest({ config, platform: agent.platform_settings, workflow: agent.workflow, procedures: agent.procedures,
    name: agent.name, tags: agent.tags, access: agent.access_info, agentPhones: agent.phone_numbers, whatsapp: agent.whatsapp_accounts, phones });
}
module.exports = { TARGET, buildVocabulary, mergeKeywords, fingerprint, digest };
