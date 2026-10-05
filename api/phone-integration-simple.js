/**
 * Simplified Phone Integration API
 *
 * Uses PLATFORM Twilio credentials (from env vars) instead of requiring
 * each restaurant to have their own Twilio account.
 *
 * Endpoints:
 * - POST /api/phone-integration-simple?action=register - Verify an existing platform phone assignment
 * - POST /api/phone-integration-simple?action=unregister - Request support-assisted disconnection
 * - GET /api/phone-integration-simple?action=status - Get phone integration status
 * - GET /api/phone-integration-simple?action=test-call - Test the voice agent
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

async function lookupProviderPhone() {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
    method: 'GET',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY }
  });
  if (!response.ok) throw new Error('Provider phone lookup failed');
  const payload = await response.json();
  // ElevenLabs has returned both a bare array and a phone_numbers wrapper.
  const phones = Array.isArray(payload) ? payload : payload?.phone_numbers;
  if (!Array.isArray(phones)) throw new Error('Provider phone list has an unknown shape');
  const matches = phones.filter(phone => phone.phone_number === PLATFORM_TWILIO_NUMBER);
  if (matches.length > 1) throw new Error('Provider phone number is ambiguous');
  if (matches.length === 1 && !matches[0].phone_number_id) {
    throw new Error('Provider phone number has no ID');
  }
  return matches[0] || null;
}

/**
 * Refresh an existing, verified assignment of the shared platform number.
 * A new assignment or transfer requires support review.
 */
async function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const restaurant_id = req._authRestaurantId;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: restaurant_id'
    });
  }

  // Check platform configuration
  if (!PLATFORM_TWILIO_NUMBER) {
    return res.status(500).json({
      success: false,
      error: 'Platform phone is not configured.'
    });
  }

  if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your-elevenlabs-key-here') {
    return res.status(500).json({
      success: false,
      error: 'ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in environment.'
    });
  }

  logger.info('Registering platform phone for authorized restaurant');

  // Get restaurant config (restaurant_id = restaurant_config.id)
  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, elevenlabs_agent_id, ai_config, phone')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
    });
  }

  // Fonte única: restaurant_config. O fallback que lia restaurant_info casando
  // por `restaurant_name` foi removido em 02/08/2026 (tabela aposentada) — além
  // de a tabela estar vazia, casar tenant por nome trocaria o agente de voz
  // entre dois clientes homônimos.
  const agentId = restaurant.elevenlabs_agent_id;

  if (!agentId) {
    return res.status(400).json({
      success: false,
      error: 'Restaurant does not have an AI agent configured. Complete onboarding first.',
      restaurant_name: restaurant.restaurant_name
    });
  }

  // Use the resolved agent ID going forward
  restaurant.elevenlabs_agent_id = agentId;

  const { data: availability, error: availabilityError } = await supabaseAdmin.rpc('platform_phone_availability', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER
  });
  if (availabilityError || availability === 'unknown') {
    return res.status(503).json({ success: false, error: 'Platform phone ownership cannot be verified' });
  }
  if (availability !== 'owned_by_this_restaurant') {
    return res.status(409).json({ success: false, error: 'Shared platform phone is not assigned to this restaurant' });
  }

  // An existing provider number must already point at this restaurant's agent.
  // Unknown or different assignments require support review; never PATCH them.
  let providerPhone;
  try {
    providerPhone = await lookupProviderPhone();
  } catch (_) {
    return res.status(503).json({ success: false, error: 'Could not verify platform phone ownership' });
  }
  if (!providerPhone || providerPhone.assigned_agent?.agent_id !== agentId) {
    return res.status(409).json({ success: false, error: 'Platform phone assignment requires support review' });
  }

  // Only an existing, unique local owner can refresh the shared number.
  // This RPC serializes claims. A missing migration fails closed.
  const { data: claimToken, error: claimError } = await supabaseAdmin.rpc('claim_platform_phone', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER
  });
  if (claimError || !claimToken) {
    return res.status(claimError?.code === 'P0001' ? 409 : 503).json({
      success: false,
      error: claimError?.code === 'P0001' ? 'Platform phone is already claimed' : 'Could not claim platform phone'
    });
  }

  try {
    const phoneNumberId = providerPhone.phone_number_id;

    // Step 3.5: Auto-configure tools if agent doesn't have them
    let toolsConfigured = false;
    let toolsError = null;
    try {
      // Check if agent already has tools configured
      const agentCheckResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${restaurant.elevenlabs_agent_id}`,
        { headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
      );

      if (agentCheckResponse.ok) {
        const agentData = await agentCheckResponse.json();
        const existingToolIds = agentData.conversation_config?.agent?.prompt?.tool_ids || [];

        if (existingToolIds.length === 0) {
          logger.info(`Agent ${restaurant.elevenlabs_agent_id} has no tools configured, auto-creating...`);
          const toolResult = await createAndAssignTools(restaurant_id, restaurant.elevenlabs_agent_id);
          toolsConfigured = toolResult.success;
          if (!toolResult.success) {
            toolsError = 'Could not configure agent tools';
            logger.warn('Auto tool creation failed; phone registration will continue');
          } else {
            logger.info(`Auto-configured ${toolResult.toolCount} tools for agent`);
          }
        } else {
          toolsConfigured = true;
          logger.info(`Agent already has ${existingToolIds.length} tools configured`);
        }
      }
    } catch (toolErr) {
      toolsError = 'Could not configure agent tools';
      logger.warn('Auto tool creation failed; phone registration will continue');
    }

    // The provider can change outside our DB transaction. Check again before
    // declaring the local assignment active; cross-system atomicity is absent.
    const currentProviderPhone = await lookupProviderPhone();
    if (currentProviderPhone?.phone_number_id !== phoneNumberId
      || currentProviderPhone?.assigned_agent?.agent_id !== agentId) {
      await updateError(restaurant_id, claimToken);
      return res.status(409).json({ success: false, error: 'Platform phone assignment changed during verification' });
    }

    // Save successful configuration (stored in ai_config.phone)
    const { data: activated, error: activationError } = await supabaseAdmin.rpc('activate_platform_phone', {
      p_restaurant_id: restaurant_id,
      p_phone_number: PLATFORM_TWILIO_NUMBER,
      p_claim_token: claimToken,
      p_number_id: phoneNumberId
    });
    if (activationError || !activated) {
      return res.status(503).json({ success: false, error: 'Phone assignment could not be saved' });
    }

    logger.info(`SUCCESS: Phone ${PLATFORM_TWILIO_NUMBER} configured for ${restaurant.restaurant_name}`);

    return res.status(200).json({
      success: true,
      message: 'Existing phone assignment verified',
      data: {
        restaurant_name: restaurant.restaurant_name,
        phone_number: PLATFORM_TWILIO_NUMBER,
        phone_number_id: phoneNumberId,
        agent_id: restaurant.elevenlabs_agent_id,
        status: 'active',
        tools_configured: toolsConfigured,
        tools_warning: toolsError || undefined,
        test_instructions: `Call ${PLATFORM_TWILIO_NUMBER} to test the AI agent for ${restaurant.restaurant_name}`
      }
    });

  } catch (error) {
    logger.error('Phone registration failed');
    await updateError(restaurant_id, claimToken);
    throw error;
  }
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
  return res.status(200).json({
    success: true,
    restaurant: {
      name: restaurant.restaurant_name,
      has_agent: !!restaurant.elevenlabs_agent_id,
      agent_id: restaurant.elevenlabs_agent_id,
      phone_number: ownsActiveLine ? phoneInfo.number : null,
      phone_number_id: ownsActiveLine ? phoneInfo.number_id || null : null,
      status: lineAvailability === 'unavailable' || lineAvailability === 'unknown'
        ? lineAvailability : phoneInfo.status || 'not_configured',
      error: lineAvailability === 'unavailable' || lineAvailability === 'unknown'
        ? 'Shared phone availability requires support review' : phoneInfo.error || null,
      configured_at: ownsActiveLine ? phoneInfo.configured_at || null : null
    },
    platform: {
      line_availability: lineAvailability,
      twilio_phone: ownsActiveLine ? PLATFORM_TWILIO_NUMBER : null
    }
  });
}

/**
 * Test the voice agent by initiating a call
 */
async function handleTestCall(req, res) {
  const restaurant_id = req._authRestaurantId;
  const to_number = req.body?.to_number || req.query?.to_number;

  if (!restaurant_id || !to_number) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: restaurant_id, to_number'
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
  if (!restaurant || phoneStatus !== 'active') {
    return res.status(400).json({
      success: false,
      error: 'Restaurant phone integration not active. Register first.',
      status: phoneStatus || 'not_configured'
    });
  }

  // For now, just return instructions (actual outbound call requires more setup)
  return res.status(200).json({
    success: true,
    message: 'Test call instructions',
    instructions: {
      manual_test: `Call ${PLATFORM_TWILIO_NUMBER} from any phone to test the AI agent`,
      restaurant: restaurant.restaurant_name,
      agent_id: restaurant.elevenlabs_agent_id
    }
  });
}

/**
 * Fix agent tools - create webhook tools and attach to agent via tool_ids
 * Uses the new ElevenLabs API (post July 2025): create tools separately, then reference by ID
 */
async function handleFixTools(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

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
  const agentId = restaurant.elevenlabs_agent_id;

  if (!agentId) {
    return res.status(404).json({ success: false, error: 'Restaurant agent not found. Complete onboarding first.' });
  }

  const result = await createAndAssignTools(restaurant_id, agentId);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.error
    });
  }

  return res.status(200).json({
    success: true,
    message: `Created ${result.toolCount} tools and assigned to agent`,
    agent_id: restaurant.elevenlabs_agent_id,
    tool_count: result.toolCount
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

/**
 * Helper to create webhook tools and assign them to an agent.
 * Used by both handleFixTools() and the auto-configure step in handleRegister().
 * Returns { success, toolCount, error }
 */
async function createAndAssignTools(restaurant_id, agent_id) {
  const baseUrl = 'https://seatable.one';
  const rid = restaurant_id;

  const toolDefinitions = [
    {
      type: 'webhook',
      name: 'get_current_datetime',
      description: 'Get the current date and time. Use this at the start of conversations to know what "today" and "tomorrow" mean.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=get_current_datetime`,
        method: 'GET'
      }
    },
    {
      type: 'webhook',
      name: 'check_availability',
      description: 'Check table availability for a specific date, time, and party size. Use this before creating a reservation.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=check_availability&restaurant_id=${rid}`,
        method: 'POST',
        content_type: 'application/json',
        request_body_schema: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format' },
            party_size: { type: 'number', description: 'Number of guests' }
          },
          required: ['date', 'time', 'party_size']
        }
      }
    },
    {
      type: 'webhook',
      name: 'create_reservation',
      description: 'Create a new reservation after confirming all details with the customer. Only use after checking availability and getting customer name, phone.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=create_reservation&restaurant_id=${rid}`,
        method: 'POST',
        content_type: 'application/json',
        request_body_schema: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Full name of customer' },
            customer_phone: { type: 'string', description: 'Phone number' },
            customer_email: { type: 'string', description: 'Email address (optional)' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format' },
            party_size: { type: 'number', description: 'Number of guests' },
            special_requests: { type: 'string', description: 'Special requests (optional)' }
          },
          required: ['customer_name', 'customer_phone', 'date', 'time', 'party_size']
        }
      }
    },
    {
      type: 'webhook',
      name: 'lookup_reservation',
      description: 'Find an existing reservation by customer phone number or name.',
      api_schema: {
        url: `${baseUrl}/api/reservations?action=lookup&restaurant_id=${rid}`,
        method: 'POST',
        content_type: 'application/json',
        request_body_schema: {
          type: 'object',
          properties: {
            customer_phone: { type: 'string', description: 'Phone number' },
            customer_name: { type: 'string', description: 'Name (optional if phone provided)' }
          }
        }
      }
    },
    {
      type: 'webhook',
      name: 'cancel_reservation',
      description: 'Cancel an existing reservation by its reservation ID.',
      api_schema: {
        url: `${baseUrl}/api/reservations?action=cancel&restaurant_id=${rid}`,
        method: 'POST',
        content_type: 'application/json',
        request_body_schema: {
          type: 'object',
          properties: {
            reservation_id: { type: 'string', description: 'Reservation ID to cancel' }
          },
          required: ['reservation_id']
        }
      }
    }
  ];

  const createdToolIds = [];
  const errors = [];

  for (const toolDef of toolDefinitions) {
    try {
      const createResponse = await fetch('https://api.elevenlabs.io/v1/convai/tools', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tool_config: toolDef })
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        errors.push({ tool: toolDef.name, error: errorText });
        continue;
      }

      const toolData = await createResponse.json();
      const toolId = toolData.tool_id || toolData.id || toolData.tool_config?.id;
      createdToolIds.push(toolId);
    } catch (err) {
      errors.push({ tool: toolDef.name, error: err.message });
    }
  }

  if (createdToolIds.length === 0) {
    return { success: false, toolCount: 0, error: `Failed to create any tools: ${JSON.stringify(errors)}` };
  }

  // Assign tool IDs to the agent
  const patchResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${agent_id}`,
    {
      method: 'PATCH',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              tool_ids: createdToolIds
            }
          }
        }
      })
    }
  );

  if (!patchResponse.ok) {
    const errorText = await patchResponse.text();
    return { success: false, toolCount: createdToolIds.length, error: `Tools created but failed to assign: ${errorText}` };
  }

  return { success: true, toolCount: createdToolIds.length, error: null };
}

/**
 * Helper to update error status (stored in ai_config.phone)
 */
async function updateError(restaurant_id, claimToken) {
  await supabaseAdmin.rpc('fail_platform_phone_claim', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER,
    p_claim_token: claimToken
  });
}
