'use strict';

/**
 * WhatsApp UX Interactions
 *
 * Provides typing indicators, read receipts, reaction emojis,
 * voice message transcription, and media downloading for the
 * Meta WhatsApp Cloud API.
 *
 * Inspired by the Kayro channel-adapter pattern.
 */

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('WhatsAppInteractions');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

function getCredentials() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

async function metaApiCall(phoneNumberId, accessToken, endpoint, body) {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response;
}

// ─── Read Receipts ──────────────────────────────────────────────

/**
 * Mark a message as read (blue checkmarks).
 * @param {string} messageId - The WhatsApp message ID to mark as read
 */
async function markAsRead(messageId) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    logger.info('Marked message as read', { messageId });
  } catch (err) {
    logger.warn('Failed to mark as read (non-fatal)', { error: err.message });
  }
}

// ─── Reactions ──────────────────────────────────────────────────

/**
 * Add an emoji reaction to a message.
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message to react to
 * @param {string} emoji - Emoji character (e.g. '👀', '✅')
 */
async function addReaction(to, messageId, emoji) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
  } catch (err) {
    logger.warn('Failed to add reaction (non-fatal)', { error: err.message });
  }
}

/**
 * Remove a reaction from a message.
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message to remove reaction from
 */
async function removeReaction(to, messageId) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: '' },
    });
  } catch (err) {
    logger.warn('Failed to remove reaction (non-fatal)', { error: err.message });
  }
}

// ─── Tetos de mídia ─────────────────────────────────────────────
//
// Antes não havia teto NENHUM: nem de tamanho, nem de prazo. Um número hostil
// mandando 200 áudios de 10 minutos gerava, por mensagem, um download de até
// 16 MB dentro de um Lambda de 512 MB mais uma chamada ao Whisper (≈US$0,06 por
// áudio de 10 min) — sem limite e sem ninguém olhando. E como a transcrição
// acontece antes do dedup, cada reentrega da Meta re-transcrevia e pagava de
// novo.
//
// 2 MB de áudio ≈ 4 minutos de voz no codec opus do WhatsApp: muito acima de
// qualquer pedido de reserva de verdade e muito abaixo do que dói.

/** Teto geral (imagem, documento). */
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
/** Teto de áudio — mais apertado, porque cada byte vira custo de Whisper. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const PRAZO_METADADOS_MS = 8000;
const PRAZO_DOWNLOAD_MS = 20000;
const PRAZO_WHISPER_MS = 30000;

/** Erro tipado: quem chama precisa distinguir "grande demais" de "deu ruim". */
class MidiaGrandeDemais extends Error {
  constructor(bytes, teto) {
    super(`Mídia de ${Math.round(bytes / 1024)}KB excede o teto de ${Math.round(teto / 1024)}KB`);
    this.name = 'MidiaGrandeDemais';
    this.bytes = bytes;
    this.teto = teto;
  }
}

/**
 * fetch com prazo. Sem isto, um download pendurado consome o maxDuration da
 * função inteira e a mensagem do cliente morre por timeout — pagando o download
 * e não entregando nada.
 */
async function buscarComPrazo(url, opcoes, prazoMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), prazoMs);
  try {
    return await fetch(url, { ...opcoes, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Media Download ─────────────────────────────────────────────

/**
 * Download media from WhatsApp (images, audio, documents).
 * @param {string} mediaId - WhatsApp media ID
 * @returns {Promise<{buffer: Buffer, mimeType: string, filename: string|null}>}
 */
async function downloadMedia(mediaId, opcoes = {}) {
  const creds = getCredentials();
  if (!creds) throw new Error('WhatsApp not configured');

  const tetoBytes = Number.isFinite(opcoes.maxBytes) ? opcoes.maxBytes : MAX_MEDIA_BYTES;

  // Passo 1: metadados. Vêm com `file_size`, então dá pra RECUSAR antes de
  // gastar banda e memória — é aqui que o teto realmente economiza.
  const metaRes = await buscarComPrazo(`${WHATSAPP_API_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  }, PRAZO_METADADOS_MS);
  if (!metaRes.ok) throw new Error(`Media metadata fetch failed: ${metaRes.status}`);
  const meta = await metaRes.json();

  const tamanhoDeclarado = Number(meta.file_size);
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > tetoBytes) {
    throw new MidiaGrandeDemais(tamanhoDeclarado, tetoBytes);
  }

  // Passo 2: baixa o arquivo.
  const fileRes = await buscarComPrazo(meta.url, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  }, PRAZO_DOWNLOAD_MS);
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);

  const buffer = Buffer.from(await fileRes.arrayBuffer());

  // Cinto e suspensório: a Meta pode omitir ou subestimar file_size, e o
  // Lambda tem 512 MB. Sem esta segunda checagem o teto seria só uma sugestão.
  if (buffer.length > tetoBytes) {
    throw new MidiaGrandeDemais(buffer.length, tetoBytes);
  }

  return {
    buffer,
    mimeType: meta.mime_type || 'application/octet-stream',
    filename: meta.filename || null,
    size: buffer.length,
  };
}

// ─── Voice Transcription ────────────────────────────────────────

/**
 * Transcribe a voice message using OpenAI Whisper.
 * @param {string} mediaId - WhatsApp media ID of the audio message
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeVoiceMessage(mediaId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for voice transcription');

  // Teto próprio, mais apertado que o geral: cada byte aqui vira custo de
  // Whisper, e a Meta recusa o áudio pelo tamanho ANTES do download.
  const { buffer, mimeType } = await downloadMedia(mediaId, { maxBytes: MAX_AUDIO_BYTES });
  logger.info('Downloaded voice message', { size: buffer.length, mimeType });

  // Determine file extension from mime type
  const extMap = {
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
  };
  const ext = extMap[mimeType.split(';')[0].trim()] || 'ogg';

  // Call OpenAI Whisper API
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', buffer, { filename: `voice.${ext}`, contentType: mimeType });
  form.append('model', 'whisper-1');
  form.append('language', 'pt'); // Default to Portuguese for Brazilian market

  const whisperRes = await buscarComPrazo('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  }, PRAZO_WHISPER_MS);

  if (!whisperRes.ok) {
    const err = await whisperRes.text();
    throw new Error(`Whisper transcription failed: ${whisperRes.status} ${err}`);
  }

  const result = await whisperRes.json();
  logger.info('Voice transcribed', { text: result.text?.substring(0, 80) });
  return result.text || '';
}

// ─── Typing Simulation ─────────────────────────────────────────

/**
 * Simulate a natural typing delay based on response length.
 * @param {number} responseLength - Length of the response about to be sent
 * @returns {Promise<void>}
 */
async function simulateTypingDelay(_responseLength) {
  // Intentionally removed: artificial delay was pushing pipeline past Meta's
  // 5s retry window, causing concurrent duplicate invocations that beat Redis dedup.
  // WhatsApp typing indicators (the "..." bubble) are a better UX signal anyway.
}

module.exports = {
  markAsRead,
  addReaction,
  removeReaction,
  downloadMedia,
  transcribeVoiceMessage,
  simulateTypingDelay,
  MidiaGrandeDemais,
  MAX_MEDIA_BYTES,
  MAX_AUDIO_BYTES,
};
