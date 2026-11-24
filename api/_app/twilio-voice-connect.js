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
const { isSharedPlatformPhone } = require('./_lib/platform-phone-policy');
const { issueVoiceStreamGrant } = require('./_lib/voice-stream-auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('TwilioVoiceConnect');

// WebSocket server URL for the voice pipeline
const VOICE_WS_URL = process.env.VOICE_WS_URL;

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  res.setHeader('Content-Type', 'text/xml');

  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).send(buildErrorTwiml('Method not allowed'));
    return;
  }

  // Validate Twilio webhook signature
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.error('TWILIO_AUTH_TOKEN not set — rejecting all voice webhook requests');
    res.status(403).send(buildErrorTwiml('Service unavailable'));
    return;
  }
  const signature = req.headers['x-twilio-signature'];
  const url = `https://${req.headers.host}${req.url}`;
  let sigValid = false;
  try {
    sigValid = typeof signature === 'string' && signature.length <= 128 &&
      twilio.validateRequest(authToken, signature, url, req.body || {});
  } catch { /* Malformed headers fail closed before any restaurant/provider work. */ }
  if (!sigValid) {
    logger.warn('TwilioVoiceConnect: Signature mismatch — rejecting (SEC-CRIT-03)', {
      host: req.headers.host,
      url: req.url,
      hasSig: !!signature,
    });
    res.status(403).send(buildErrorTwiml('Unauthorized'));
    return;
  }

  try {
    // Extract call details from Twilio's webhook
    const calledNumber = req.body?.To;
    const callerNumber = req.body?.From;
    const callSid = req.body?.CallSid;

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

        const grant = await issueVoiceStreamGrant({
          restaurantId: restaurant.id, callerNumber, callSid, accountSid: req.body?.AccountSid, wsUrl,
        });
        res.status(200).send(buildStreamTwiml(
          wsUrl,
          restaurant.id,
          callerNumber,
          callSid,
          grant
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
  if (isSharedPlatformPhone(phoneNumber)) {
    logger.warn('Shared platform line rejected by dedicated routing');
    return null;
  }
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) return null;

  const columns = 'id, restaurant_name, phone, voice_engine, voice_engine_status, voice_ws_endpoint, elevenlabs_agent_id, ai_config';

  // A provisioned AI number owns the inbound call, even if another restaurant
  // lists it as a business phone. Two rows are enough to detect ambiguity.
  // A legacy assignment may have trailing whitespace (including a newline).
  // Look up the E.164 prefix, then compare normalized values in memory. An
  // exact JSON filter would miss that claim and could route via business phone.
  const { data: aiCandidates, error: aiError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select(columns)
    .filter('ai_config->phone->>number', 'like', `${normalizedPhone}%`)
    .filter('ai_config->phone->>status', 'eq', 'active')
    .neq('ai_config->phone->>number_id', '')
    .eq('is_active', true)
    .limit(101);

  if (aiError || !Array.isArray(aiCandidates) || aiCandidates.length > 100) {
    logger.error('AI number lookup error:', { message: aiError?.message || 'Invalid query response' });
    return null;
  }
  const aiMatches = aiCandidates.filter(row =>
    typeof row.ai_config?.phone?.number === 'string' &&
    row.ai_config.phone.number.replace(/[\s\-\(\)]/g, '') === normalizedPhone);
  if (aiMatches.length > 1) {
    logger.error('Ambiguous provisioned AI number', { phone: normalizedPhone });
    return null;
  }
  if (aiMatches.length === 1) return aiMatches[0];

  // Check both stored phone formats together. Neither a duplicate nor a
  // formatting variant may win merely because it was returned first.
  const phoneVariants = [...new Set([normalizedPhone, phoneNumber])];
  const { data: businessMatches, error: businessError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select(columns)
    .in('phone', phoneVariants)
    .eq('is_active', true)
    .eq('onboarding_completed', true)
    .limit(2);

  if (businessError || !Array.isArray(businessMatches)) {
    logger.error('Business phone lookup error:', { message: businessError?.message || 'Invalid query response' });
    return null;
  }
  if (businessMatches.length > 1) {
    logger.error('Ambiguous business phone', { phone: normalizedPhone });
    return null;
  }
  return businessMatches[0] || null;
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
      .select('id, total_calls, new_engine_calls, new_engine, new_engine_percentage, is_active')
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
function buildStreamTwiml(wsUrl, restaurantId, callerNumber, callSid, grant) {
  // Escape XML entities
  const escXml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escXml(wsUrl)}">
      <Parameter name="restaurant_id" value="${escXml(restaurantId)}" />
      <Parameter name="caller_number" value="${escXml(callerNumber)}" />
      <Parameter name="call_sid" value="${escXml(callSid)}" />
      <Parameter name="stream_grant" value="${escXml(grant)}" />
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
