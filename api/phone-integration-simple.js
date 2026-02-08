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

const { createClient } = require('@supabase/supabase-js');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('PhoneIntegrationSimple');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

// Platform Twilio credentials from environment
const PLATFORM_TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const PLATFORM_TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PLATFORM_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: register, unregister, status, test-call, list-phones',
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

  // Get restaurant info
  const { data: restaurant, error: fetchError } = await supabase
    .from('restaurant_info')
    .select('elevenlabs_agent_id, restaurant_name')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
    });
  }

  if (!restaurant.elevenlabs_agent_id) {
    return res.status(400).json({
      success: false,
      error: 'Restaurant does not have an AI agent configured. Complete onboarding first.',
      restaurant_name: restaurant.restaurant_name
    });
  }

  // Update status to pending
  await supabase
    .from('restaurant_info')
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

    // Step 4: Save successful configuration
    await supabase
      .from('restaurant_info')
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
  await supabase
    .from('restaurant_info')
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

  const { data: restaurant, error: fetchError } = await supabase
    .from('restaurant_info')
    .select(`
      restaurant_name,
      elevenlabs_agent_id,
      elevenlabs_phone_number,
      elevenlabs_phone_number_id,
      twilio_phone_number,
      phone_integration_status,
      phone_integration_error,
      phone_configured_at
    `)
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
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
  const { data: restaurant } = await supabase
    .from('restaurant_info')
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
 * Diagnose agent configuration - check if tools/webhooks are set up
 */
async function handleDiagnose(req, res) {
  const restaurant_id = req.query.restaurant_id || req.body?.restaurant_id;

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  }

  const { data: restaurant } = await supabase
    .from('restaurant_info')
    .select('restaurant_name, elevenlabs_agent_id, phone_integration_status')
    .eq('id', restaurant_id)
    .single();

  if (!restaurant || !restaurant.elevenlabs_agent_id) {
    return res.status(404).json({ success: false, error: 'Restaurant or agent not found' });
  }

  // Fetch agent config from ElevenLabs
  const agentResponse = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${restaurant.elevenlabs_agent_id}`,
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
    agent_id: restaurant.elevenlabs_agent_id,
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
    prompt_preview: agentData.conversation_config?.agent?.prompt?.prompt?.substring(0, 200) + '...'
  });
}

/**
 * Helper to update error status
 */
async function updateError(restaurant_id, errorMessage) {
  await supabase
    .from('restaurant_info')
    .update({
      phone_integration_status: 'error',
      phone_integration_error: errorMessage,
      updated_at: new Date().toISOString()
    })
    .eq('id', restaurant_id);
}
