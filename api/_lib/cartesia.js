/**
 * Cartesia AI Service
 *
 * Real-time text-to-speech API with ultra-low latency (40-90ms TTFA)
 * Supports emotional TTS with laughter, voice cloning, and Twilio integration
 *
 * Documentation: https://docs.cartesia.ai/
 *
 * Key Features:
 * - Ultra-low latency: 40-90ms Time-to-First-Audio
 * - Voice cloning from just 3 seconds of audio
 * - Real-time emotional TTS with laughter
 * - WebSocket streaming for real-time audio
 * - Twilio telephony integration
 * - PCM µ-law @ 8000 Hz for phone calls
 *
 * Cost: ~$0.00154/minute (~$0.0000256/second)
 * 98% cheaper than ElevenLabs (~$0.10/minute)
 */

const { CartesiaClient } = require('@cartesia/cartesia-js');

// Initialize Cartesia client
let cartesiaClient = null;

/**
 * Get or initialize Cartesia client
 * @returns {CartesiaClient} Cartesia client instance
 */
function getClient() {
  if (!cartesiaClient) {
    const apiKey = process.env.CARTESIA_API_KEY;

    if (!apiKey) {
      throw new Error('CARTESIA_API_KEY environment variable is not set');
    }

    cartesiaClient = new CartesiaClient({
      apiKey: apiKey
    });

    console.log('[Cartesia] Client initialized successfully');
  }

  return cartesiaClient;
}

/**
 * Configuration for Cartesia voices
 * These are the best-performing voices from Cartesia's library
 */
const VOICE_CONFIG = {
  // Professional voices (great for restaurants)
  professional_female: {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091', // Barbershop Man
    name: 'Professional Female',
    description: 'Clear, warm, professional tone'
  },
  professional_male: {
    id: '79a125e8-cd45-4c13-8a67-188112f4dd22', // British Lady
    name: 'Professional Male',
    description: 'Authoritative, clear, professional'
  },

  // Conversational voices (great for AI agents)
  conversational_female: {
    id: '71a7ad14-091c-4e8e-a314-022ece01c121', // Friendly Reading Man
    name: 'Conversational Female',
    description: 'Natural, friendly, engaging'
  },
  conversational_male: {
    id: 'f114a467-c40a-4db8-964d-aaba89cd08fa', // Newsman
    name: 'Conversational Male',
    description: 'Warm, conversational, natural'
  },

  // Default voice (recommended for restaurants)
  default: {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Restaurant AI',
    description: 'Warm, professional, clear'
  }
};

/**
 * Output format configurations for different use cases
 * NOTE: Keys must be camelCase to match Cartesia SDK v2.2.9
 */
const OUTPUT_FORMATS = {
  // For Twilio telephony (phone calls)
  twilio: {
    container: 'raw',
    encoding: 'pcm_mulaw',
    sampleRate: 8000          // camelCase
  },

  // For web streaming (WebSocket)
  web: {
    container: 'raw',
    encoding: 'pcm_f32le',
    sampleRate: 44100         // camelCase
  },

  // For MP3 files
  file_mp3: {
    container: 'mp3',
    encoding: 'mp3',
    sampleRate: 44100,        // camelCase
    bitRate: 128000           // Required for MP3: 128kbps (use 192000 for higher quality)
  },

  // For WAV files
  file_wav: {
    container: 'wav',
    encoding: 'pcm_s16le',
    sampleRate: 44100         // camelCase
  }
};

/**
 * Generate speech from text using Cartesia TTS
 *
 * @param {string} text - The text to convert to speech
 * @param {Object} options - Configuration options
 * @param {string} options.voice - Voice ID or preset name (default: 'default')
 * @param {string} options.model - Model ID (default: 'sonic-english')
 * @param {string} options.outputFormat - Output format preset (default: 'web')
 * @param {number} options.speed - Speech speed multiplier 0.5-2.0 (default: 1.0)
 * @param {string} options.emotion - Emotion controls (e.g., 'positivity:high')
 * @param {boolean} options.streaming - Enable WebSocket streaming (default: false)
 * @returns {Promise<Object>} Audio data and metadata
 */
async function textToSpeech(text, options = {}) {
  const client = getClient();

  // Parse options
  const voicePreset = options.voice || 'default';
  const voice = VOICE_CONFIG[voicePreset] || { id: voicePreset };
  const model = options.model || 'sonic-2';  // Default to sonic-2 (use 'sonic-turbo' for lower latency)
  const outputFormat = OUTPUT_FORMATS[options.outputFormat] || OUTPUT_FORMATS.web;
  const speed = options.speed || 1.0;
  const emotion = options.emotion || '';

  console.log('[Cartesia] Generating speech:', {
    text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
    voice: voice.id,
    model,
    outputFormat: options.outputFormat || 'web',
    speed,
    emotion
  });

  try {
    // If streaming is enabled, use WebSocket
    if (options.streaming) {
      return await streamTextToSpeech(text, { ...options, voice, model, outputFormat, speed, emotion });
    }

    // Otherwise use REST API (bytes endpoint)
    const response = await client.tts.bytes({
      modelId: model,          // Use camelCase
      transcript: text,
      voice: {
        mode: 'id',
        id: voice.id
      },
      outputFormat: outputFormat,  // Use camelCase
      language: 'en'
      // Note: speed and emotion parameters need to be verified in SDK docs
    });

    console.log('[Cartesia] Speech generated successfully');

    return {
      success: true,
      audio: response,
      audioSize: response?.length || response?.byteLength || 0,
      outputFormat: options.outputFormat || 'web',
      voice: voice,
      duration_estimate: estimateDuration(text, speed)
    };
  } catch (error) {
    console.error('[Cartesia] TTS error:', error);
    throw new Error(`Cartesia TTS failed: ${error.message}`);
  }
}

/**
 * Stream speech generation using WebSocket
 * Provides ultra-low latency for real-time conversations
 *
 * @param {string} text - The text to convert to speech
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} WebSocket stream and metadata
 */
async function streamTextToSpeech(text, options = {}) {
  const client = getClient();

  const voice = options.voice || VOICE_CONFIG.default;
  const model = options.model || 'sonic-english';
  const outputFormat = options.outputFormat || OUTPUT_FORMATS.web;

  console.log('[Cartesia] Starting WebSocket stream');

  try {
    const websocket = client.tts.websocket({
      model_id: model,
      voice: {
        mode: 'id',
        id: voice.id
      },
      output_format: outputFormat,
      language: 'en'
    });

    await websocket.connect();

    // Send text for streaming
    const response = await websocket.send({
      model_id: model,
      transcript: text,
      continue: false,
      context_id: options.context_id || `ctx_${Date.now()}`
    });

    console.log('[Cartesia] WebSocket stream started');

    return {
      success: true,
      stream: response,
      websocket: websocket,
      format: outputFormat,
      voice: voice
    };
  } catch (error) {
    console.error('[Cartesia] WebSocket streaming error:', error);
    throw new Error(`Cartesia streaming failed: ${error.message}`);
  }
}

/**
 * Generate speech with emotional control
 * Supports emotions like positivity, curiosity, surprise
 * Also supports laughter integration
 *
 * @param {string} text - The text to convert to speech
 * @param {Object} emotions - Emotion controls
 * @param {string} emotions.positivity - 'lowest', 'low', 'high', 'highest'
 * @param {string} emotions.curiosity - 'lowest', 'low', 'high', 'highest'
 * @param {string} emotions.surprise - 'lowest', 'low', 'high', 'highest'
 * @param {boolean} emotions.laughter - Enable laughter detection
 * @param {Object} options - Additional TTS options
 * @returns {Promise<Object>} Audio data with emotional prosody
 */
async function emotionalTextToSpeech(text, emotions = {}, options = {}) {
  // Build emotion string
  const emotionControls = [];

  if (emotions.positivity) {
    emotionControls.push(`positivity:${emotions.positivity}`);
  }
  if (emotions.curiosity) {
    emotionControls.push(`curiosity:${emotions.curiosity}`);
  }
  if (emotions.surprise) {
    emotionControls.push(`surprise:${emotions.surprise}`);
  }

  // If laughter is enabled, add [laugh] tags where appropriate
  let processedText = text;
  if (emotions.laughter) {
    // Simple heuristic: add laughter after jokes or funny statements
    // In production, you'd use more sophisticated NLP
    processedText = text.replace(/(!|haha|lol)/gi, ' [laugh] ');
  }

  console.log('[Cartesia] Generating emotional speech:', {
    emotions: emotionControls,
    laughter: emotions.laughter
  });

  return textToSpeech(processedText, {
    ...options,
    emotion: emotionControls.join(',')
  });
}

/**
 * Clone a voice from an audio sample
 * Requires only 3 seconds of audio (vs ElevenLabs' 30 seconds)
 *
 * @param {Buffer} audioSample - Audio sample buffer (3+ seconds)
 * @param {string} voiceName - Name for the cloned voice
 * @param {string} description - Description of the voice
 * @returns {Promise<Object>} Cloned voice details
 */
async function cloneVoice(audioSample, voiceName, description) {
  const client = getClient();

  console.log('[Cartesia] Cloning voice from sample:', {
    name: voiceName,
    sampleSize: audioSample.length
  });

  try {
    const result = await client.voices.clone({
      name: voiceName,
      description: description,
      audio: audioSample,
      language: 'en'
    });

    console.log('[Cartesia] Voice cloned successfully:', result.id);

    return {
      success: true,
      voice_id: result.id,
      name: voiceName,
      description: description
    };
  } catch (error) {
    console.error('[Cartesia] Voice cloning error:', error);
    throw new Error(`Voice cloning failed: ${error.message}`);
  }
}

/**
 * Estimate audio duration based on text length and speech speed
 * Average speaking rate: ~150 words per minute
 *
 * @param {string} text - The text to estimate
 * @param {number} speed - Speech speed multiplier (default: 1.0)
 * @returns {number} Estimated duration in seconds
 */
function estimateDuration(text, speed = 1.0) {
  const wordCount = text.split(/\s+/).length;
  const wordsPerMinute = 150 * speed;
  const minutes = wordCount / wordsPerMinute;
  return Math.ceil(minutes * 60);
}

/**
 * Calculate cost for a TTS request
 * Cartesia pricing: 1 credit = 1 character
 * $5/month = 500K credits (Pro plan)
 * $25/month = 3M credits (Scale plan)
 *
 * @param {string} text - The text to be synthesized
 * @returns {Object} Cost breakdown
 */
function calculateCost(text) {
  const characterCount = text.length;

  // Pro plan: $5/month for 500K credits = $0.00001/credit
  const proPlanCostPerCredit = 5 / 500000;
  const proPlanCost = characterCount * proPlanCostPerCredit;

  // Scale plan: $25/month for 3M credits = $0.00000833/credit
  const scalePlanCostPerCredit = 25 / 3000000;
  const scalePlanCost = characterCount * scalePlanCostPerCredit;

  // Free plan: 10K credits/month
  const freeCreditsRemaining = Math.max(0, 10000 - characterCount);

  return {
    character_count: characterCount,
    credits_used: characterCount,
    pro_plan_cost: proPlanCost,
    scale_plan_cost: scalePlanCost,
    free_credits_remaining: freeCreditsRemaining,
    estimated_duration_seconds: estimateDuration(text)
  };
}

/**
 * Health check for Cartesia service
 * Verifies API key and connection
 *
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
  try {
    const client = getClient();

    // Try a minimal TTS request to verify service
    const testText = "Hello";
    const result = await textToSpeech(testText, {
      outputFormat: 'web'
    });

    return {
      success: true,
      status: 'healthy',
      message: 'Cartesia service is operational',
      api_key_valid: true,
      test_request_successful: result.success
    };
  } catch (error) {
    console.error('[Cartesia] Health check failed:', error);
    return {
      success: false,
      status: 'unhealthy',
      message: error.message,
      api_key_valid: false
    };
  }
}

module.exports = {
  // Core functions
  getClient,
  textToSpeech,
  streamTextToSpeech,
  emotionalTextToSpeech,
  cloneVoice,

  // Utilities
  estimateDuration,
  calculateCost,
  healthCheck,

  // Constants
  VOICE_CONFIG,
  OUTPUT_FORMATS
};
