/**
 * Voice Pipeline WebSocket Server
 *
 * Bridges Twilio Media Streams to AI backends (OpenAI Realtime, etc.).
 * Handles the full lifecycle of a voice call:
 *
 * 1. Twilio connects via WebSocket with Media Streams
 * 2. We load restaurant config and connect to the AI backend
 * 3. Audio flows bidirectionally: Twilio <-> converter <-> AI backend
 * 4. Tool calls from AI are executed and results sent back
 * 5. On disconnect, we clean up all resources
 *
 * This server runs as a standalone Node.js process (not on Vercel serverless)
 * because it requires persistent WebSocket connections.
 */

const WebSocket = require('ws');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getRestaurantById } = require('../_lib/restaurant-loader');
const { buildPersonaPrompt, buildFirstMessage } = require('../_lib/persona-prompt-builder');
const { twilioToOpenAI, openAIToTwilio } = require('./audio-converter');
const { createSession, getSession, destroySession, getActiveSessions } = require('./session-manager');
const { executeToolCall } = require('./tool-handler');
const OpenAIRealtimeBackend = require('./backends/openai-realtime');
const { buildGuestContext } = require('../_services/guestMemory');

const logger = createSecureLogger('VoiceWSServer');

const PORT = process.env.VOICE_WS_PORT || 8765;

/**
 * Create and start the WebSocket server
 * @param {Object} options - Server options
 * @param {number} options.port - Port to listen on
 * @param {Object} options.server - Existing HTTP server to attach to (optional)
 * @returns {WebSocket.Server} The WebSocket server instance
 */
function createVoiceServer(options = {}) {
  const wssOptions = options.server
    ? { server: options.server, path: '/ws' }
    : { port: options.port || PORT, path: '/ws' };

  const wss = new WebSocket.Server(wssOptions);

  logger.info(`Voice WebSocket server starting`, {
    port: wssOptions.port || 'attached to HTTP server',
    path: wssOptions.path
  });

  wss.on('connection', (ws, req) => {
    logger.info('New Twilio Media Stream connection', {
      remoteAddress: req.socket.remoteAddress,
      url: req.url
    });

    handleTwilioConnection(ws);
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error:', { message: error.message });
  });

  // Health check endpoint info
  logger.info(`Voice server ready. Active sessions: ${getActiveSessions().length}`);

  return wss;
}

/**
 * Handle a single Twilio Media Streams WebSocket connection
 * @param {WebSocket} ws - The WebSocket connection from Twilio
 */
function handleTwilioConnection(ws) {
  let streamSid = null;
  let session = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.event) {
        case 'connected':
          logger.info('Twilio Media Stream connected', {
            protocol: message.protocol,
            version: message.version
          });
          break;

        case 'start':
          await handleStreamStart(ws, message);
          streamSid = message.start?.streamSid;
          session = getSession(streamSid);
          break;

        case 'media':
          await handleMediaChunk(ws, message);
          break;

        case 'mark':
          handleMark(message);
          break;

        case 'stop':
          logger.info('Twilio Media Stream stopped', {
            streamSid: message.stop?.streamSid
          });
          break;

        default:
          logger.debug('Unknown Twilio event:', message.event);
      }
    } catch (error) {
      logger.error('Error processing Twilio message:', {
        message: error.message
      });
    }
  });

  ws.on('close', (code, reason) => {
    logger.info('Twilio WebSocket closed', {
      code,
      reason: reason?.toString(),
      streamSid
    });
    cleanupSession(streamSid);
  });

  ws.on('error', (error) => {
    logger.error('Twilio WebSocket error:', {
      message: error.message,
      streamSid
    });
    cleanupSession(streamSid);
  });
}

/**
 * Handle the 'start' event from Twilio Media Streams
 * This is where we load the restaurant config and connect to the AI backend
 */
async function handleStreamStart(ws, message) {
  const { streamSid, callSid, customParameters, tracks } = message.start || {};

  logger.info('Media stream starting', {
    streamSid,
    callSid,
    tracks,
    customParameters
  });

  // Extract custom parameters passed via TwiML <Parameter> elements
  const restaurantId = customParameters?.restaurant_id;
  const callerNumber = customParameters?.caller_number;

  if (!restaurantId) {
    logger.error('No restaurant_id in stream parameters');
    sendTwilioMessage(ws, streamSid, {
      event: 'media',
      streamSid,
      media: { payload: '' }
    });
    return;
  }

  // Create session
  const session = createSession({
    streamSid,
    callSid,
    restaurantId,
    callerNumber
  });

  try {
    // Load restaurant configuration from database
    const restaurantConfig = await getRestaurantById(restaurantId);
    session.restaurantConfig = restaurantConfig;

    logger.info(`Restaurant loaded: ${restaurantConfig.restaurant_name}`, {
      voiceEngine: restaurantConfig.voice_engine,
      language: restaurantConfig.language
    });

    // Create and connect AI backend based on voice_engine setting
    const backend = createBackend(restaurantConfig.voice_engine);
    session.aiBackend = backend;

    // Set up AI backend event handlers
    setupBackendHandlers(ws, session, backend);

    // Build persona prompt and connect
    let systemPrompt = buildPersonaPrompt(restaurantConfig, {
      language: restaurantConfig.language,
      promptOverride: restaurantConfig.persona_prompt_override
    });

    // Inject guest memory context if caller is known
    if (callerNumber && restaurantId) {
      try {
        const guestContext = await buildGuestContext(
          restaurantId,
          callerNumber,
          'incoming_call'
        );
        if (guestContext) {
          systemPrompt += guestContext;
          logger.info('Guest context injected into voice prompt', {
            callerNumber: callerNumber.slice(0, 4) + '***',
            contextLength: guestContext.length
          });
        }
      } catch (ctxErr) {
        logger.warn('Guest context injection failed (non-fatal):', ctxErr.message);
      }
    }

    const firstMessage = buildFirstMessage(
      restaurantConfig,
      restaurantConfig.language
    );

    await backend.connect({
      systemPrompt,
      firstMessage,
      voice: restaurantConfig.openai_voice_id || 'alloy',
      language: restaurantConfig.language || 'en',
      restaurantConfig
    });

    logger.info('AI backend connected', {
      backend: restaurantConfig.voice_engine,
      streamSid
    });

  } catch (error) {
    logger.error('Failed to initialize voice session:', {
      message: error.message,
      restaurantId,
      streamSid
    });
    cleanupSession(streamSid);
  }
}

/**
 * Create an AI backend instance based on the engine type
 * @param {string} engineType - 'openai_realtime', 'personaplex', etc.
 * @returns {BaseBackend} AI backend instance
 */
function createBackend(engineType) {
  switch (engineType) {
    case 'openai_realtime':
      return new OpenAIRealtimeBackend();

    case 'personaplex':
      // Future: return new PersonaPlexBackend();
      throw new Error('PersonaPlex backend not yet available');

    default:
      // Default to OpenAI Realtime for new pipeline calls
      return new OpenAIRealtimeBackend();
  }
}

/**
 * Set up event handlers for the AI backend
 * Routes AI events back to Twilio and handles tool calls
 */
function setupBackendHandlers(ws, session, backend) {
  const { streamSid, restaurantId, restaurantConfig, callerNumber, conversationId } = session;

  // AI sends audio -> convert and forward to Twilio
  backend.onAudioResponse((audioBase64) => {
    if (session.isInterrupted) return;

    try {
      // Convert from OpenAI PCM 24kHz to Twilio mulaw 8kHz
      const twilioAudio = openAIToTwilio(audioBase64);

      sendTwilioMessage(ws, streamSid, {
        event: 'media',
        streamSid,
        media: { payload: twilioAudio }
      });
    } catch (error) {
      logger.error('Audio conversion error (AI->Twilio):', {
        message: error.message
      });
    }
  });

  // AI requests a tool call -> execute and send result back
  backend.onToolCall(async (toolCall) => {
    logger.info(`Tool call from AI: ${toolCall.name}`, {
      callId: toolCall.callId,
      streamSid
    });

    try {
      const result = await executeToolCall(
        toolCall.name,
        toolCall.arguments,
        {
          restaurantId,
          restaurantConfig,
          callerNumber,
          conversationId
        }
      );

      // Send result back to AI
      await backend.sendToolResult(toolCall.callId, result);

      logger.info(`Tool result sent to AI: ${toolCall.name}`, {
        success: result.success
      });
    } catch (error) {
      logger.error(`Tool execution error: ${toolCall.name}`, {
        message: error.message
      });

      // Send error result back to AI so it can respond appropriately
      await backend.sendToolResult(toolCall.callId, {
        success: false,
        error: 'tool_error',
        message: 'An error occurred. Please try again.'
      });
    }
  });

  // AI speech transcript (for logging)
  backend.onTranscript((transcript) => {
    if (transcript.type === 'user_speech_started') {
      // User started speaking - interrupt AI
      session.isInterrupted = true;

      // Clear Twilio's audio buffer to stop current AI speech
      sendTwilioMessage(ws, streamSid, {
        event: 'clear',
        streamSid
      });

      // Tell AI to stop generating
      backend.interrupt().catch((err) => {
        logger.error('Interrupt error:', { message: err.message });
      });
    } else if (transcript.type === 'user_speech_stopped') {
      // User stopped speaking - reset interrupt flag
      session.isInterrupted = false;
    }

    session.touch();
  });

  // AI backend error
  backend.onError((error) => {
    logger.error('AI backend error:', {
      error,
      streamSid
    });
  });

  // AI backend disconnected
  backend.onDisconnect((reason) => {
    logger.info('AI backend disconnected', {
      reason,
      streamSid
    });
  });
}

/**
 * Handle incoming audio from Twilio
 * Convert and forward to the AI backend
 */
async function handleMediaChunk(ws, message) {
  const streamSid = message.streamSid;
  const session = getSession(streamSid);

  if (!session || !session.aiBackend || !session.aiBackend.connected) {
    return; // Session not ready yet
  }

  try {
    const twilioPayload = message.media?.payload;
    if (!twilioPayload) return;

    // Convert from Twilio mulaw 8kHz to OpenAI PCM 24kHz
    const openaiAudio = twilioToOpenAI(twilioPayload);

    // Forward to AI backend
    await session.aiBackend.sendAudio(openaiAudio);
    session.touch();
  } catch (error) {
    logger.error('Audio conversion error (Twilio->AI):', {
      message: error.message,
      streamSid
    });
  }
}

/**
 * Handle Twilio 'mark' events for audio playback tracking
 */
function handleMark(message) {
  const markName = message.mark?.name;
  logger.debug('Twilio mark received:', { mark: markName });
}

/**
 * Send a message to Twilio via WebSocket
 */
function sendTwilioMessage(ws, streamSid, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Clean up a session and all its resources
 */
function cleanupSession(streamSid) {
  if (!streamSid) return;

  const session = destroySession(streamSid);
  if (session) {
    logger.info('Session cleaned up', {
      streamSid,
      duration: session.getDurationSeconds ? session.getDurationSeconds() + 's' : 'unknown'
    });
  }
}

/**
 * Get server health status
 */
function getHealthStatus(wss) {
  return {
    status: 'ok',
    activeSessions: getActiveSessions().length,
    connectedClients: wss ? wss.clients.size : 0,
    uptime: process.uptime()
  };
}

module.exports = {
  createVoiceServer,
  getHealthStatus
};
