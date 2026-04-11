'use strict';

/**
 * WAHAAdapter — Channel adapter for WAHA (WhatsApp HTTP API).
 *
 * WAHA is a self-hosted unofficial WhatsApp Web bridge.
 * Docs: https://waha.devlike.pro/docs
 *
 * Auth: X-Api-Key header.
 * Phone format: "<number>@c.us" — we strip the suffix for session compatibility.
 */

const { ChannelAdapter } = require('./channel-adapter');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('WAHAAdapter');

/**
 * Call the WAHA REST API.
 */
async function wahaAPI(method, endpoint, body) {
  const url = `${process.env.WAHA_URL}${endpoint}`;
  const apiKey = process.env.WAHA_API_KEY;
  if (!process.env.WAHA_URL) throw new Error('WAHA_URL not configured');

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(`WAHA API error: ${method} ${endpoint} → ${res.status}`, { body: text.substring(0, 200) });
    throw new Error(`WAHA API ${res.status}: ${text.substring(0, 100)}`);
  }
  return res.json().catch(() => null);
}

/**
 * Strip @c.us / @s.whatsapp.net suffix from WAHA phone IDs.
 * WAHA uses "5511999999999@c.us"; the rest of the pipeline expects "5511999999999".
 */
function normalizePhone(wahaId) {
  return (wahaId || '').replace(/@[^@]+$/, '');
}

class WAHAAdapter extends ChannelAdapter {
  get providerName() { return 'waha'; }
  get isAsync() { return true; }

  /**
   * Verify WAHA webhook — just check the X-Api-Key header.
   */
  async verifySignature(req) {
    const apiKey = process.env.WAHA_API_KEY;
    if (!apiKey) {
      logger.warn('WAHA_API_KEY not set — skipping signature check');
      return true;
    }
    const incoming = req.headers['x-api-key'];
    if (incoming === apiKey) return true;
    logger.error('WAHA webhook: invalid X-Api-Key');
    return false;
  }

  /**
   * Parse WAHA webhook payload into unified message format.
   *
   * WAHA payload shape:
   * {
   *   event: "message",
   *   session: "default",
   *   payload: {
   *     id: "...",
   *     from: "5511999999999@c.us",
   *     fromMe: false,
   *     body: "hello",
   *     type: "chat",   // chat | image | audio | video | document
   *     hasMedia: false,
   *     timestamp: 1234567890
   *   }
   * }
   */
  async parseIncoming(req) {
    const body = req.body;

    // Only handle 'message' events; ignore 'session.status' etc.
    if (body.event !== 'message') return null;

    const payload = body.payload;
    if (!payload) return null;

    // Skip messages we sent ourselves
    if (payload.fromMe) return null;

    const from = normalizePhone(payload.from);
    const messageId = payload.id;
    const messageType = payload.type || 'chat';

    let text = '';
    let mediaContext = null;

    if (messageType === 'chat') {
      text = payload.body || '';
    } else if (messageType === 'audio' || messageType === 'voice') {
      // WAHA NOWEB doesn't support transcription — ask customer to type
      await this.sendMessage(from, 'Nao consigo processar audios no momento. Por favor, envie sua mensagem por texto.');
      return null;
    } else if (messageType === 'image') {
      const caption = payload.caption || payload.body || '';
      mediaContext = '[Cliente enviou uma imagem]';
      text = caption || 'Enviou uma imagem';
    } else if (messageType === 'document') {
      const filename = payload.filename || 'documento';
      mediaContext = `[Cliente enviou um documento: ${filename}]`;
      text = payload.caption || `Enviou um documento: ${filename}`;
    } else {
      // sticker, video, location, etc.
      await this.sendMessage(from, 'Consigo processar mensagens de texto. Por favor, envie sua mensagem assim.');
      return null;
    }

    if (!text) return null;

    return {
      from,
      messageId,
      text,
      messageType: messageType === 'chat' ? 'text' : messageType,
      mediaContext,
      interactiveSelection: null,
      profileName: payload.notifyName || null,
    };
  }

  /**
   * Send a text message via WAHA.
   */
  async sendMessage(to, text) {
    const session = process.env.WAHA_SESSION || 'default';
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    try {
      await wahaAPI('POST', '/api/sendText', { session, chatId, text });
      return { success: true };
    } catch (err) {
      logger.error('WAHA sendMessage failed:', err.message);
      return { success: false };
    }
  }
}

module.exports = { WAHAAdapter };
