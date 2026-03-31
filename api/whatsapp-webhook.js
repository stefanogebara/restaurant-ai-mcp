// Meta Cloud API WhatsApp webhook
// Webhook URL: https://seatable.one/api/whatsapp-webhook
// Verify token: process.env.WHATSAPP_VERIFY_TOKEN

/**
 * Meta WhatsApp Cloud API Webhook
 *
 * Custom WhatsApp AI agent for restaurant reservations.
 * Receives messages from Meta's WhatsApp Business Platform and responds using AI.
 *
 * Webhook URL: https://seatable.one/api/whatsapp-webhook
 *
 * Required environment variables:
 * - WHATSAPP_VERIFY_TOKEN: Token for webhook verification
 * - WHATSAPP_ACCESS_TOKEN: Meta Graph API access token
 * - WHATSAPP_PHONE_NUMBER_ID: Phone number ID from Meta Business
 * - OPENROUTER_API_KEY or MOONSHOT_API_KEY: AI provider API key
 */

const crypto = require('crypto');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { isMessageDuplicate, rejectOversizedBody } = require('./_lib/rate-limit');
const {
  getOrCreateSession,
  setSessionRestaurant,
  updateSessionConversationHistory
} = require('./_lib/whatsapp-sessions');
const { getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { extractMemoriesFromWhatsApp } = require('./services/memoryExtractor');
const { findPendingFeedbackForPhone, processFeedbackReply } = require('./services/feedbackService');
const { handleSurveyReply } = require('./services/surveyReplyHandler');
const { setWebhookCors } = require('./_lib/cors');
const { updateDeliveryStatus } = require('./services/campaignService');

// Extracted modules
const { sendWhatsAppMessage, sendInteractiveListMessage } = require('./services/whatsapp/message-sender');
const { isRateLimited } = require('./services/whatsapp/rate-limiter');
const { processWithAI, cleanHistoryForStorage } = require('./services/whatsapp/conversation');
const { handleKeyword } = require('./services/whatsapp/keyword-handler');

/**
 * Handle webhook verification (GET)
 */
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  logger.info(' Verification request:', {
    mode,
    receivedToken: token?.substring(0, 10) + '...',
    expectedTokenSet: !!expectedToken,
    expectedTokenLength: expectedToken?.length,
    tokensMatch: token === expectedToken
  });

  if (mode === 'subscribe' && token === expectedToken) {
    logger.info(' Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.error(' Verification failed - mode:', mode, 'tokenMatch:', token === expectedToken);
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * Handle incoming POST webhook (messages + status updates)
 */
async function handlePost(req, res) {
  // Verify Meta webhook signature (X-Hub-Signature-256)
  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.error('META_APP_SECRET not configured -- rejecting unsigned webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.error('Missing X-Hub-Signature-256 header');
    return res.status(403).json({ error: 'Missing signature' });
  }
  // Use raw body for HMAC: prefer stream-captured body, then req.rawBody — reject if neither available
  const rawBody = req._rawBody || req.rawBody;
  if (!rawBody && typeof req.body !== 'string') {
    logger.error('No raw body available for HMAC verification');
    return res.status(400).json({ error: 'Cannot verify request integrity' });
  }
  const bodyForHmac = rawBody || req.body;
  const rawBodySource = req._rawBody ? 'stream' : req.rawBody ? 'req.rawBody' : 'string-body';
  const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(bodyForHmac).digest('hex');
  logger.info('[WA-SIG]', {
    source: rawBodySource,
    bodyDefined: req.body !== undefined,
    rawBodyAvail: !!req.rawBody,
    _rawBodyAvail: !!req._rawBody,
    rawBodyLen: bodyForHmac ? bodyForHmac.length ?? bodyForHmac.byteLength : 0,
    sigMatch: signature === expectedSig,
  });
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    logger.error('Invalid Meta webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const body = req.body;

    // Log incoming webhook (abbreviated to avoid log bloat)
    logger.info(' Webhook POST received, AI config:', {
      model: 'anthropic',
      provider: 'anthropic',
      apiKeySet: !!process.env.ANTHROPIC_API_KEY,
    });

    // Extract message data
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Debug: log what type of webhook event this is
    logger.info(' Webhook event type:', {
      hasEntry: !!entry,
      hasChanges: !!changes,
      field: changes?.field,
      hasMessages: !!value?.messages,
      hasStatuses: !!value?.statuses,
      messageCount: value?.messages?.length || 0,
    });

    // ── TwinMe phone number forwarding ──
    // The WABA has multiple phone numbers. Messages to the TwinMe number
    // (882860144919419 / +1 762-994-3997) are forwarded to TwinMe's webhook.
    // Seatable only processes messages to its own number (1035729146286096).
    const incomingPhoneNumberId = value?.metadata?.phone_number_id;
    const TWINME_PHONE_NUMBER_ID = '882860144919419';
    if (incomingPhoneNumberId === TWINME_PHONE_NUMBER_ID && value?.messages) {
      logger.info('TwinMe phone number detected — forwarding to TwinMe webhook', {
        phoneNumberId: incomingPhoneNumberId,
        messageCount: value.messages.length,
      });
      try {
        const axios = require('axios');
        await axios.post('https://twin-ai-learn.vercel.app/api/whatsapp-twin/webhook', body, {
          headers: {
            'Content-Type': 'application/json',
            'x-hub-signature-256': signature,
          },
          timeout: 10000,
        });
      } catch (fwdErr) {
        logger.error('TwinMe forward failed', { error: fwdErr.message });
      }
      return res.status(200).json({ status: 'ok', handler: 'twinme_forward' });
    }

    // Check if this is a message event
    // When ElevenLabs WhatsApp is enabled, they handle inbound messages.
    // Our webhook only processes status updates (delivery receipts, campaign tracking).
    if (value?.messages) {
      const elevenLabsWhatsApp = process.env.ELEVENLABS_WHATSAPP_ENABLED === 'true';
      if (elevenLabsWhatsApp) {
        logger.info('ElevenLabs WhatsApp active — skipping message handling (ElevenLabs handles it)');
        return res.status(200).json({ status: 'ok', handler: 'elevenlabs' });
      }
      return await handleIncomingMessage(value.messages[0], res);
    }

    // Process status updates (delivery receipts)
    if (value?.statuses) {
      for (const statusUpdate of value.statuses) {
        logger.info(' Message status update:', {
          id: statusUpdate.id,
          recipientId: statusUpdate.recipient_id,
          status: statusUpdate.status,
          timestamp: statusUpdate.timestamp,
          errors: statusUpdate.errors || null,
        });

        // Route delivery status to campaign tracking (fire-and-forget)
        if (statusUpdate.id && ['delivered', 'read', 'failed'].includes(statusUpdate.status)) {
          updateDeliveryStatus(statusUpdate.id, statusUpdate.status).catch(err => {
            logger.error('Campaign delivery status update failed:', err.message);
          });
        }
      }
    }

    // Acknowledge other webhook events (status updates, etc.)
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    logger.error(' Webhook error:', error);
    return res.status(200).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
}

/**
 * Handle a single incoming WhatsApp message
 */
async function handleIncomingMessage(message, res) {
  const from = message.from; // Sender's WhatsApp number
  const messageType = message.type;

  // Extract text from text messages OR interactive replies (list selections)
  let messageText = '';
  let interactiveSelection = null;

  if (messageType === 'text') {
    messageText = message.text?.body || '';
  } else if (messageType === 'interactive') {
    const interactiveType = message.interactive?.type;
    if (interactiveType === 'list_reply') {
      interactiveSelection = message.interactive.list_reply;
      messageText = interactiveSelection.title || '';
    } else if (interactiveType === 'button_reply') {
      interactiveSelection = message.interactive.button_reply;
      messageText = interactiveSelection.title || '';
    }
  }

  logger.info(` Message from ${from}: ${messageText} (type=${messageType})`);

  // Only handle text and interactive messages
  if (messageType !== 'text' && messageType !== 'interactive') {
    await sendWhatsAppMessage(from, 'I can only process text messages at the moment. Please type your request.');
    return res.status(200).json({ status: 'ok' });
  }

  // Handle template response keywords (EN, PT, ES)
  const normalizedText = messageText.trim().toUpperCase();
  const keywordHandled = await handleKeyword(normalizedText, from);
  if (keywordHandled) {
    return res.status(200).json({ status: 'ok' });
  }

  // Deduplicate: Meta retries failed webhooks for up to 24h with exponential backoff.
  // Use 24h TTL to catch retries that come in hours after the original.
  const messageId = message.id;
  if (messageId && await isMessageDuplicate(messageId, 86400)) {
    logger.info(` Duplicate message ${messageId}, skipping`);
    return res.status(200).json({ status: 'ok' });
  }

  // Rate limit: max 10 messages per minute per phone
  if (isRateLimited(from)) {
    logger.info(` Rate limited ${from}`);
    return res.status(200).json({ status: 'ok' });
  }

  // Check if this is a feedback reply (before normal conversation routing)
  try {
    const pendingFeedback = await findPendingFeedbackForPhone(from);
    if (pendingFeedback) {
      const result = await processFeedbackReply(pendingFeedback.restaurantId, from, messageText);
      if (result) {
        const thankYou = result.rating
          ? `Thank you for your feedback! You rated us ${result.rating}/5.${result.comment ? ' We appreciate your comments.' : ''} We look forward to welcoming you again!`
          : 'Thank you for your feedback! We appreciate you taking the time to share your thoughts.';
        await sendWhatsAppMessage(from, thankYou);
        return res.status(200).json({ status: 'ok' });
      }
    }
  } catch (feedbackErr) {
    logger.error('Feedback reply check failed:', feedbackErr.message);
    // Fall through to normal conversation flow
  }

  // Check if this is a survey reply (1-5 rating)
  try {
    const surveyResult = await handleSurveyReply(from, messageText);
    if (surveyResult) {
      const stars = '⭐'.repeat(surveyResult.rating);
      const thankYou = surveyResult.comment
        ? `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nSeu comentario foi registrado. Esperamos ve-lo novamente!`
        : `Obrigado pela avaliacao! ${stars} (${surveyResult.rating}/5)\nEsperamos ve-lo novamente!`;
      await sendWhatsAppMessage(from, thankYou);
      return res.status(200).json({ status: 'ok' });
    }
  } catch (surveyErr) {
    logger.error('Survey reply check failed:', surveyErr.message);
  }

  // Get or create session for this phone number
  logger.info(' [STEP 1] Getting/creating session...');
  const sessionStart = Date.now();
  let session;
  try {
    session = await Promise.race([
      getOrCreateSession(from, `wa-${Date.now()}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session timeout after 8s')), 8000))
    ]);
  } catch (sessionErr) {
    logger.error(` [STEP 1] Session failed in ${Date.now() - sessionStart}ms:`, sessionErr.message);
    session = null;
  }
  logger.info(` [STEP 1] Session done in ${Date.now() - sessionStart}ms, session=${!!session}`);

  if (!session) {
    logger.error(' Failed to create session');
    await sendWhatsAppMessage(from, 'Desculpe, tive um problema ao iniciar nossa conversa. Por favor, tente novamente.');
    return res.status(200).json({ status: 'ok' });
  }

  // Auto-assign restaurant if only one exists, or handle interactive selection
  if (!session.restaurant) {
    try {
      logger.info(' [STEP 2] Getting active restaurants...');
      const restStart = Date.now();
      const activeRestaurants = await Promise.race([
        getAllActiveRestaurants(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Restaurant lookup timeout after 8s')), 8000))
      ]);
      logger.info(` [STEP 2] Restaurants done in ${Date.now() - restStart}ms, count=${activeRestaurants.length}`);

      if (activeRestaurants.length === 1) {
        // Single restaurant — auto-assign
        logger.info(` Auto-assigning single restaurant: ${activeRestaurants[0].restaurant_name}`);
        const updated = await setSessionRestaurant(session.id, activeRestaurants[0].id);
        if (updated) {
          session = updated;
        }
      } else if (activeRestaurants.length > 1) {
        // Check if this is an interactive list reply selecting a restaurant
        if (interactiveSelection?.id?.startsWith('restaurant_')) {
          const selectedId = interactiveSelection.id.replace('restaurant_', '');
          const selectedRestaurant = activeRestaurants.find(r => r.id === selectedId);
          if (selectedRestaurant) {
            logger.info(` User selected restaurant: ${selectedRestaurant.restaurant_name}`);
            const updated = await setSessionRestaurant(session.id, selectedRestaurant.id);
            if (updated) {
              session = updated;
            }
            // Load restaurant config for personalized greeting
            let greetingMsg = `Oi! Sou o assistente do ${selectedRestaurant.restaurant_name}. Como posso te ajudar? \u{1F60A}`;
            try {
              const { supabaseAdmin: adminClient } = require('./_lib/supabase');
              const { data: rConfig } = await adminClient
                .schema('restaurant')
                .from('restaurant_config')
                .select('agent_name, agent_greeting, restaurant_type, city')
                .eq('id', selectedRestaurant.id)
                .maybeSingle();
              if (rConfig?.agent_greeting) {
                greetingMsg = rConfig.agent_greeting;
              }
            } catch (greetErr) {
              logger.warn('Failed to load restaurant config for greeting (non-fatal):', greetErr.message);
            }
            await sendWhatsAppMessage(from, greetingMsg);
            return res.status(200).json({ status: 'ok' });
          }
        }

        // No restaurant selected yet — send interactive list
        // Group restaurants into sections of max 10 rows each (WhatsApp limit)
        const sections = [];
        const chunkSize = 10;
        for (let i = 0; i < activeRestaurants.length; i += chunkSize) {
          const chunk = activeRestaurants.slice(i, i + chunkSize);
          sections.push({
            title: sections.length === 0 ? 'Restaurantes' : `Mais (${sections.length + 1})`,
            rows: chunk.map(r => ({
              id: `restaurant_${r.id}`,
              title: r.restaurant_name,
              description: r.restaurant_type && r.city
                ? `${r.restaurant_type} \u{00B7} ${r.city}`
                : (r.restaurant_type || r.city || '')
            }))
          });
        }

        await sendInteractiveListMessage(
          from,
          `Ol\u{00E1}! \u{1F44B} Com qual restaurante voc\u{00EA} gostaria de falar?`,
          'Ver restaurantes',
          sections
        );
        return res.status(200).json({ status: 'ok' });
      }
    } catch (autoErr) {
      logger.error(' Auto-assign error (non-fatal):', autoErr.message, autoErr.stack);
    }
  }

  // Load conversation history from session
  const conversationHistory = Array.isArray(session.conversation_history) ? session.conversation_history : [];
  logger.info(` Loaded ${conversationHistory.length} history messages for session: ${session.id}`);

  // Process message with AI
  logger.info(' [STEP 3] Processing message with AI...');
  const aiStart = Date.now();
  let response;
  try {
    response = await processWithAI(messageText, session, conversationHistory);
    logger.info(` [STEP 3] AI done in ${Date.now() - aiStart}ms: ${response?.substring(0, 100)}...`);
  } catch (aiError) {
    logger.error(` [STEP 3] AI error after ${Date.now() - aiStart}ms:`, aiError);
    response = 'Desculpe, tive dificuldade em processar sua mensagem. Por favor, tente novamente.';
  }

  // Save updated conversation history — clean out tool messages for storage
  const updatedHistory = cleanHistoryForStorage([
    ...conversationHistory,
    { role: 'user', content: messageText },
    { role: 'assistant', content: response }
  ]);
  // Cap at 20 messages to keep session payload manageable
  const cappedHistory = updatedHistory.slice(-20);
  try {
    await updateSessionConversationHistory(session.id, cappedHistory);
  } catch (historyErr) {
    logger.error(' Failed to save conversation history (non-fatal):', historyErr.message);
  }

  // Fire-and-forget memory extraction from WhatsApp conversation
  if (session?.restaurant?.id && updatedHistory.length >= 4) {
    extractMemoriesFromWhatsApp(
      session.restaurant.id,
      from,
      updatedHistory,
      session.id
    ).catch(err => {
      logger.warn('WhatsApp memory extraction failed (non-fatal):', err.message);
    });
  }

  // Send response back via WhatsApp
  logger.info(` Sending response to ${from}`);
  const sendResult = await sendWhatsAppMessage(from, response);
  logger.info(` Send result:`, JSON.stringify(sendResult));

  return res.status(200).json({ status: 'ok' });
}

/**
 * Main webhook handler
 */
module.exports = async (req, res) => {
  // CORS headers
  setWebhookCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Capture raw body for HMAC signature verification.
  // module.exports.config bodyParser:false is a Next.js-only feature -- it has NO effect on
  // standalone Vercel functions. Vercel's Node.js 20 runtime auto-parses JSON bodies and
  // does NOT expose req.rawBody for standalone functions.
  // Fix: always attempt to read from the stream. In Vercel's runtime the stream remains
  // readable even after req.body is populated (the runtime buffers internally then replays).
  if (req.method === 'POST') {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const streamBuf = Buffer.concat(chunks);
    if (streamBuf.length > 0) {
      req._rawBody = streamBuf.toString('utf8');
      // Only parse body if Vercel hasn't already done so
      if (!req.body) {
        try { req.body = JSON.parse(req._rawBody); } catch { req.body = {}; }
      }
    }
  }

  // Reject oversized payloads (> 1 MB)
  if (rejectOversizedBody(req, res)) return;

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }

  // Message handling (POST request from Meta)
  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Disable Vercel's automatic body parsing so we can access the raw body
// for HMAC signature verification (Meta signs the raw bytes, not re-serialized JSON)
module.exports.config = { api: { bodyParser: false } };
