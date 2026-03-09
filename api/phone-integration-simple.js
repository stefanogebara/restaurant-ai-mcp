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

  const action = req.query.action || req.body?.action;

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
      case 'list-phones':
        return await handleListPhones(req, res);
      case 'diagnose':
        return await handleDiagnose(req, res);
      case 'fix-tools':
        return await handleFixTools(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: register, unregister, status, test-call, list-phones, diagnose, fix-tools',
          platform_phone: PLATFORM_TWILIO_NUMBER,
          elevenlabs_configured: !!ELEVENLABS_API_KEY && ELEVENLABS_API_KEY !== 'your-elevenlabs-key-here'
        });
    }
  } catch (error) {
    logger.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
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

  const { restaurant_id } = req.body;

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

  logger.info(`Registering platform phone ${PLATFORM_TWILIO_NUMBER} for restaurant ${restaurant_id}`);

  // Get restaurant config (restaurant_id = restaurant_config.id)
  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
    });
  }

  // If agent not in restaurant_config, fall back to restaurant_info (legacy storage path)
  let agentId = restaurant.elevenlabs_agent_id;
  if (!agentId) {
    const { data: infoRow } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .select('elevenlabs_agent_id')
      .eq('restaurant_name', restaurant.restaurant_name)
      .single();
    agentId = infoRow?.elevenlabs_agent_id || null;

    // Sync back to restaurant_config so future lookups work
    if (agentId) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ elevenlabs_agent_id: agentId })
        .eq('id', restaurant_id);
      logger.info(`Synced agent ${agentId} from restaurant_info to restaurant_config`);
    }
  }

  if (!agentId) {
    return res.status(400).json({
      success: false,
      error: 'Restaurant does not have an AI agent configured. Complete onboarding first.',
      restaurant_name: restaurant.restaurant_name
    });
  }

  // Use the resolved agent ID going forward
  restaurant.elevenlabs_agent_id = agentId;

  // Update status to pending
  await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      phone_integration_status: 'pending',
      phone_integration_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', restaurant_id);

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
        logger.error('ElevenLabs import error:', errorText);

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
          await updateError(restaurant_id, `Failed to import phone: ${errorText}`);
          return res.status(500).json({
            success: false,
            error: 'Failed to import phone number to ElevenLabs',
            details: errorText
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
      const errorText = await assignResponse.text();
      logger.error('Agent assignment error:', errorText);

      await updateError(restaurant_id, `Agent assignment failed: ${errorText}`);
      return res.status(500).json({
        success: false,
        error: 'Failed to assign agent to phone number',
        details: errorText
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
            toolsError = toolResult.error;
            logger.warn(`Auto tool creation warning: ${toolResult.error}. Phone registration will continue.`);
          } else {
            logger.info(`Auto-configured ${toolResult.toolCount} tools for agent`);
          }
        } else {
          toolsConfigured = true;
          logger.info(`Agent already has ${existingToolIds.length} tools configured`);
        }
      }
    } catch (toolErr) {
      toolsError = toolErr.message;
      logger.warn(`Auto tool creation failed: ${toolErr.message}. Phone registration will continue.`);
    }

    // Step 4: Save successful configuration
    await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({
        twilio_phone_number: PLATFORM_TWILIO_NUMBER,
        elevenlabs_phone_number_id: phoneNumberId,
        elevenlabs_phone_number: PLATFORM_TWILIO_NUMBER,
        phone_integration_status: 'active',
        phone_integration_error: null,
        phone_configured_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurant_id);

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
    logger.error('Registration error:', error);
    await updateError(restaurant_id, error.message);
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

  const { restaurant_id } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: restaurant_id'
    });
  }

  // Clear phone fields from restaurant (but don't delete from ElevenLabs - reusable)
  await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      twilio_phone_number: null,
      elevenlabs_phone_number: null,
      phone_integration_status: 'not_configured',
      phone_integration_error: null,
      phone_configured_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', restaurant_id);

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
  const restaurant_id = req.query.restaurant_id || req.body?.restaurant_id;

  // Platform status (no restaurant_id needed)
  if (!restaurant_id) {
    return res.status(200).json({
      success: true,
      platform: {
        twilio_configured: !!PLATFORM_TWILIO_SID && !!PLATFORM_TWILIO_TOKEN,
        twilio_phone: PLATFORM_TWILIO_NUMBER,
        elevenlabs_configured: !!ELEVENLABS_API_KEY && ELEVENLABS_API_KEY !== 'your-elevenlabs-key-here'
      }
    });
  }

  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found',
      debug_error: fetchError ? { message: fetchError.message, code: fetchError.code, details: fetchError.details } : null,
      debug_restaurant: restaurant === null ? 'null' : 'undefined',
      debug_id: restaurant_id
    });
  }

  return res.status(200).json({
    success: true,
    restaurant: {
      name: restaurant.restaurant_name,
      has_agent: !!restaurant.elevenlabs_agent_id,
      agent_id: restaurant.elevenlabs_agent_id,
      phone_number: restaurant.elevenlabs_phone_number || restaurant.twilio_phone_number,
      phone_number_id: restaurant.elevenlabs_phone_number_id,
      status: restaurant.phone_integration_status || 'not_configured',
      error: restaurant.phone_integration_error,
      configured_at: restaurant.phone_configured_at
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
  const { restaurant_id, to_number } = req.body || req.query;

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
    .select('restaurant_name, phone_integration_status, elevenlabs_agent_id')
    .eq('id', restaurant_id)
    .single();

  if (!restaurant || restaurant.phone_integration_status !== 'active') {
    return res.status(400).json({
      success: false,
      error: 'Restaurant phone integration not active. Register first.',
      status: restaurant?.phone_integration_status
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
 * List all phone numbers in ElevenLabs
 */
async function handleListPhones(req, res) {
  if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === 'your-elevenlabs-key-here') {
    return res.status(500).json({
      success: false,
      error: 'ElevenLabs API key not configured'
    });
  }

  const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY }
  });

  if (!response.ok) {
    const errorText = await response.text();
    return res.status(500).json({
      success: false,
      error: 'Failed to list phone numbers',
      details: errorText
    });
  }

  const data = await response.json();

  return res.status(200).json({
    success: true,
    phone_numbers: data.phone_numbers || [],
    count: data.phone_numbers?.length || 0
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

  const { restaurant_id } = req.body;

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  const { data: restaurant } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', restaurant_id)
    .single();

  if (!restaurant) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  let agentId = restaurant.elevenlabs_agent_id;
  if (!agentId) {
    const { data: infoRow } = await supabaseAdmin
      .schema('restaurant').from('restaurant_info')
      .select('elevenlabs_agent_id').eq('restaurant_name', restaurant.restaurant_name).single();
    agentId = infoRow?.elevenlabs_agent_id || null;
    if (agentId) {
      await supabaseAdmin.schema('restaurant').from('restaurant_config')
        .update({ elevenlabs_agent_id: agentId }).eq('id', restaurant_id);
    }
  }

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
  const restaurant_id = req.query.restaurant_id || req.body?.restaurant_id;

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  const { data: restaurant } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', restaurant_id)
    .single();

  if (!restaurant) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  let resolvedAgentId = restaurant.elevenlabs_agent_id;
  if (!resolvedAgentId) {
    const { data: infoRow } = await supabaseAdmin
      .schema('restaurant').from('restaurant_info')
      .select('elevenlabs_agent_id').eq('restaurant_name', restaurant.restaurant_name).single();
    resolvedAgentId = infoRow?.elevenlabs_agent_id || null;
    if (resolvedAgentId) {
      await supabaseAdmin.schema('restaurant').from('restaurant_config')
        .update({ elevenlabs_agent_id: resolvedAgentId }).eq('id', restaurant_id);
    }
  }

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
  const baseUrl = 'https://restaurant-ai-mcp.vercel.app';
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
 * Helper to update error status
 */
async function updateError(restaurant_id, errorMessage) {
  await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      phone_integration_status: 'error',
      phone_integration_error: errorMessage,
      updated_at: new Date().toISOString()
    })
    .eq('id', restaurant_id);
}
