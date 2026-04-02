/**
 * Twilio Voice Connect - Call Routing Endpoint
 *
 * This is the Twilio webhook endpoint that handles incoming voice calls.
 * It routes calls based on the restaurant's voice_engine setting:
 *
 * - 'elevenlabs' -> Redirects to ElevenLabs managed pipeline (existing flow)
 * - 'openai_realtime' -> Returns TwiML with <Connect><Stream> to our WebSocket server
 *
 * This endpoint runs on Vercel serverless (no WebSocket needed here).
 * The actual WebSocket server runs separately (ws-server.js on Railway/Fly.io).
 */

const twilio = require('twilio');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('TwilioVoiceConnect');

// WebSocket server URL for the voice pipeline
const VOICE_WS_URL = process.env.VOICE_WS_URL || 'wss://seatable-voice.fly.dev/ws';

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  res.setHeader('Content-Type', 'text/xml');

  if (handlePreflight(req, res)) return;

  // Validate Twilio webhook signature
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.error('TWILIO_AUTH_TOKEN not set — rejecting all voice webhook requests');
    res.status(403).send(buildErrorTwiml('Service unavailable'));
    return;
  }
  const signature = req.headers['x-twilio-signature'];
  const url = `https://${req.headers.host}${req.url}`;
  if (!signature || !twilio.validateRequest(authToken, signature, url, req.body || {})) {
    logger.error('TwilioVoiceConnect: Invalid webhook signature');
    res.status(403).send(buildErrorTwiml('Forbidden'));
    return;
  }

  try {
    // Extract call details from Twilio's webhook
    const calledNumber = req.body?.To || req.query?.To;
    const callerNumber = req.body?.From || req.query?.From;
    const callSid = req.body?.CallSid || req.query?.CallSid;

    logger.info('Incoming voice call', {
      to: calledNumber,
      from: callerNumber ? callerNumber.slice(0, 6) + '***' : 'unknown',
      callSid
    });

    if (!calledNumber) {
      logger.error('No To number in request');
      res.status(200).send(buildErrorTwiml(
        'We apologize, but we are unable to process your call at this time. Please try again later.'
      ));
      return;
    }

    // Look up restaurant by the called phone number
    const restaurant = await lookupRestaurantByPhone(calledNumber);

    if (!restaurant) {
      logger.warn('No restaurant found for number:', { phone: calledNumber });
      res.status(200).send(buildErrorTwiml(
        'We apologize, but this number is not currently configured. Please try calling the restaurant directly.'
      ));
      return;
    }

    logger.info(`Restaurant found: ${restaurant.restaurant_name}`, {
      voiceEngine: restaurant.voice_engine,
      restaurantId: restaurant.id
    });

    // Check for A/B test override
    const effectiveEngine = await resolveVoiceEngine(restaurant);

    // Route based on voice engine
    switch (effectiveEngine) {
      case 'openai_realtime': {
        const wsUrl = restaurant.voice_ws_endpoint || VOICE_WS_URL;

        logger.info('Routing to OpenAI Realtime pipeline', {
          wsUrl,
          restaurantId: restaurant.id
        });

        res.status(200).send(buildStreamTwiml(
          wsUrl,
          restaurant.id,
          callerNumber,
          callSid
        ));
        break;
      }

      case 'elevenlabs':
      default: {
        // Existing ElevenLabs flow - redirect to their managed endpoint
        logger.info('Routing to ElevenLabs pipeline', {
          agentId: restaurant.elevenlabs_agent_id
        });

        const twiml = await buildElevenLabsTwiml(restaurant, callerNumber, calledNumber);
        res.status(200).send(twiml);
        break;
      }
    }
  } catch (error) {
    logger.error('Voice connect error:', { message: error.message });
    res.status(200).send(buildErrorTwiml(
      'We apologize, but we are experiencing technical difficulties. Please try again later.'
    ));
  }
};

/**
 * Look up restaurant config by phone number
 * Returns the raw DB record with voice_engine columns
 */
async function lookupRestaurantByPhone(phoneNumber) {
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

  // Try exact match first
  let { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, phone, voice_engine, voice_engine_status, voice_ws_endpoint, elevenlabs_agent_id, ai_config')
    .eq('phone', normalizedPhone)
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .limit(1)
    .maybeSingle();

  // If not found and original differs, try original format
  if (!data && !error && normalizedPhone !== phoneNumber) {
    ({ data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, phone, voice_engine, voice_engine_status, voice_ws_endpoint, elevenlabs_agent_id, ai_config')
      .eq('phone', phoneNumber)
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .limit(1)
      .maybeSingle());
  }

  // If still not found, try matching against ai_config.phone.number (Twilio AI number)
  if (!data && !error) {
    ({ data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, phone, voice_engine, voice_engine_status, voice_ws_endpoint, elevenlabs_agent_id, ai_config')
      .filter('ai_config->phone->>number', 'eq', normalizedPhone)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle());
  }

  if (error) {
    logger.error('Restaurant lookup error:', { message: error.message });
    return null;
  }

  return data;
}

/**
 * Resolve the effective voice engine, checking for A/B tests
 * @param {Object} restaurant - Restaurant config from DB
 * @returns {string} Effective voice engine to use for this call
 */
async function resolveVoiceEngine(restaurant) {
  // Default to the restaurant's configured engine
  const baseEngine = restaurant.voice_engine || 'elevenlabs';

  // Check if voice engine is active
  if (restaurant.voice_engine_status !== 'active' && restaurant.voice_engine_status !== 'testing') {
    return 'elevenlabs'; // Fallback to ElevenLabs if engine not ready
  }

  // Check for active A/B test
  try {
    const { data: abTest, error } = await supabaseAdmin
      .schema('restaurant')
      .from('voice_ab_tests')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !abTest) return baseEngine;

    // Increment total calls counter
    await supabaseAdmin
      .schema('restaurant')
      .from('voice_ab_tests')
      .update({
        total_calls: abTest.total_calls + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', abTest.id);

    // Randomly assign to new engine based on percentage
    const random = Math.random() * 100;
    if (random < abTest.new_engine_percentage) {
      // Route to new engine
      await supabaseAdmin
        .schema('restaurant')
        .from('voice_ab_tests')
        .update({
          new_engine_calls: abTest.new_engine_calls + 1
        })
        .eq('id', abTest.id);

      logger.info('A/B test: routing to new engine', {
        newEngine: abTest.new_engine,
        percentage: abTest.new_engine_percentage
      });

      return abTest.new_engine;
    }

    // Route to current engine
    return baseEngine;
  } catch (error) {
    logger.warn('A/B test check failed, using base engine:', { message: error.message });
    return baseEngine;
  }
}

/**
 * Build TwiML that connects to our voice pipeline via Media Streams
 */
function buildStreamTwiml(wsUrl, restaurantId, callerNumber, callSid) {
  // Escape XML entities
  const escXml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escXml(wsUrl)}">
      <Parameter name="restaurant_id" value="${escXml(restaurantId)}" />
      <Parameter name="caller_number" value="${escXml(callerNumber)}" />
      <Parameter name="call_sid" value="${escXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`;
}

/**
 * Register call with ElevenLabs and return TwiML for Twilio stream.
 * Uses the /convai/twilio/register-call API which returns proper
 * TwiML with a signed conversation-specific WebSocket URL.
 */
async function buildElevenLabsTwiml(restaurant, callerNumber, calledNumber) {
  const agentId = restaurant.elevenlabs_agent_id;

  if (!agentId) {
    logger.warn('No ElevenLabs agent_id configured', {
      restaurantId: restaurant.id
    });
    return buildErrorTwiml(
      'The voice assistant for this restaurant is not yet configured. Please call back later.'
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.error('ELEVENLABS_API_KEY not configured');
    return buildErrorTwiml('Voice service not configured.');
  }

  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        from_number: callerNumber || 'unknown',
        to_number: calledNumber || 'unknown',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      logger.error('ElevenLabs register-call failed', { status: resp.status, body: errText.slice(0, 200) });
      return buildErrorTwiml('Voice assistant is temporarily unavailable.');
    }

    // ElevenLabs returns TwiML directly
    const twiml = await resp.text();
    logger.info('ElevenLabs call registered', { agentId, restaurantId: restaurant.id });
    return twiml;
  } catch (err) {
    logger.error('ElevenLabs register-call error', { error: err.message });
    return buildErrorTwiml('Voice assistant is temporarily unavailable.');
  }
}

/**
 * Build TwiML error response with spoken message
 */
function buildErrorTwiml(message) {
  const escXml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${escXml(message)}</Say>
  <Hangup />
</Response>`;
}
