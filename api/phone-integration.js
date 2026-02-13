/**
 * Phone Integration API
 *
 * Handles Twilio phone number registration with ElevenLabs Conversational AI.
 * Allows restaurants to connect their phone numbers so customers can call
 * and interact with the AI agent directly.
 *
 * Endpoints:
 * - POST /api/phone-integration?action=register - Register phone number with ElevenLabs
 * - POST /api/phone-integration?action=unregister - Remove phone number
 * - GET /api/phone-integration?action=status - Get current phone integration status
 * - POST /api/phone-integration?action=assign-agent - Assign agent to phone number
 */

const fetch = require('node-fetch');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('PhoneIntegration');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

module.exports = async (req, res) => {
  // Use secure CORS for internal API endpoints
  setInternalCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  const action = req.query.action || req.body?.action;

  try {
    switch (action) {
      case 'register':
        return await handleRegisterPhoneNumber(req, res);
      case 'unregister':
        return await handleUnregisterPhoneNumber(req, res);
      case 'status':
        return await handleGetStatus(req, res);
      case 'assign-agent':
        return await handleAssignAgent(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: register, unregister, status, or assign-agent'
        });
    }
  } catch (error) {
    logger.error('[Phone Integration] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

/**
 * Register a Twilio phone number with ElevenLabs
 */
async function handleRegisterPhoneNumber(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const {
    restaurant_id,
    twilio_account_sid,
    twilio_auth_token,
    twilio_phone_number,
    label
  } = req.body;

  // Validate required fields
  if (!restaurant_id || !twilio_account_sid || !twilio_auth_token || !twilio_phone_number) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: restaurant_id, twilio_account_sid, twilio_auth_token, twilio_phone_number'
    });
  }

  // Validate phone number format (E.164)
  if (!twilio_phone_number.match(/^\+[1-9]\d{1,14}$/)) {
    return res.status(400).json({
      success: false,
      error: 'Phone number must be in E.164 format (e.g., +1234567890)'
    });
  }

  logger.info(`[Phone Integration] Registering phone ${twilio_phone_number} for restaurant ${restaurant_id}`);

  // Get restaurant info to check if agent exists
  const { data: restaurant, error: fetchError } = await supabaseAdmin
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
      error: 'Restaurant does not have an AI agent configured. Complete onboarding first.'
    });
  }

  // Update status to pending
  await supabaseAdmin
    .from('restaurant_info')
    .update({
      phone_integration_status: 'pending',
      phone_integration_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', restaurant_id);

  try {
    // Step 1: Import the Twilio phone number to ElevenLabs
    const importResponse = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers/create', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: twilio_phone_number,
        label: label || `${restaurant.restaurant_name} AI Line`,
        provider: 'twilio',
        twilio_config: {
          account_sid: twilio_account_sid,
          auth_token: twilio_auth_token
        }
      })
    });

    if (!importResponse.ok) {
      const errorText = await importResponse.text();
      logger.error('[Phone Integration] ElevenLabs import error:', errorText);

      // Update status to error
      await supabaseAdmin
        .from('restaurant_info')
        .update({
          phone_integration_status: 'error',
          phone_integration_error: `Failed to import phone number: ${errorText}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', restaurant_id);

      return res.status(500).json({
        success: false,
        error: 'Failed to import phone number to ElevenLabs',
        details: errorText
      });
    }

    const importData = await importResponse.json();
    const phoneNumberId = importData.phone_number_id;

    logger.info(`[Phone Integration] Phone number imported with ID: ${phoneNumberId}`);

    // Step 2: Assign the agent to handle inbound calls
    const assignResponse = await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: restaurant.elevenlabs_agent_id
      })
    });

    if (!assignResponse.ok) {
      const errorText = await assignResponse.text();
      logger.error('[Phone Integration] Agent assignment error:', errorText);

      // Phone is imported but agent not assigned - partial success
      await supabaseAdmin
        .from('restaurant_info')
        .update({
          twilio_account_sid,
          twilio_auth_token,
          twilio_phone_number,
          elevenlabs_phone_number_id: phoneNumberId,
          elevenlabs_phone_number: twilio_phone_number,
          phone_integration_status: 'error',
          phone_integration_error: `Phone imported but agent assignment failed: ${errorText}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', restaurant_id);

      return res.status(500).json({
        success: false,
        error: 'Phone imported but failed to assign agent',
        phone_number_id: phoneNumberId,
        details: errorText
      });
    }

    // Step 3: Save successful configuration
    await supabaseAdmin
      .from('restaurant_info')
      .update({
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        elevenlabs_phone_number_id: phoneNumberId,
        elevenlabs_phone_number: twilio_phone_number,
        phone_integration_status: 'active',
        phone_integration_error: null,
        phone_configured_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurant_id);

    logger.info(`[Phone Integration] Successfully configured phone ${twilio_phone_number} for restaurant ${restaurant_id}`);

    return res.status(200).json({
      success: true,
      message: 'Phone number successfully registered and connected to AI agent',
      data: {
        phone_number: twilio_phone_number,
        phone_number_id: phoneNumberId,
        agent_id: restaurant.elevenlabs_agent_id,
        status: 'active'
      }
    });

  } catch (error) {
    logger.error('[Phone Integration] Registration error:', error);

    await supabaseAdmin
      .from('restaurant_info')
      .update({
        phone_integration_status: 'error',
        phone_integration_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurant_id);

    throw error;
  }
}

/**
 * Unregister a phone number from ElevenLabs
 */
async function handleUnregisterPhoneNumber(req, res) {
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

  // Get current phone number ID
  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .from('restaurant_info')
    .select('elevenlabs_phone_number_id, twilio_phone_number')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
    });
  }

  if (!restaurant.elevenlabs_phone_number_id) {
    return res.status(400).json({
      success: false,
      error: 'No phone number configured for this restaurant'
    });
  }

  try {
    // Delete phone number from ElevenLabs
    const deleteResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/${restaurant.elevenlabs_phone_number_id}`,
      {
        method: 'DELETE',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text();
      logger.error('[Phone Integration] Delete error:', errorText);
      return res.status(500).json({
        success: false,
        error: 'Failed to remove phone number from ElevenLabs',
        details: errorText
      });
    }

    // Clear database fields
    await supabaseAdmin
      .from('restaurant_info')
      .update({
        twilio_account_sid: null,
        twilio_auth_token: null,
        twilio_phone_number: null,
        elevenlabs_phone_number_id: null,
        elevenlabs_phone_number: null,
        phone_integration_status: 'not_configured',
        phone_integration_error: null,
        phone_configured_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurant_id);

    logger.info(`[Phone Integration] Unregistered phone for restaurant ${restaurant_id}`);

    return res.status(200).json({
      success: true,
      message: 'Phone number successfully unregistered'
    });

  } catch (error) {
    logger.error('[Phone Integration] Unregister error:', error);
    throw error;
  }
}

/**
 * Get current phone integration status
 */
async function handleGetStatus(req, res) {
  const restaurant_id = req.query.restaurant_id || req.body?.restaurant_id;

  if (!restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: restaurant_id'
    });
  }

  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .from('restaurant_info')
    .select(`
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
    data: {
      has_agent: !!restaurant.elevenlabs_agent_id,
      agent_id: restaurant.elevenlabs_agent_id,
      phone_number: restaurant.elevenlabs_phone_number || restaurant.twilio_phone_number,
      phone_number_id: restaurant.elevenlabs_phone_number_id,
      status: restaurant.phone_integration_status || 'not_configured',
      error: restaurant.phone_integration_error,
      configured_at: restaurant.phone_configured_at
    }
  });
}

/**
 * Assign or reassign agent to existing phone number
 */
async function handleAssignAgent(req, res) {
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

  const { data: restaurant, error: fetchError } = await supabaseAdmin
    .from('restaurant_info')
    .select('elevenlabs_agent_id, elevenlabs_phone_number_id')
    .eq('id', restaurant_id)
    .single();

  if (fetchError || !restaurant) {
    return res.status(404).json({
      success: false,
      error: 'Restaurant not found'
    });
  }

  if (!restaurant.elevenlabs_phone_number_id) {
    return res.status(400).json({
      success: false,
      error: 'No phone number configured. Register a phone number first.'
    });
  }

  if (!restaurant.elevenlabs_agent_id) {
    return res.status(400).json({
      success: false,
      error: 'No AI agent configured. Complete onboarding first.'
    });
  }

  try {
    const assignResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/${restaurant.elevenlabs_phone_number_id}`,
      {
        method: 'PATCH',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: restaurant.elevenlabs_agent_id
        })
      }
    );

    if (!assignResponse.ok) {
      const errorText = await assignResponse.text();
      return res.status(500).json({
        success: false,
        error: 'Failed to assign agent to phone number',
        details: errorText
      });
    }

    await supabaseAdmin
      .from('restaurant_info')
      .update({
        phone_integration_status: 'active',
        phone_integration_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurant_id);

    return res.status(200).json({
      success: true,
      message: 'Agent successfully assigned to phone number'
    });

  } catch (error) {
    logger.error('[Phone Integration] Assign agent error:', error);
    throw error;
  }
}
