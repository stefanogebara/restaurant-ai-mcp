/**
 * Base AI Backend Interface
 *
 * Abstract base class for voice AI backends.
 * All backends must implement these methods to be compatible with the voice pipeline.
 */

const { createSecureLogger } = require('../../_lib/secure-logger');

class BaseBackend {
  constructor(name) {
    this.name = name;
    this.logger = createSecureLogger(`Backend:${name}`);
    this.connected = false;

    // Event callbacks
    this._onAudioResponse = null;
    this._onToolCall = null;
    this._onTranscript = null;
    this._onError = null;
    this._onDisconnect = null;
  }

  /**
   * Connect to the AI backend
   * @param {Object} config - Session configuration
   * @param {string} config.systemPrompt - The persona/system prompt
   * @param {string} config.firstMessage - First message to speak
   * @param {string} config.voice - Voice ID or name
   * @param {string} config.language - Language code
   * @param {Array} config.tools - Tool definitions for function calling
   * @param {Object} config.restaurantConfig - Full restaurant config for context
   */
  async connect(config) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Send audio data to the AI backend
   * @param {string} audioBase64 - Base64 encoded PCM 24kHz audio
   */
  async sendAudio(audioBase64) {
    throw new Error('sendAudio() must be implemented by subclass');
  }

  /**
   * Send a tool call result back to the AI
   * @param {string} callId - The tool call ID from the AI
   * @param {Object} result - The result from executing the tool
   */
  async sendToolResult(callId, result) {
    throw new Error('sendToolResult() must be implemented by subclass');
  }

  /**
   * Interrupt the AI (stop current speech generation)
   */
  async interrupt() {
    throw new Error('interrupt() must be implemented by subclass');
  }

  /**
   * Disconnect from the AI backend
   */
  async disconnect() {
    this.connected = false;
  }

  // Event registration
  onAudioResponse(callback) { this._onAudioResponse = callback; }
  onToolCall(callback) { this._onToolCall = callback; }
  onTranscript(callback) { this._onTranscript = callback; }
  onError(callback) { this._onError = callback; }
  onDisconnect(callback) { this._onDisconnect = callback; }

  // Event emission helpers
  _emitAudio(audioBase64) { this._onAudioResponse?.(audioBase64); }
  _emitToolCall(toolCall) { this._onToolCall?.(toolCall); }
  _emitTranscript(transcript) { this._onTranscript?.(transcript); }
  _emitError(error) { this._onError?.(error); }
  _emitDisconnect(reason) { this._onDisconnect?.(reason); }
}

module.exports = BaseBackend;
