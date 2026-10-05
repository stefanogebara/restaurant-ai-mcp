/**
 * Simplified Phone Integration API
 *
 * Uses PLATFORM Twilio credentials (from env vars) instead of requiring
 * each restaurant to have their own Twilio account.
 *
 * Endpoints:
 * - POST /api/phone-integration-simple?action=register - Assign platform phone to restaurant
 * - POST /api/phone-integration-simple?action=unregister - Remove phone assignment
 * - GET /api/phone-integration-simple?action=status - Get phone integration status
 * - GET /api/phone-integration-simple?action=test-call - Test the voice agent
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('PhoneIntegrationSimple');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

// Platform Twilio credentials from environment
const PLATFORM_TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const PLATFORM_TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
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
      if (!owned) {
        const { data: member, error: memberError } = await supabaseAdmin.schema('restaurant')
          .from('restaurant_members').select('restaurant_id')
          .eq('restaurant_id', authorizedId).eq('user_id', userId).eq('status', 'active').maybeSingle();
        if (memberError || !member) {
          if (memberError) throw memberError;
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }
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

/**
 * Register platform phone number with ElevenLabs for a restaurant
 * Restaurant only needs to provide restaurant_id - we use platform Twilio creds
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
  if (!PLATFORM_TWILIO_SID || !PLATFORM_TWILIO_TOKEN || !PLATFORM_TWILIO_NUMBER) {
    return res.status(500).json({
      success: false,
      error: 'Platform Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in environment.'
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

  // This RPC serializes claims for the shared number and checks legacy active
  // assignments in one DB transaction. A missing migration fails closed.
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
    // Step 1: Check if phone number already exists in ElevenLabs
    logger.info('Checking existing phone numbers in ElevenLabs...');

    const listResponse = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    let phoneNumberId = null;

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const existingPhone = listData.phone_numbers?.find(
        p => p.phone_number === PLATFORM_TWILIO_NUMBER
      );

      if (existingPhone) {
        phoneNumberId = existingPhone.phone_number_id;
        logger.info(`Phone already registered in ElevenLabs with ID: ${phoneNumberId}`);
      }
    }

    // Step 2: If not exists, import the phone number
    if (!phoneNumberId) {
      logger.info('Importing phone number to ElevenLabs...');

      const importResponse = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers/create', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: PLATFORM_TWILIO_NUMBER,
          label: `Seatable - ${restaurant.restaurant_name}`,
          provider: 'twilio',
          sid: PLATFORM_TWILIO_SID,
          token: PLATFORM_TWILIO_TOKEN
        })
      });

      if (!importResponse.ok) {
        const errorText = await importResponse.text();
        logger.error('ElevenLabs phone import failed');

        // Check if error is "phone already exists"
        if (errorText.includes('already') || errorText.includes('exists')) {
          // Try to get the existing phone number ID
          const retryList = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
            headers: { 'xi-api-key': ELEVENLABS_API_KEY }
          });

          if (retryList.ok) {
            const retryData = await retryList.json();
            const found = retryData.phone_numbers?.find(p => p.phone_number === PLATFORM_TWILIO_NUMBER);
            if (found) {
              phoneNumberId = found.phone_number_id;
              logger.info(`Found existing phone ID on retry: ${phoneNumberId}`);
            }
          }
        }

        if (!phoneNumberId) {
          await updateError(restaurant_id, claimToken);
          return res.status(500).json({
            success: false,
            error: 'Failed to import phone number to ElevenLabs',
          });
        }
      } else {
        const importData = await importResponse.json();
        phoneNumberId = importData.phone_number_id;
        logger.info(`Phone imported with ID: ${phoneNumberId}`);
      }
    }

    // Step 3: Assign the agent to this phone number
    logger.info(`Assigning agent ${restaurant.elevenlabs_agent_id} to phone ${phoneNumberId}...`);

    const assignResponse = await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: restaurant.elevenlabs_agent_id
      })
    });

    if (!assignResponse.ok) {
      logger.error('ElevenLabs agent assignment failed');

      await updateError(restaurant_id, claimToken);
      return res.status(500).json({
        success: false,
        error: 'Failed to assign agent to phone number',
      });
    }

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

    // Step 4: Save successful configuration (stored in ai_config.phone)
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
      message: 'Phone number successfully registered and connected to AI agent',
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

/**
 * Unregister phone from restaurant (but keep in ElevenLabs for reuse)
 */
async function handleUnregister(req, res) {
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

  const { data: released, error: releaseError } = await supabaseAdmin.rpc('release_platform_phone', {
    p_restaurant_id: restaurant_id,
    p_phone_number: PLATFORM_TWILIO_NUMBER
  });
  if (releaseError || !released) {
    return res.status(releaseError?.code === 'P0001' ? 409 : 503).json({
      success: false,
      error: releaseError?.code === 'P0001' ? 'Phone registration is in progress' : 'Could not unregister phone',
    });
  }

  logger.info(`Unregistered phone for restaurant ${restaurant_id}`);

  return res.status(200).json({
    success: true,
    message: 'Phone number unregistered from restaurant'
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
        status: 'not_configured',
        error: null,
        configured_at: null
      },
      platform: {
        twilio_phone: PLATFORM_TWILIO_NUMBER
      }
    });
  }

  const phoneInfo = restaurant.ai_config?.phone || {};
  return res.status(200).json({
    success: true,
    restaurant: {
      name: restaurant.restaurant_name,
      has_agent: !!restaurant.elevenlabs_agent_id,
      agent_id: restaurant.elevenlabs_agent_id,
      phone_number: phoneInfo.number || null,
      phone_number_id: phoneInfo.number_id || null,
      status: phoneInfo.status || 'not_configured',
      error: phoneInfo.error || null,
      configured_at: phoneInfo.configured_at || null
    },
    platform: {
      twilio_phone: PLATFORM_TWILIO_NUMBER
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
