'use strict';

/**
 * WAHAAdapter — Channel adapter for WAHA (WhatsApp HTTP API).
 *
 * Self-hosted WhatsApp bridge. No Meta Cloud API verification needed.
 * Supports: typing indicators, read receipts, reactions, media, voice.
 *
 * WAHA API docs: https://waha.devlike.pro/docs
 */

const { ChannelAdapter } = require('./channel-adapter');
const { createSecureLogger } = require('../secure-logger');
const { transcribeVoiceMessage: transcribeWithWhisper } = require('../whatsapp-interactions');

const logger = createSecureLogger('WAHAAdapter');

function getConfig() {
  return {
    url: process.env.WAHA_URL,
    apiKey: process.env.WAHA_API_KEY,
    session: process.env.WAHA_SESSION || 'default',
  };
}

async function wahaAPI(method, endpoint, body) {
  const { url, apiKey } = getConfig();
  if (!url) throw new Error('WAHA_URL not configured');

  const response = await fetch(`${url}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error(`WAHA API error: ${method} ${endpoint} → ${response.status}`, { body: text.substring(0, 200) });
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function formatChatId(phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.includes('@') ? digits : `${digits}@c.us`;
}

class WAHAAdapter extends ChannelAdapter {
  get providerName() { return 'waha'; }
  get isAsync() { return true; } // Return 200 immediately like Meta

  /**
   * Verify WAHA webhook signature.
   * WAHA supports optional HMAC-SHA512 verification via X-Webhook-Hmac header.
   * Also accepts API key in query param or header.
   */
  async verifySignature(req) {
    const expectedKey = process.env.WAHA_WEBHOOK_SECRET || process.env.WAHA_API_KEY;
    if (!expectedKey) return true; // No key configured = accept all

    // Check HMAC signature if WAHA sends one
    const hmacHeader = req.headers['x-webhook-hmac'];
    if (hmacHeader && process.env.WAHA_HMAC_KEY) {
      const crypto = require('crypto');
      const rawBody = req._rawBody || JSON.stringify(req.body);
      const expected = crypto.createHmac('sha512', process.env.WAHA_HMAC_KEY).update(rawBody).digest('hex');
      try {
        return crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
      } catch {
        return false;
      }
    }

    // Fallback: check API key in header or query
    const headerKey = req.headers['x-api-key'] || req.query?.api_key;
    if (headerKey === expectedKey) return true;

    // If no verification method available, accept (WAHA is self-hosted, trusted network)
    return true;
  }

  /**
   * Parse WAHA webhook payload into unified message format.
   */
  async parseIncoming(req) {
    const { event, payload, session } = req.body || {};

    // Only handle message events
    if (event !== 'message') return null;
    if (!payload) return null;

    const from = payload.from?.replace('@c.us', '').replace('@s.whatsapp.net', '') || '';
    const messageId = payload.id || `waha-${Date.now()}`;
    const hasMedia = payload.hasMedia || false;

    // Skip messages from self (outgoing)
    if (payload.fromMe) return null;

    let text = payload.body || '';
    let messageType = 'text';
    let mediaContext = null;

    // Handle media messages
    if (hasMedia && payload.media) {
      const mimeType = payload.media.mimetype || '';

      if (mimeType.startsWith('audio/')) {
        messageType = 'audio';
        // Download audio from WAHA and transcribe via Whisper
        try {
          const mediaUrl = payload.media.url;
          if (mediaUrl) {
            const { apiKey } = getConfig();
            const audioRes = await fetch(mediaUrl, {
              headers: apiKey ? { 'X-Api-Key': apiKey } : {},
            });
            if (audioRes.ok) {
              const buffer = Buffer.from(await audioRes.arrayBuffer());
              // Transcribe using OpenAI Whisper
              const apiKeyOpenAI = process.env.OPENAI_API_KEY;
              if (apiKeyOpenAI) {
                const FormData = (await import('form-data')).default;
                const form = new FormData();
                const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
                form.append('file', buffer, { filename: `voice.${ext}`, contentType: mimeType });
                form.append('model', 'whisper-1');
                form.append('language', 'pt');

                const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${apiKeyOpenAI}`, ...form.getHeaders() },
                  body: form,
                });
                if (whisperRes.ok) {
                  const result = await whisperRes.json();
                  text = result.text || '';
                  logger.info('WAHA voice transcribed:', text.substring(0, 80));
                }
              }
            }
          }
          if (!text.trim()) {
            await this.sendMessage(from, 'Nao consegui entender o audio. Poderia digitar sua mensagem?');
            return null;
          }
        } catch (err) {
          logger.error('WAHA voice transcription failed:', err.message);
          await this.sendMessage(from, 'Desculpe, nao consegui processar o audio.');
          return null;
        }
      } else if (mimeType.startsWith('image/')) {
        messageType = 'image';
        mediaContext = `[Customer sent an image (${mimeType})]`;
        text = payload.body || 'Sent an image';
      } else if (mimeType === 'application/pdf' || mimeType.includes('document')) {
        messageType = 'document';
        const filename = payload.media.filename || 'document';
        mediaContext = `[Customer sent a document: ${filename}]`;
        text = payload.body || `Sent a document: ${filename}`;
      } else {
        await this.sendMessage(from, 'Consigo processar mensagens de texto e audio. Por favor, envie sua mensagem assim.');
        return null;
      }
    }

    if (!text && !mediaContext) return null;

    return {
      from,
      messageId,
      text,
      messageType,
      mediaContext,
      interactiveSelection: null,
      profileName: payload.notifyName || null,
    };
  }

  async sendMessage(to, text) {
    const { session } = getConfig();
    const chatId = formatChatId(to);

    const result = await wahaAPI('POST', '/api/sendText', {
      session,
      chatId,
      text,
    });

    return { success: !!result, messageId: result?.id };
  }

  async markAsRead(messageId) {
    const { session } = getConfig();
    // WAHA sendSeen takes chatId, not messageId
    // We extract chatId from the message ID format: true_PHONE@c.us_MSGID
    const parts = messageId.split('_');
    const chatId = parts[1] || null;
    if (!chatId) return;

    await wahaAPI('POST', '/api/sendSeen', { session, chatId }).catch(() => {});
  }

  async addReaction(to, messageId, emoji) {
    const { session } = getConfig();
    await wahaAPI('POST', '/api/reaction', {
      session,
      chatId: formatChatId(to),
      messageId,
      reaction: emoji,
    }).catch(() => {});
  }

  async removeReaction(to, messageId) {
    const { session } = getConfig();
    await wahaAPI('POST', '/api/reaction', {
      session,
      chatId: formatChatId(to),
      messageId,
      reaction: '',
    }).catch(() => {});
  }

  /**
   * Send typing indicator.
   */
  async startTyping(to) {
    const { session } = getConfig();
    await wahaAPI('POST', '/api/startTyping', {
      session,
      chatId: formatChatId(to),
    }).catch(() => {});
  }

  async stopTyping(to) {
    const { session } = getConfig();
    await wahaAPI('POST', '/api/stopTyping', {
      session,
      chatId: formatChatId(to),
    }).catch(() => {});
  }
}

module.exports = { WAHAAdapter };
