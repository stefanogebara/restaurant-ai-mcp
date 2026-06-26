'use strict';

const crypto = require('crypto');
const { ChannelAdapter } = require('./channel-adapter');
const { createSecureLogger } = require('../secure-logger');
const { sendWhatsAppMessage } = require('../whatsapp-sender');
const {
  markAsRead: markAsReadAPI,
  addReaction: addReactionAPI,
  removeReaction: removeReactionAPI,
  transcribeVoiceMessage,
  downloadMedia,
} = require('../whatsapp-interactions');
const { sendInteractiveListMessage } = require('../../_services/whatsapp/message-sender');

const logger = createSecureLogger('MetaAdapter');

class MetaAdapter extends ChannelAdapter {
  get providerName() { return 'meta'; }
  get isAsync() { return true; }

  /**
   * Verify Meta webhook signature (HMAC-SHA256).
   */
  async verifySignature(req) {
    // Accept any configured app secret. The prospecting number can live on a
    // SEPARATE Meta app/WABA whose inbound webhooks are signed with that app's
    // secret; PROSPECTING_APP_SECRET lets those validate without weakening the
    // reservations webhook. Unset = identical behaviour to before.
    const secrets = [
      process.env.META_APP_SECRET,
      process.env.WHATSAPP_APP_SECRET,
      process.env.PROSPECTING_APP_SECRET,
    ].filter(Boolean);
    if (secrets.length === 0) {
      logger.error('No app secret configured (META_APP_SECRET)');
      return false;
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      logger.error('Missing X-Hub-Signature-256 header');
      return false;
    }
    const rawBody = req._rawBody || req.rawBody;
    if (!rawBody && typeof req.body !== 'string') {
      logger.error('No raw body available for HMAC verification');
      return false;
    }
    const bodyForHmac = rawBody || req.body;
    const sigBuf = Buffer.from(signature);
    for (const secret of secrets) {
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyForHmac).digest('hex');
      const expBuf = Buffer.from(expected);
      try {
        if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) return true;
      } catch { /* try next secret */ }
    }
    return false;
  }

  /**
   * Parse Meta WhatsApp Cloud API webhook payload into unified format.
   * Returns null if the message should be skipped (status update, TwinMe forward, provider mismatch).
   */
  async parseIncoming(req) {
    const body = req.body;
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Status updates — not a message
    if (!value?.messages) return null;

    const message = value.messages[0];
    const from = message.from;
    const messageId = message.id;
    const messageType = message.type;

    let text = '';
    let interactiveSelection = null;
    let mediaContext = null;

    if (messageType === 'text') {
      text = message.text?.body || '';
    } else if (messageType === 'interactive') {
      const interactiveType = message.interactive?.type;
      if (interactiveType === 'list_reply') {
        interactiveSelection = message.interactive.list_reply;
        text = interactiveSelection.title || '';
      } else if (interactiveType === 'button_reply') {
        interactiveSelection = message.interactive.button_reply;
        text = interactiveSelection.title || '';
      }
    } else if (messageType === 'audio') {
      const audioMediaId = message.audio?.id;
      if (audioMediaId) {
        try {
          addReactionAPI(from, messageId, '\uD83C\uDFA4').catch(() => {});
          text = await transcribeVoiceMessage(audioMediaId);
          removeReactionAPI(from, messageId).catch(() => {});
          if (!text.trim()) {
            await this.sendMessage(from, 'Nao consegui entender o audio. Poderia tentar novamente ou digitar sua mensagem?');
            return null;
          }
          logger.info(`Voice transcribed from ${from}: ${text.substring(0, 80)}`);
        } catch (err) {
          logger.error('Voice transcription failed:', err.message);
          removeReactionAPI(from, messageId).catch(() => {});
          await this.sendMessage(from, 'Desculpe, nao consegui processar o audio. Por favor, envie sua mensagem por texto.');
          return null;
        }
      }
    } else if (messageType === 'image') {
      const imageMediaId = message.image?.id;
      const caption = message.image?.caption || '';
      if (imageMediaId) {
        try {
          const media = await downloadMedia(imageMediaId);
          mediaContext = `[Customer sent an image (${Math.round(media.size / 1024)}KB, ${media.mimeType})]`;
          text = caption || 'Sent an image';
        } catch (err) {
          logger.error('Image download failed:', err.message);
          text = caption || 'Sent an image (could not download)';
        }
      }
    } else if (messageType === 'document') {
      const filename = message.document?.filename || 'document';
      const caption = message.document?.caption || '';
      mediaContext = `[Customer sent a document: ${filename}]`;
      text = caption || `Sent a document: ${filename}`;
    } else {
      // Unsupported type
      await this.sendMessage(from, 'Consigo processar mensagens de texto e audio. Por favor, envie sua mensagem assim.');
      return null;
    }

    if (!text && messageType !== 'text' && messageType !== 'interactive') {
      return null;
    }

    return {
      from,
      messageId,
      text,
      messageType,
      mediaContext,
      interactiveSelection,
      profileName: value.contacts?.[0]?.profile?.name || null,
      phoneNumberId: value.metadata?.phone_number_id || null,
    };
  }

  async sendMessage(to, text) {
    return sendWhatsAppMessage(to, text, { provider: 'meta' });
  }

  async markAsRead(messageId) {
    return markAsReadAPI(messageId);
  }

  async addReaction(to, messageId, emoji) {
    return addReactionAPI(to, messageId, emoji);
  }

  async removeReaction(to, messageId) {
    return removeReactionAPI(to, messageId);
  }

  async sendInteractiveList(to, bodyText, buttonText, sections) {
    return sendInteractiveListMessage(to, bodyText, buttonText, sections);
  }

  async sendButtons(to, bodyText, buttons) {
    const { sendInteractiveButtonMessage } = require('../../_services/whatsapp/message-sender');
    return sendInteractiveButtonMessage(to, bodyText, buttons);
  }

  /**
   * Check if this message should be handled by Meta (not forwarded to TwinMe or Twilio).
   * Returns { handle: true } or { handle: false, reason: string, response?: object }.
   */
  async shouldHandle(req) {
    const body = req.body;
    const value = body.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) {
      return { handle: false, reason: 'no_messages' };
    }

    // TwinMe phone number forwarding
    const incomingPhoneNumberId = value.metadata?.phone_number_id;
    const TWINME_PHONE_NUMBER_ID = '882860144919419';
    if (incomingPhoneNumberId === TWINME_PHONE_NUMBER_ID) {
      try {
        const axios = require('axios');
        await axios.post('https://twin-ai-learn.vercel.app/api/whatsapp-twin/webhook', body, {
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': req.headers['x-hub-signature-256'] },
          timeout: 10000,
        });
      } catch (err) {
        logger.error('TwinMe forward failed', { error: err.message });
      }
      return { handle: false, reason: 'twinme_forward' };
    }

    return { handle: true };
  }
}

module.exports = { MetaAdapter };
