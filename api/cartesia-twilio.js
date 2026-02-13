/**
 * Cartesia + Twilio Integration
 *
 * Handles Twilio voice calls with Cartesia real-time TTS
 * Provides ultra-low latency voice responses for phone reservations
 *
 * Twilio Setup:
 * 1. Configure Twilio webhook URL: https://your-domain.com/api/cartesia-twilio
 * 2. Set to POST method
 * 3. Ensure webhook is accessible via HTTPS
 *
 * Cartesia Configuration:
 * - Output format: PCM µ-law @ 8000 Hz (telephony standard)
 * - Voice: Professional restaurant host voice
 * - Streaming: WebSocket for real-time audio
 */

const { textToSpeech, streamTextToSpeech, OUTPUT_FORMATS } = require('./_lib/cartesia');
const { useCartesia } = require('./_lib/feature-flags');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('CartesiaTwilio');

module.exports = async (req, res) => {
  // Set headers for TwiML
  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  logger.info('[Cartesia-Twilio] Incoming request:', {
    method: req.method,
    body: req.body,
    query: req.query
  });

  // Check if Cartesia is enabled
  if (!useCartesia()) {
    logger.info('[Cartesia-Twilio] Cartesia not enabled, redirecting to ElevenLabs');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/api/elevenlabs-webhook</Redirect>
</Response>`);
  }

  try {
    const action = req.query.action || req.body?.action || 'greet';

    logger.info(`[Cartesia-Twilio] Processing action: ${action}`);

    switch (action) {
      case 'greet':
        return await handleGreeting(req, res);

      case 'gather_input':
        return await handleGatherInput(req, res);

      case 'check_availability':
        return await handleCheckAvailability(req, res);

      case 'confirm_reservation':
        return await handleConfirmReservation(req, res);

      default:
        return await handleGreeting(req, res);
    }
  } catch (error) {
    logger.error('[Cartesia-Twilio] Error:', error);
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, we're experiencing technical difficulties. Please call back later or visit our website.</Say>
  <Hangup/>
</Response>`);
  }
};

/**
 * Handle initial greeting
 */
async function handleGreeting(req, res) {
  const greetingText = "Hello! Thank you for calling our restaurant. I'm your AI assistant. How can I help you today? You can make a reservation, check availability, or modify an existing booking.";

  logger.info('[Cartesia-Twilio] Generating greeting audio');

  try {
    // Generate TTS audio with Cartesia
    const tts = await textToSpeech(greetingText, {
      voice: 'professional_female',
      outputFormat: 'twilio',
      emotion: 'positivity:high'
    });

    // Convert audio buffer to base64 for TwiML
    const audioBase64 = tts.audio.toString('base64');

    // Return TwiML with audio and gather input
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech" action="/api/cartesia-twilio?action=gather_input" method="POST" timeout="5" speechTimeout="auto">
    <Say>I'm listening...</Say>
  </Gather>
  <Say>I didn't hear anything. Please call back when you're ready.</Say>
  <Hangup/>
</Response>`;

    logger.info('[Cartesia-Twilio] Greeting sent');
    return res.status(200).send(twiml);
  } catch (error) {
    logger.error('[Cartesia-Twilio] TTS error:', error);

    // Fallback to Twilio's built-in TTS
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${greetingText}</Say>
  <Gather input="speech" action="/api/cartesia-twilio?action=gather_input" method="POST" timeout="5">
  </Gather>
</Response>`);
  }
}

/**
 * Handle user input gathering
 */
async function handleGatherInput(req, res) {
  const userSpeech = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;

  logger.info('[Cartesia-Twilio] User said:', userSpeech, 'Confidence:', confidence);

  // Parse intent from speech
  const intent = parseIntent(userSpeech);

  logger.info('[Cartesia-Twilio] Detected intent:', intent);

  switch (intent) {
    case 'make_reservation':
      return await handleReservationFlow(req, res, userSpeech);

    case 'check_availability':
      return await handleCheckAvailability(req, res);

    case 'cancel_reservation':
      return await handleCancelFlow(req, res);

    default:
      const responseText = "I'm sorry, I didn't understand that. Could you please say 'make a reservation', 'check availability', or 'cancel a reservation'?";

      const tts = await textToSpeech(responseText, {
        voice: 'professional_female',
        outputFormat: 'twilio'
      });

      const audioBase64 = tts.audio.toString('base64');

      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech" action="/api/cartesia-twilio?action=gather_input" method="POST" timeout="5">
  </Gather>
</Response>`);
  }
}

/**
 * Handle reservation flow
 */
async function handleReservationFlow(req, res, userSpeech) {
  const responseText = "Great! I'd be happy to help you make a reservation. How many people will be dining?";

  const tts = await textToSpeech(responseText, {
    voice: 'professional_female',
    outputFormat: 'twilio',
    emotion: 'positivity:high'
  });

  const audioBase64 = tts.audio.toString('base64');

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech dtmf" action="/api/cartesia-twilio?action=get_party_size" method="POST" timeout="5" numDigits="1">
  </Gather>
</Response>`);
}

/**
 * Handle availability check
 */
async function handleCheckAvailability(req, res) {
  const responseText = "I can check our availability for you. What date would you like to dine with us?";

  const tts = await textToSpeech(responseText, {
    voice: 'professional_female',
    outputFormat: 'twilio'
  });

  const audioBase64 = tts.audio.toString('base64');

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech" action="/api/cartesia-twilio?action=process_date" method="POST" timeout="5">
  </Gather>
</Response>`);
}

/**
 * Handle reservation confirmation
 */
async function handleConfirmReservation(req, res) {
  const responseText = "Perfect! Your reservation has been confirmed. You'll receive a confirmation message shortly. Is there anything else I can help you with?";

  const tts = await textToSpeech(responseText, {
    voice: 'professional_female',
    outputFormat: 'twilio',
    emotion: 'positivity:highest'
  });

  const audioBase64 = tts.audio.toString('base64');

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech" action="/api/cartesia-twilio?action=final_question" method="POST" timeout="3">
  </Gather>
  <Say>Thank you for calling. Have a wonderful day!</Say>
  <Hangup/>
</Response>`);
}

/**
 * Handle cancellation flow
 */
async function handleCancelFlow(req, res) {
  const responseText = "I can help you cancel your reservation. Can you please provide your phone number or reservation ID?";

  const tts = await textToSpeech(responseText, {
    voice: 'professional_female',
    outputFormat: 'twilio'
  });

  const audioBase64 = tts.audio.toString('base64');

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/x-mulaw;base64,${audioBase64}</Play>
  <Gather input="speech dtmf" action="/api/cartesia-twilio?action=lookup_reservation" method="POST" timeout="5">
  </Gather>
</Response>`);
}

/**
 * Parse user intent from speech
 * In production, use NLP service like Anthropic Claude
 */
function parseIntent(speech) {
  const lowerSpeech = speech.toLowerCase();

  if (lowerSpeech.includes('make') && lowerSpeech.includes('reservation')) {
    return 'make_reservation';
  }

  if (lowerSpeech.includes('book') || lowerSpeech.includes('reserve')) {
    return 'make_reservation';
  }

  if (lowerSpeech.includes('check') && lowerSpeech.includes('availability')) {
    return 'check_availability';
  }

  if (lowerSpeech.includes('cancel')) {
    return 'cancel_reservation';
  }

  return 'unknown';
}
