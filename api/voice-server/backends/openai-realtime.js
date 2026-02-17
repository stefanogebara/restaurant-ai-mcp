/**
 * OpenAI Realtime API Backend
 *
 * Connects to OpenAI's Realtime API via WebSocket for voice-to-voice AI.
 * Handles bidirectional audio streaming, tool calls, and session management.
 *
 * Protocol: JSON messages over WebSocket
 * Audio format: PCM 16-bit signed LE, 24kHz mono, base64 encoded
 */

const WebSocket = require('ws');
const BaseBackend = require('./base-backend');

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
const CONNECTION_TIMEOUT_MS = 10000;

class OpenAIRealtimeBackend extends BaseBackend {
  constructor() {
    super('OpenAIRealtime');
    this.ws = null;
    this.sessionId = null;
  }

  async connect(config) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    this.logger.info('Connecting to OpenAI Realtime API');

    this.ws = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    // Wait for connection with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`OpenAI Realtime connection timed out after ${CONNECTION_TIMEOUT_MS}ms`));
      }, CONNECTION_TIMEOUT_MS);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Set up message handler
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(message);
      } catch (err) {
        this.logger.error('Failed to parse WebSocket message', err);
      }
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'unknown';
      this.logger.info('WebSocket closed', { code, reason: reasonStr });
      this.connected = false;
      this._emitDisconnect({ code, reason: reasonStr });
    });

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error', error);
      this._emitError({ type: 'websocket_error', message: error.message });
    });

    // Configure the session
    this._sendSessionUpdate(config);
    this.connected = true;
    this.logger.info('Connected to OpenAI Realtime API');
  }

  _sendSessionUpdate(config) {
    const tools = this._buildToolDefinitions();

    this._send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: config.systemPrompt,
        voice: config.voice || 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools,
        tool_choice: 'auto'
      }
    });
  }

  _buildToolDefinitions() {
    return [
      {
        type: 'function',
        name: 'get_current_datetime',
        description: 'Get the current date and time. Use at start of conversation.',
        parameters: { type: 'object', properties: {}, required: [] }
      },
      {
        type: 'function',
        name: 'check_availability',
        description: 'Check table availability for a specific date, time, and party size.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format' },
            party_size: { type: 'number', description: 'Number of guests' }
          },
          required: ['date', 'time', 'party_size']
        }
      },
      {
        type: 'function',
        name: 'create_reservation',
        description: 'Create a new reservation after confirming all details with the customer.',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Full name of the customer' },
            customer_phone: { type: 'string', description: 'Phone number' },
            customer_email: { type: 'string', description: 'Email (optional)' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format' },
            party_size: { type: 'number', description: 'Number of guests' },
            special_requests: { type: 'string', description: 'Special requests (optional)' }
          },
          required: ['customer_name', 'customer_phone', 'date', 'time', 'party_size']
        }
      },
      {
        type: 'function',
        name: 'lookup_reservation',
        description: 'Find existing reservation by phone, name, or reservation ID.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: 'Phone number used for reservation' },
            name: { type: 'string', description: 'Name on reservation' },
            reservation_id: { type: 'string', description: 'Reservation ID (e.g., RES-xxx)' }
          }
        }
      },
      {
        type: 'function',
        name: 'modify_reservation',
        description: 'Modify an existing reservation. Lookup the reservation first.',
        parameters: {
          type: 'object',
          properties: {
            reservation_id: { type: 'string', description: 'Reservation ID to modify' },
            new_date: { type: 'string', description: 'New date (optional)' },
            new_time: { type: 'string', description: 'New time (optional)' },
            new_party_size: { type: 'number', description: 'New party size (optional)' }
          },
          required: ['reservation_id']
        }
      },
      {
        type: 'function',
        name: 'cancel_reservation',
        description: 'Cancel an existing reservation.',
        parameters: {
          type: 'object',
          properties: {
            reservation_id: { type: 'string', description: 'Reservation ID to cancel' }
          },
          required: ['reservation_id']
        }
      },
      {
        type: 'function',
        name: 'get_wait_time',
        description: 'Get estimated wait time for walk-in customers.',
        parameters: { type: 'object', properties: {}, required: [] }
      },
      {
        type: 'function',
        name: 'identify_restaurant',
        description: 'Identify which restaurant the customer wants. Use in multi-tenant mode.',
        parameters: {
          type: 'object',
          properties: {
            restaurant_name: { type: 'string', description: 'Restaurant name mentioned by customer' }
          },
          required: ['restaurant_name']
        }
      }
    ];
  }

  async sendAudio(audioBase64) {
    if (!this.connected || !this.ws) return;

    this._send({
      type: 'input_audio_buffer.append',
      audio: audioBase64
    });
  }

  async sendToolResult(callId, result) {
    if (!this.connected || !this.ws) return;

    // Send the tool result
    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result)
      }
    });

    // Trigger AI to respond with the tool result
    this._send({ type: 'response.create' });
  }

  async interrupt() {
    if (!this.connected || !this.ws) return;

    this._send({ type: 'response.cancel' });
  }

  async disconnect() {
    if (this.ws) {
      this.logger.info('Disconnecting from OpenAI Realtime API');
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
    await super.disconnect();
  }

  _send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  _handleMessage(message) {
    switch (message.type) {
      case 'session.created':
        this.sessionId = message.session?.id;
        this.logger.info('Session created', { sessionId: this.sessionId });
        break;

      case 'session.updated':
        this.logger.info('Session configuration updated');
        break;

      case 'response.audio.delta':
        // Audio chunk from AI - forward to Twilio
        if (message.delta) {
          this._emitAudio(message.delta);
        }
        break;

      case 'response.audio_transcript.delta':
        // Partial transcript of AI speech
        if (message.delta) {
          this._emitTranscript({ type: 'ai', text: message.delta, partial: true });
        }
        break;

      case 'response.audio_transcript.done':
        // Complete transcript of AI speech
        if (message.transcript) {
          this._emitTranscript({ type: 'ai', text: message.transcript, partial: false });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User speech transcript completed
        if (message.transcript) {
          this._emitTranscript({ type: 'user', text: message.transcript, partial: false });
        }
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking - useful for interruption handling
        this._emitTranscript({ type: 'user_speech_started' });
        break;

      case 'input_audio_buffer.speech_stopped':
        this._emitTranscript({ type: 'user_speech_stopped' });
        break;

      case 'response.function_call_arguments.done':
        // Tool call completed - emit for processing
        this._emitToolCall({
          callId: message.call_id,
          name: message.name,
          arguments: this._safeParseJSON(message.arguments)
        });
        break;

      case 'response.done':
        // Full response completed - log usage for billing tracking
        this.logger.debug('Response completed', {
          usage: message.response?.usage
        });
        break;

      case 'error':
        this.logger.error('OpenAI Realtime error', message.error);
        this._emitError(message.error);
        break;

      case 'input_audio_buffer.committed':
      case 'input_audio_buffer.cleared':
      case 'response.created':
      case 'response.output_item.added':
      case 'response.output_item.done':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'conversation.item.created':
      case 'rate_limits.updated':
        // Known informational messages - no action needed
        break;

      default:
        this.logger.debug('Unhandled message type', { type: message.type });
    }
  }

  _safeParseJSON(str) {
    try {
      return JSON.parse(str || '{}');
    } catch {
      this.logger.warn('Failed to parse tool call arguments', { raw: str });
      return {};
    }
  }
}

module.exports = OpenAIRealtimeBackend;
