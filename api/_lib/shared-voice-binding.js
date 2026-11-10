/** Durable, fail-closed restaurant binding for one ElevenLabs shared phone agent. */
const { supabaseAdmin } = require('./supabase');
const { getRestaurantById } = require('./restaurant-loader');
const { bearerEquals } = require('./secure-compare');

const E164 = /^\+[1-9]\d{7,14}$/;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{6,128}$/;

function isSharedToolAuth(req) {
  const secret = process.env.ELEVENLABS_SHARED_TOOL_SECRET;
  return typeof secret === 'string' && secret.length >= 32 &&
    !secret.startsWith('el_whsec_') &&
    secret !== process.env.CRON_SECRET && secret !== process.env.ELEVENLABS_WEBHOOK_SECRET &&
    !!process.env.ELEVENLABS_SHARED_AGENT_ID && E164.test(process.env.ELEVENLABS_SHARED_PHONE || '') &&
    bearerEquals(req.headers?.authorization, secret);
}

function readSharedContext(req) {
  const agentId = req.headers?.['x-agent-id'];
  const conversationId = req.headers?.['x-conversation-id'];
  const calledNumber = req.headers?.['x-called-number'];
  const callerNumber = req.headers?.['x-caller-number'] || null;
  const body = req.body || {};
  const query = req.query || {};
  const conflicts = [
    [body.agent_id, agentId], [query.agent_id, agentId],
    [body.conversation_id, conversationId], [query.conversation_id, conversationId],
    [body.called_phone, calledNumber], [query.called_phone, calledNumber],
  ];
  if (
    agentId !== process.env.ELEVENLABS_SHARED_AGENT_ID ||
    !CONVERSATION_ID.test(conversationId || '') ||
    calledNumber !== process.env.ELEVENLABS_SHARED_PHONE || !E164.test(calledNumber || '') ||
    (callerNumber && !E164.test(callerNumber)) ||
    conflicts.some(([claimed, trusted]) => claimed !== undefined && claimed !== trusted)
  ) throw new Error('Invalid shared voice context');
  return { agentId, conversationId, calledNumber, callerNumber };
}

function normalizedName(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

function matchesSpokenName(row, name) {
  if (normalizedName(row.restaurant_name) === name) return true;
  const aliases = row.ai_config?.phone?.shared_name_aliases;
  return Array.isArray(aliases) && aliases.slice(0, 10)
    .some(alias => normalizedName(alias) === name);
}

// Recovery suggestions are not identity matches. Only an extra standalone
// connector between otherwise identical canonical words can produce a candidate.
// Caller confirmation is an agent turn contract, not backend-verified speech.
function suggestCanonicalRestaurant(rows, name, cityName) {
  if (!cityName) return null;
  const sameCity = rows.filter(row => normalizedName(row.city) === cityName);
  // Do not steer a caller away from an existing name/alias, even if its owner
  // has opted out. Aliases participate in ownership guards, never candidates.
  if (sameCity.some(row => matchesSpokenName(row, name))) return null;
  const spokenWords = name.split(' ');
  const candidates = sameCity.filter(row => {
    const officialWords = normalizedName(row.restaurant_name).split(' ');
    return spokenWords.length === officialWords.length + 1 &&
      spokenWords.some((word, index) => index > 0 && index < spokenWords.length - 1 &&
        ['e', 'and', 'y'].includes(word) &&
        spokenWords.filter((_, i) => i !== index).join(' ') === officialWords.join(' '));
  });
  // An opted-out canonical name can still explain the utterance. Count every
  // plausible owner first; only a unique, explicitly opted-in candidate is safe.
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  if (candidate.ai_config?.phone?.shared_routing_enabled !== true) return null;
  const official = normalizedName(candidate.restaurant_name);
  if (sameCity.filter(row => matchesSpokenName(row, official)).length !== 1) return null;
  return {
    success: false, restaurant_identified: false, needs_confirmation: true,
    suggested_restaurant: { restaurant_name: candidate.restaurant_name, city: candidate.city },
    message: `Ask the caller: "Did you mean ${candidate.restaurant_name} in ${candidate.city}?" ` +
      'Wait for the next user turn and explicit confirmation before calling identify_restaurant again with that exact official name and city. The restaurant is not identified yet.',
  };
}

async function readBinding(conversationId) {
  const { data, error } = await supabaseAdmin.from('agent_conversations')
    .select('id, agent_id, restaurant_info_id, called_phone, caller_phone')
    .eq('conversation_id', conversationId).maybeSingle();
  if (error) throw error;
  return data;
}

function assertBinding(binding, ctx, restaurantId) {
  if (!binding) throw new Error('Shared conversation is not bound');
  if (binding.agent_id !== ctx.agentId || binding.called_phone !== ctx.calledNumber ||
      (binding.caller_phone || null) !== ctx.callerNumber ||
      !binding.restaurant_info_id || (restaurantId && binding.restaurant_info_id !== restaurantId)) {
    throw new Error('Shared conversation binding conflict');
  }
}

async function loadRealRestaurant(id) {
  const restaurant = await getRestaurantById(id);
  if (!restaurant || restaurant.id !== id || restaurant.is_demo !== false ||
      restaurant.onboarding_completed !== true ||
      restaurant.ai_config?.phone?.shared_routing_enabled !== true) {
    throw new Error('Shared conversation restaurant unavailable');
  }
  return restaurant;
}

async function bindConversation(ctx, restaurantId) {
  const existing = await readBinding(ctx.conversationId);
  if (existing) {
    assertBinding(existing, ctx, restaurantId);
    return;
  }
  const { error } = await supabaseAdmin.from('agent_conversations').insert({
    conversation_id: ctx.conversationId,
    agent_id: ctx.agentId,
    restaurant_info_id: restaurantId,
    caller_phone: ctx.callerNumber,
    called_phone: ctx.calledNumber,
    // Caller language is unknown until provider detection; the DB default is English.
    language: null,
    started_at: new Date().toISOString(),
    transcript: [], tools_used: [], errors_encountered: [],
    metadata: { voice_booking_guard: 'external_id_v1' },
  });
  // UNIQUE(conversation_id) makes concurrent identification safe. A duplicate
  // can only win if its durable binding matches this agent, number and owner.
  if (error && error.code !== '23505') throw error;
  const durable = await readBinding(ctx.conversationId);
  assertBinding(durable, ctx, restaurantId);
}

async function identifySharedRestaurant(ctx, restaurantName, city) {
  const name = normalizedName(restaurantName);
  const cityName = normalizedName(city);
  if (name.length < 3 || name.length > 120 || cityName.length > 120) {
    return { success: false, restaurant_identified: false, message: 'Please say the restaurant name.' };
  }
  const { data, error } = await supabaseAdmin.schema('restaurant').from('restaurant_config')
    .select('id, restaurant_name, city, ai_config')
    .eq('is_active', true).eq('onboarding_completed', true).eq('is_demo', false).limit(1000);
  if (error) throw error;
  // A truncated list could hide a second restaurant with the same name.
  if (data?.length >= 1000) throw new Error('Shared restaurant directory is incomplete');
  const byName = (data || []).filter(row => row.ai_config?.phone?.shared_routing_enabled === true &&
    matchesSpokenName(row, name));
  const matches = cityName ? byName.filter(row => normalizedName(row.city) === cityName) : byName;
  if (matches.length !== 1) {
    const suggestion = matches.length === 0 && suggestCanonicalRestaurant(data || [], name, cityName);
    if (suggestion) return suggestion;
    return matches.length > 1 || (byName.length > 1 && !cityName)
      ? { success: false, restaurant_identified: false, needs_clarification: true,
        message: 'I found more than one restaurant with that name. Which city is it in?',
        cities: [...new Set(byName.map(row => row.city).filter(Boolean))].slice(0, 5) }
      : { success: false, restaurant_identified: false, message: 'I could not find that restaurant. Please repeat its full name and city.' };
  }
  // A spoken alias is explicit configuration, but still requires a city. It
  // cannot claim another active restaurant's official name or alias there,
  // even when that other restaurant has not opted into shared routing.
  if (!cityName && normalizedName(matches[0].restaurant_name) !== name) {
    return { success: false, restaurant_identified: false, needs_clarification: true,
      message: 'Which city is the restaurant in?' };
  }
  const sameCityOwners = (data || []).filter(row =>
    matchesSpokenName(row, name) && normalizedName(row.city) === normalizedName(matches[0].city));
  if (sameCityOwners.length !== 1) {
    return { success: false, restaurant_identified: false,
      message: 'I found another restaurant with that name. Please say the exact full restaurant name and city.' };
  }
  const restaurant = await loadRealRestaurant(matches[0].id);
  await bindConversation(ctx, restaurant.id);
  return { success: true, restaurant_identified: true, restaurant_id: restaurant.id,
    restaurant_name: matches[0].restaurant_name, city: matches[0].city };
}

async function resolveSharedRestaurant(ctx) {
  const binding = await readBinding(ctx.conversationId);
  assertBinding(binding, ctx);
  return loadRealRestaurant(binding.restaurant_info_id);
}

module.exports = { isSharedToolAuth, readSharedContext, identifySharedRestaurant, resolveSharedRestaurant };
