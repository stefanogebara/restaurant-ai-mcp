'use strict';

/**
 * ChannelAdapter — Base class for messaging channel adapters.
 *
 * Inspired by the Kayro channel-adapter pattern. Each messaging provider
 * (Meta WhatsApp Cloud API, Twilio, future Telegram/Instagram) implements
 * this interface. The MessageProcessor consumes the unified format.
 *
 * @abstract
 */
class ChannelAdapter {
  /**
   * Verify the webhook signature for this provider.
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<boolean>}
   */
  async verifySignature(req) {
    throw new Error('verifySignature() not implemented');
  }

  /**
   * Parse an incoming webhook into a unified message format.
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<ParsedMessage|null>} null if message should be skipped
   *
   * @typedef {Object} ParsedMessage
   * @property {string} from - Sender phone number (E.164, no prefix)
   * @property {string} messageId - Provider-specific message ID
   * @property {string} text - Message text (or transcription for audio)
   * @property {string} messageType - 'text'|'interactive'|'audio'|'image'|'document'|'unsupported'
   * @property {string|null} mediaContext - Description of media for AI context
   * @property {Object|null} interactiveSelection - Interactive list/button reply data
   * @property {string|null} profileName - Sender's display name
   */
  async parseIncoming(req) {
    throw new Error('parseIncoming() not implemented');
  }

  /**
   * Send a text message to a recipient.
   * @param {string} to - Recipient phone number
   * @param {string} text - Message content
   * @returns {Promise<{success: boolean, messageId?: string}>}
   */
  async sendMessage(to, text) {
    throw new Error('sendMessage() not implemented');
  }

  /**
   * Mark a message as read (blue checkmarks). No-op if not supported.
   * @param {string} messageId
   */
  async markAsRead(messageId) {}

  /**
   * Add an emoji reaction to a message. No-op if not supported.
   * @param {string} to - Recipient phone
   * @param {string} messageId
   * @param {string} emoji
   */
  async addReaction(to, messageId, emoji) {}

  /**
   * Remove a reaction from a message. No-op if not supported.
   * @param {string} to - Recipient phone
   * @param {string} messageId
   */
  async removeReaction(to, messageId) {}

  /**
   * Send an interactive list message. No-op if not supported.
   * @param {string} to
   * @param {string} bodyText
   * @param {string} buttonText
   * @param {Array} sections
   */
  async sendInteractiveList(to, bodyText, buttonText, sections) {}

  /**
   * Send an interactive button message (quick replies). No-op if not supported.
   * @param {string} to
   * @param {string} bodyText
   * @param {Array<{id: string, title: string}>} buttons - max 3
   */
  async sendButtons(to, bodyText, buttons) {}

  /**
   * Whether this adapter processes async (returns 200 immediately).
   * Meta returns 200 then processes in background. Twilio needs TwiML response.
   * @returns {boolean}
   */
  get isAsync() { return false; }

  /**
   * Provider name for logging.
   * @returns {string}
   */
  get providerName() { return 'unknown'; }
}

module.exports = { ChannelAdapter };
