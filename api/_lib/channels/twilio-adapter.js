'use strict';

const twilio = require('twilio');
const { ChannelAdapter } = require('./channel-adapter');
const { createSecureLogger } = require('../secure-logger');
const { sendWhatsAppMessage: sendViaTwilio } = require('../whatsapp/message-sender');
const { buildTwimlResponse, EMPTY_TWIML } = require('../whatsapp/message-sender');

const logger = createSecureLogger('TwilioAdapter');

class TwilioAdapter extends ChannelAdapter {
  get providerName() { return 'twilio'; }
  get isAsync() { return false; } // Twilio expects TwiML response

  /**
   * Verify Twilio webhook signature.
   */
  async verifySignature(req) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      logger.error('TWILIO_AUTH_TOKEN not set');
      return false;
    }
    const signature = req.headers['x-twilio-signature'];
    if (!signature) {
      logger.error('Missing x-twilio-signature header');
      return false;
    }
    const url = `https://${req.headers.host}${req.url}`;
    return twilio.validateRequest(authToken, signature, url, req.body || {});
  }

  /**
   * Parse Twilio webhook payload (URL-encoded form data).
   */
  async parseIncoming(req) {
    let parsedBody = req.body;
    if (typeof req.body === 'string') {
      const params = new URLSearchParams(req.body);
      parsedBody = {};
      for (const [key, value] of params) {
        parsedBody[key] = value;
      }
    }

    const { From, Body, MessageSid, NumMedia, ProfileName } = parsedBody || {};

    if (!From || !Body) return null;

    // Reject media (Twilio path doesn't support voice/image transcription yet)
    if (NumMedia && parseInt(NumMedia) > 0) {
      const fromNumber = From.replace('whatsapp:', '');
      await this.sendMessage(fromNumber, 'I can only process text messages at the moment. Please type your request.');
      return null;
    }

    return {
      from: From.replace('whatsapp:', ''),
      messageId: MessageSid || `twilio-${Date.now()}`,
      text: Body.trim(),
      messageType: 'text',
      mediaContext: null,
      interactiveSelection: null,
      profileName: ProfileName || null,
    };
  }

  async sendMessage(to, text) {
    return sendViaTwilio(to, text);
  }

  /**
   * Build a TwiML response string.
   * @param {string} text
   * @returns {string}
   */
  formatTwimlResponse(text) {
    return buildTwimlResponse(text);
  }

  /**
   * Empty TwiML for acknowledgement without message.
   * @returns {string}
   */
  get emptyResponse() {
    return EMPTY_TWIML;
  }
}

module.exports = { TwilioAdapter };
