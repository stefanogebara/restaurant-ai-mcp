const { randomUUID } = require('node:crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { createAgent } = require('./elevenlabsAgentService');
const { buildKnowledgeDoc, loadKnowledgeBaseData } = require('../_lib/elevenlabs-knowledge-base');

const logger = createSecureLogger('OnboardingRecovery');
const STEPS = ['whatsapp_registry', 'voice_agent', 'knowledge_base', 'subscription'];
const STEP_COLUMNS = 'step,state,attempt_id,lease_until,create_started,resource_id';
const LEASE_MS = 90_000;
const PROVIDER_BASE = 'https://api.elevenlabs.io/v1/convai';
const DEFINITIVE_REJECTIONS = new Set([400, 401, 403, 404, 422, 429]);
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function restaurantConfig() {
  return supabaseAdmin.schema('restaurant').from('restaurant_config');
}

function stepRows() {
  return supabaseAdmin.from('onboarding_setup_steps');
}

function restaurantSteps(restaurantId) {
  return stepRows().select(STEP_COLUMNS).eq('restaurant_id', restaurantId);
}

function currentState(row, now = Date.now()) {
  if (row.state !== 'working' || Date.parse(row.lease_until) > now) return row.state;
  return row.create_started ? 'reconcile' : 'failed';
}

async function findOwnerRestaurant(userId) {
  return checked(restaurantConfig()
    .select('id,restaurant_name,slug,user_id,agent_language,voice_id,phone,city,country,business_hours,agent_greeting,elevenlabs_agent_id,elevenlabs_kb_doc_id,is_active,is_demo,voice_engine')
    .eq('user_id', userId).order('is_active', { ascending: false, nullsFirst: false }).limit(1).maybeSingle());
}

function subscriptionDetail(subscription) {
  if (!subscription?.id) return {};
  if (subscription.price_id === 'free') return { plan: 'free' };
  if (subscription.price_id === 'trial' && subscription.status === 'trialing') {
    return { plan: 'trial', trial_end: subscription.trial_end };
  }
  if (subscription.price_id === 'trial' && subscription.status === 'canceled') return { plan: 'trial_ended' };
  return {};
}

async function getSetupStatus(config) {
  if (!config) return { restaurant: null, steps: {}, needs_recovery: false };
  const restaurant = {
    restaurant_id: config.id,
    restaurant_name: config.restaurant_name,
    booking_url: config.slug ? '/book/' + config.slug : null,
    voice_agent_id: config.elevenlabs_agent_id,
  };
  const rows = config.is_demo || !config.is_active ? [] : await checked(restaurantSteps(config.id));
  // Only the atomic onboarding path creates journal rows. Historical tenants
  // can have deliberately disabled services or expired plans.
  if (!rows.length) return { restaurant, steps: {}, needs_recovery: false };

  const [tables, registry, subscription] = await Promise.all([
    checked(supabaseAdmin.from('tables').select('capacity').eq('restaurant_id', config.id).eq('is_active', true)),
    checked(supabaseAdmin.from('restaurant_registry').select('id').eq('id', config.id).maybeSingle()),
    checked(supabaseAdmin.from('subscriptions').select('id,price_id,status,trial_end')
      .eq('restaurant_id', config.id).order('created_at', { ascending: false }).limit(1).maybeSingle()),
  ]);
  const steps = {
    restaurant: {
      status: 'ok',
      tables: tables.length,
      seats: tables.reduce((seats, table) => seats + (Number(table.capacity) || 0), 0),
    },
  };
  const evidence = {
    whatsapp_registry: Boolean(registry),
    voice_agent: Boolean(config.elevenlabs_agent_id),
    knowledge_base: Boolean(config.elevenlabs_agent_id && config.elevenlabs_kb_doc_id),
    subscription: Boolean(subscription),
  };
  for (const row of rows) {
    // A completed journal stays historical if the owner later removes an
    // agent, moves to a different voice engine or cancels billing.
    const status = evidence[row.step] ? 'ok' : currentState(row);
    if (config.voice_engine === 'openai_realtime' && ['voice_agent', 'knowledge_base'].includes(row.step)) {
      steps[row.step] = { status: 'skipped' };
      continue;
    }
    const blocked = row.step === 'knowledge_base' && !config.elevenlabs_agent_id;
    steps[row.step] = {
      status: blocked && status !== 'ok' ? 'blocked' : status,
      retry: !blocked && ['pending', 'failed', 'reconcile'].includes(status),
    };
  }
  Object.assign(steps.voice_agent, steps.voice_agent.status === 'ok' && config.elevenlabs_agent_id ? {
    agent_id: config.elevenlabs_agent_id, language: config.agent_language,
  } : {});
  Object.assign(steps.subscription, subscriptionDetail(subscription));
  return { restaurant, steps, needs_recovery: rows.some(({ step }) => !['ok', 'skipped'].includes(steps[step].status)) };
}

async function claimStep(restaurantId, step) {
  const now = new Date();
  return checked(stepRows().update({
    state: 'working',
    attempt_id: randomUUID(),
    lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
  }).eq('restaurant_id', restaurantId).eq('step', step)
    .or(`state.in.(pending,failed,reconcile),and(state.eq.working,lease_until.lt.${now.toISOString()})`)
    .select(STEP_COLUMNS).maybeSingle());
}

async function checkpoint(restaurantId, attempt, update) {
  const row = await checked(stepRows().update(update)
    .eq('restaurant_id', restaurantId).eq('step', attempt.step).eq('attempt_id', attempt.attempt_id)
    .gt('lease_until', new Date().toISOString())
    .select(STEP_COLUMNS).maybeSingle());
  if (!row) throw new Error('Onboarding attempt changed');
  Object.assign(attempt, row);
}

async function providerRequest(endpoint, init, signal) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Voice provider unavailable');
  const response = await fetch(PROVIDER_BASE + endpoint, {
    ...init, signal,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = new Error('Voice provider request failed');
    error.providerStatus = response.status;
    throw error;
  }
  return response.json();
}

function providerId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

async function findProviderResource(endpoint, field, matches, signal) {
  const ids = new Set();
  const url = new URL(endpoint, 'https://localhost');
  const cursors = new Set();
  for (let page = 0; page < 10; page += 1) {
    const data = await providerRequest(url.pathname + url.search, {}, signal);
    for (const item of data[field]) {
      const id = item.agent_id ?? item.id;
      if (matches(item) && providerId(id)) ids.add(id);
    }
    if (!data.has_more) {
      if (ids.size > 1) throw new Error('Multiple onboarding resources need reconciliation');
      return ids.values().next().value;
    }
    if (!data.next_cursor || cursors.has(data.next_cursor)) break;
    cursors.add(data.next_cursor);
    url.searchParams.set('cursor', data.next_cursor);
  }
  throw new Error('Incomplete onboarding provider lookup');
}

async function verifiesRestaurantBinding(agentId, tag, restaurantId, signal) {
  const agent = await providerRequest('/agents/' + encodeURIComponent(agentId), {}, signal);
  if (!agent.tags?.includes(tag)) return false;
  const toolIds = agent.conversation_config?.agent?.prompt?.tool_ids ?? [];
  const tools = await Promise.all(toolIds.filter(providerId).map(id =>
    providerRequest('/tools/' + encodeURIComponent(id), {}, signal)));
  const actions = new Set();
  for (const resource of tools) {
    const tool = resource.tool_config ?? resource;
    if (tool.type !== 'webhook' || !tool.api_schema?.url) continue;
    const url = new URL(tool.api_schema.url);
    if (url.pathname !== '/api/elevenlabs-webhook') continue;
    if (url.searchParams.get('restaurant_id') !== restaurantId) return false;
    actions.add(url.searchParams.get('action'));
  }
  return actions.has('get_current_datetime') && actions.has('check_availability');
}

async function syncVoice(config, attempt, save, signal) {
  if (config.elevenlabs_agent_id) return { status: 'ok', agent_id: config.elevenlabs_agent_id };
  const tag = 'seatable-onboarding-' + config.id;
  let id = attempt.resource_id;
  if (!id && attempt.create_started) {
    id = await findProviderResource('/agents?tags=' + tag, 'agents', agent => agent.tags?.includes(tag), signal);
    if (!id || !await verifiesRestaurantBinding(id, tag, config.id, signal)) return { status: 'reconcile' };
  }
  if (!id) {
    const language = config.agent_language || 'en';
    const voice = config.voice_id && config.voice_id !== 'default' ? config.voice_id
      : process.env['ELEVENLABS_VOICE_ID_' + language.toUpperCase()]
        || process.env.ELEVENLABS_DEFAULT_VOICE_ID || DEFAULT_VOICE;
    const result = await createAgent({
      restaurantId: config.id, restaurant_name: config.restaurant_name, voice_id: voice,
      language, phone: config.phone, address: [config.city, config.country].filter(Boolean).join(', '),
      business_hours: config.business_hours || {}, custom_greeting: config.agent_greeting,
      tags: [tag], signal, beforeCreate: () => save({ create_started: true }),
    });
    if (!result.success) {
      if (result.uncertain) return { status: 'reconcile' };
      if (attempt.create_started) await save({ create_started: false });
      return { status: 'failed' };
    }
    id = result.agent_id;
    if (!providerId(id)) return { status: 'reconcile' };
  }
  if (!attempt.resource_id) await save({ resource_id: id });
  const linked = await checked(restaurantConfig().update({ elevenlabs_agent_id: id })
    .eq('id', config.id).eq('user_id', config.user_id).eq('is_active', true).eq('is_demo', false)
    .is('elevenlabs_agent_id', null).or('voice_engine.is.null,voice_engine.eq.elevenlabs').select('elevenlabs_agent_id').maybeSingle());
  const latest = linked ? null : await findOwnerRestaurant(config.user_id);
  const currentId = linked?.elevenlabs_agent_id ?? (latest?.id === config.id ? latest.elevenlabs_agent_id : null);
  return currentId ? { status: 'ok', agent_id: currentId } : { status: 'reconcile' };
}

async function syncKnowledge(config, attempt, save, signal) {
  if (!config.elevenlabs_agent_id) return { status: 'blocked' };
  if (config.elevenlabs_kb_doc_id) return { status: 'ok', document_id: config.elevenlabs_kb_doc_id };
  const endpoint = '/agents/' + encodeURIComponent(config.elevenlabs_agent_id);
  const agent = await providerRequest(endpoint, {}, signal);
  const attached = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
  const name = 'Seatable onboarding knowledge ' + config.id;
  let id = attempt.resource_id;
  if (!id && attempt.create_started) {
    id = attached.find(doc => doc.name === name && providerId(doc.id))?.id;
    id ||= await findProviderResource('/knowledge-base?search=' + encodeURIComponent(name),
      'documents', doc => doc.name === name, signal);
    if (!id) return { status: 'reconcile' };
  }
  if (!id) {
    const { config: latest, managerFacts, menuItems } = await loadKnowledgeBaseData(config.id);
    if (latest.elevenlabs_agent_id !== config.elevenlabs_agent_id) return { status: 'failed' };
    if (latest.elevenlabs_kb_doc_id) return { status: 'ok', document_id: latest.elevenlabs_kb_doc_id };
    await save({ create_started: true });
    try {
      const doc = await providerRequest('/knowledge-base/text', {
        method: 'POST',
        body: JSON.stringify({ name, text: buildKnowledgeDoc(latest, managerFacts, menuItems) }),
      }, signal);
      if (!providerId(doc.id)) return { status: 'reconcile' };
      id = doc.id;
    } catch (error) {
      if (!DEFINITIVE_REJECTIONS.has(error.providerStatus)) throw error;
      await save({ create_started: false });
      return { status: 'failed' };
    }
  }
  if (!attempt.resource_id) await save({ resource_id: id });

  const latestBeforePatch = await findOwnerRestaurant(config.user_id);
  if (latestBeforePatch?.id !== config.id || latestBeforePatch.elevenlabs_agent_id !== config.elevenlabs_agent_id) {
    return { status: 'reconcile' };
  }
  if (latestBeforePatch.voice_engine === 'openai_realtime') return { status: 'pending' };
  if (latestBeforePatch.elevenlabs_kb_doc_id) return { status: 'ok', document_id: latestBeforePatch.elevenlabs_kb_doc_id };
  const refreshedAgent = await providerRequest(endpoint, {}, signal);
  const latestAttachments = refreshedAgent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
  if (!latestAttachments.some(doc => doc.id === id)) {
    await providerRequest(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({
        conversation_config: {
          agent: { prompt: { knowledge_base: [...latestAttachments, { type: 'file', id, name }] } },
        },
      }),
    }, signal);
  }
  const linked = await checked(restaurantConfig().update({ elevenlabs_kb_doc_id: id })
    .eq('id', config.id).eq('user_id', config.user_id).eq('is_active', true).eq('is_demo', false)
    .eq('elevenlabs_agent_id', config.elevenlabs_agent_id).is('elevenlabs_kb_doc_id', null)
    .select('id').maybeSingle());
  if (linked) return { status: 'ok', document_id: id };
  const latest = await findOwnerRestaurant(config.user_id);
  return latest?.id === config.id && latest.elevenlabs_kb_doc_id
    ? { status: 'ok', document_id: latest.elevenlabs_kb_doc_id } : { status: 'reconcile' };
}

async function runSetupStep(config, step) {
  if (step === 'subscription' || step === 'whatsapp_registry') {
    try {
      const result = await checked(supabaseAdmin.rpc('apply_onboarding_database_step', {
        p_restaurant_id: config.id, p_step: step,
      }));
      return { status: result.status, ...subscriptionDetail(result.subscription) };
    } catch (error) {
      logger.warn('Database step needs retry', { step, restaurantId: config.id, error: error.message });
      return { status: 'failed' };
    }
  }
  if (step === 'knowledge_base' && !config.elevenlabs_agent_id) return { status: 'pending' };
  const attempt = await claimStep(config.id, step);
  if (!attempt) {
    const row = await checked(restaurantSteps(config.id).eq('step', step).maybeSingle());
    const status = row ? currentState(row) : 'failed';
    if (status !== 'ok') return { status };
    const latest = await findOwnerRestaurant(config.user_id);
    if (latest?.id !== config.id || !latest.is_active) return { status: 'failed' };
    return step === 'voice_agent'
      ? { status, agent_id: latest.elevenlabs_agent_id }
      : { status, document_id: latest.elevenlabs_kb_doc_id };
  }
  const save = update => checkpoint(config.id, attempt, update);
  let result;
  try {
    const latest = await findOwnerRestaurant(config.user_id);
    if (latest?.id !== config.id || !latest.is_active || latest.is_demo) throw new Error('Restaurant ownership changed');
    const signal = AbortSignal.timeout(step === 'voice_agent' ? 15_000 : 8_000);
    if (latest.voice_engine === 'openai_realtime') {
      result = { status: 'pending' };
    } else {
      result = step === 'voice_agent'
        ? await syncVoice(latest, attempt, save, signal)
        : await syncKnowledge(latest, attempt, save, signal);
    }
  } catch (error) {
    logger.warn('Provider step needs retry', { step, restaurantId: config.id, error: error.message });
    result = { status: attempt.create_started && !attempt.resource_id ? 'reconcile' : 'failed' };
  }
  await save({ state: result.status === 'blocked' ? 'failed' : result.status, attempt_id: null, lease_until: null });
  return result;
}

// Voice Settings and automatic/manual knowledge sync can reach the same
// provider while onboarding is still open. They share the same pending work.
async function runPendingProviderStep(restaurantId, step) {
  const row = await checked(restaurantSteps(restaurantId).eq('step', step).maybeSingle());
  if (!row || row.state === 'ok') return null;
  const config = await checked(restaurantConfig().select('id,user_id,elevenlabs_agent_id')
    .eq('id', restaurantId).eq('is_active', true).eq('is_demo', false).maybeSingle());
  if (!config) return { status: 'failed' };
  return runSetupStep(config, step);
}

module.exports = { STEPS, findOwnerRestaurant, getSetupStatus, runSetupStep, runPendingProviderStep };
