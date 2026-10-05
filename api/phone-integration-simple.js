/**
 * Simplified Phone Integration API
 *
 * Uses PLATFORM Twilio credentials (from env vars) instead of requiring
 * each restaurant to have their own Twilio account.
 *
 * Endpoints:
 * - POST /api/phone-integration-simple?action=register - Support-assisted setup only
 * - POST /api/phone-integration-simple?action=unregister - Request support-assisted disconnection
 * - GET /api/phone-integration-simple?action=status - Get phone integration status
 * - POST /api/phone-integration-simple?action=test-call - Manual test instructions only
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('PhoneIntegrationSimple');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

// Platform Twilio credentials from environment
const PLATFORM_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const action = req.query.action || req.body?.action;

  // Provider inventory belongs to the platform, not to an individual tenant.
  if (action === 'list-phones') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  if (['register', 'unregister', 'status', 'test-call', 'diagnose', 'fix-tools'].includes(action)) {
    const requestedId = req.query?.restaurant_id || req.body?.restaurant_id;
    if (req.query?.restaurant_id && req.body?.restaurant_id && req.query.restaurant_id !== req.body.restaurant_id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const restaurantId = requestedId && requestedId !== 'undefined' && requestedId !== 'null'
      ? requestedId : auth.user?.restaurant_id;
    const userId = auth.user?.id || auth.user?.sub;
    if (!userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    // The JWT restaurant hint may come from mutable user metadata. Prove ownership
    // or active membership in the database before any service-role read/write.
    try {
      let authorizedId = restaurantId;
      if (!authorizedId) {
        const { data: owned, error } = await supabaseAdmin.schema('restaurant')
          .from('restaurant_config').select('id').eq('user_id', userId).limit(1).maybeSingle();
        if (error) throw error;
        authorizedId = owned?.id;
        if (!authorizedId) {
          const { data: member, error: memberError } = await supabaseAdmin.schema('restaurant')
            .from('restaurant_members').select('restaurant_id')
            .eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle();
          if (memberError) throw memberError;
          authorizedId = member?.restaurant_id;
        }
      }
      if (!authorizedId) return res.status(403).json({ success: false, error: 'Forbidden' });
      const { data: owned, error: ownerError } = await supabaseAdmin.schema('restaurant')
        .from('restaurant_config').select('id').eq('id', authorizedId).eq('user_id', userId).maybeSingle();
      if (ownerError) throw ownerError;
      let memberRole = null;
      if (!owned) {
        const { data: member, error: memberError } = await supabaseAdmin.schema('restaurant')
          .from('restaurant_members').select('restaurant_id, role')
          .eq('restaurant_id', authorizedId).eq('user_id', userId).eq('status', 'active').maybeSingle();
        if (memberError || !member) {
          if (memberError) throw memberError;
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        memberRole = member.role;
      }
      if (['register', 'unregister', 'test-call', 'fix-tools', 'diagnose'].includes(action)
        && !owned && memberRole !== 'manager') {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      req._authRestaurantId = authorizedId;
    } catch (error) {
      logger.error('Phone authorization lookup failed');
      return res.status(503).json({ success: false, error: 'Authorization unavailable' });
    }
  }

  try {
    switch (action) {
      case 'register':
        return await handleRegister(req, res);
      case 'unregister':
        return await handleUnregister(req, res);
      case 'status':
        return await handleStatus(req, res);
      case 'test-call':
        return await handleTestCall(req, res);
      case 'diagnose':
        return await handleDiagnose(req, res);
      case 'fix-tools':
        return await handleFixTools(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: register, unregister, status, test-call, diagnose, fix-tools',
          elevenlabs_configured: !!ELEVENLABS_API_KEY && ELEVENLABS_API_KEY !== 'your-elevenlabs-key-here'
        });
    }
  } catch (error) {
    logger.error('Phone integration request failed');
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/** Shared platform-number assignment and transfer require support review. */
async function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  return res.status(409).json({
    success: false,
    error: 'This shared phone requires support-assisted setup.'
  });
}

/** Shared forwarding must be reviewed before disconnecting or transferring. */
async function handleUnregister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  return res.status(409).json({
    success: false,
    error: 'This shared phone requires support-assisted disconnection.'
  });
}

/**
 * Get phone integration status
 */
async function handleStatus(req, res) {
  // The raw string 'undefined' sometimes arrives when the frontend hook can't
  // resolve restaurant_id from the JWT metadata (older users created before
  // the metadata.restaurant_id backfill). Normalize it out.
  const restaurant_id = req._authRestaurantId;

  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, elevenlabs_agent_id, ai_config')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    // Return sensible defaults instead of 404/500 when table/column missing or restaurant not found
    logger.warn('phone-integration status: restaurant query failed, returning defaults', {
      restaurant_id,
      error: fetchError?.message || 'not found'
    });
    return res.status(200).json({
      success: true,
      restaurant: {
        name: null,
        has_agent: false,
        agent_id: null,
        phone_number: null,
        phone_number_id: null,
        status: 'unknown',
        error: null,
        configured_at: null
      },
      platform: {
        line_availability: 'unknown',
        twilio_phone: null
      }
    });
  }

  const phoneInfo = restaurant.ai_config?.phone || {};
  const { data: availability, error: availabilityError } = await supabaseAdmin.rpc('platform_phone_availability', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER
  });
  const lineAvailability = !availabilityError && [
    'available', 'owned_by_this_restaurant', 'unavailable', 'unknown'
  ].includes(availability) ? availability : 'unknown';
  const ownsActiveLine = lineAvailability === 'owned_by_this_restaurant'
    && phoneInfo.status === 'active' && phoneInfo.number === PLATFORM_TWILIO_NUMBER;
  const status = lineAvailability === 'unavailable' || lineAvailability === 'unknown'
    ? lineAvailability
    : ownsActiveLine
      ? 'active'
      : lineAvailability === 'owned_by_this_restaurant' && phoneInfo.status === 'active'
        ? 'unknown'
        : lineAvailability === 'owned_by_this_restaurant' && ['pending', 'error'].includes(phoneInfo.status)
          ? phoneInfo.status
          : 'not_configured';
  return res.status(200).json({
    success: true,
    restaurant: {
      name: restaurant.restaurant_name,
      has_agent: !!restaurant.elevenlabs_agent_id,
      agent_id: restaurant.elevenlabs_agent_id,
      phone_number: ownsActiveLine ? phoneInfo.number : null,
      phone_number_id: ownsActiveLine ? phoneInfo.number_id || null : null,
      status,
      error: status === 'unavailable' || status === 'unknown'
        ? 'Shared phone availability requires support review' : status === 'error' ? phoneInfo.error || null : null,
      configured_at: ownsActiveLine ? phoneInfo.configured_at || null : null
    },
    platform: {
      line_availability: lineAvailability,
      twilio_phone: ownsActiveLine ? PLATFORM_TWILIO_NUMBER : null
    }
  });
}

/**
 * Return instructions for a manual call to the configured voice number.
 */
async function handleTestCall(req, res) {
  const restaurant_id = req._authRestaurantId;
  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing restaurant_id'
    });
  }

  const { data: availability, error: availabilityError } = await supabaseAdmin.rpc('platform_phone_availability', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER
  });
  if (availabilityError || availability !== 'owned_by_this_restaurant') {
    return res.status(409).json({ success: false, error: 'Shared phone ownership requires support review' });
  }

  // Get restaurant to verify it's configured
  const { data: restaurant } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, ai_config, elevenlabs_agent_id')
    .eq('id', restaurant_id)
    .single();

  const phoneStatus = restaurant?.ai_config?.phone?.status;
  if (!restaurant || phoneStatus !== 'active' || restaurant.ai_config.phone.number !== PLATFORM_TWILIO_NUMBER) {
    return res.status(400).json({
      success: false,
      error: 'Restaurant phone assignment is not verified. Contact support.',
      status: phoneStatus || 'not_configured'
    });
  }

  // This endpoint does not place an outbound call. It only explains a manual test.
  return res.status(200).json({
    success: true,
    manual_test_only: true,
    message: 'Manual test instructions; no call was placed',
    instructions: {
      manual_test: `Call ${PLATFORM_TWILIO_NUMBER} from any phone to test the AI agent`,
      restaurant: restaurant.restaurant_name,
      agent_id: restaurant.elevenlabs_agent_id
    }
  });
}

/**
 * Tool repair requires support review. This endpoint must not mutate provider tools.
 */
async function handleFixTools(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  // The old helper created unauthenticated webhook tools and could replace a
  // working agent's tools. The canonical agent service owns tool provisioning.
  return res.status(409).json({
    success: false,
    error: 'Agent tool repair requires support review.'
  });
}

/**
 * Diagnose agent configuration - check if tools/webhooks are set up
 */
async function handleDiagnose(req, res) {
  const restaurant_id = req._authRestaurantId;

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  const { data: restaurant } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, elevenlabs_agent_id')
    .eq('id', restaurant_id)
    .single();

  if (!restaurant) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  // Fonte única: restaurant_config (fallback por nome em restaurant_info
  // removido em 02/08/2026 — ver comentário no início do arquivo).
  const resolvedAgentId = restaurant.elevenlabs_agent_id;

  if (!resolvedAgentId) {
    return res.status(404).json({ success: false, error: 'Restaurant agent not found. Complete onboarding first.' });
  }

  // Fetch agent config from ElevenLabs
  const agentResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${resolvedAgentId}`,
    { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
  );

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    return res.status(500).json({ success: false, error: 'Failed to fetch agent config', details: errorText });
  }

  const agentData = await agentResponse.json();
  const tools = agentData.conversation_config?.agent?.tools || [];

  return res.status(200).json({
    success: true,
    restaurant_name: restaurant.restaurant_name,
    agent_id: resolvedAgentId,
    agent_name: agentData.name,
    has_tools: tools.length > 0,
    tool_count: tools.length,
    tools: tools.map(t => ({
      name: t.name,
      type: t.type,
      url: t.webhook?.url || t.url || null
    })),
    language: agentData.conversation_config?.agent?.language,
    first_message: agentData.conversation_config?.agent?.first_message,
    prompt_preview: agentData.conversation_config?.agent?.prompt?.prompt?.substring(0, 200) + '...',
    tool_ids: agentData.conversation_config?.agent?.prompt?.tool_ids || [],
    tool_ids_count: (agentData.conversation_config?.agent?.prompt?.tool_ids || []).length
  });
}
