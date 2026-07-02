'use strict';

/**
 * Prospecting-aware inbound parsing (Meta Cloud API payloads).
 *
 * The restaurant pipeline's MetaAdapter.parseIncoming is customer-facing: it
 * auto-replies to unreadable media and drops unsupported types — from the
 * RESTAURANT number, in the reservations persona. Prospecting traffic must never
 * trigger those sends, and needs types the restaurant flow ignores (shared
 * contact cards are Olivia's best conversion path). This module is the pure
 * mapping from a raw Meta `messages[0]` to `{ tipo, corpo }`, mirroring
 * prospectautomation's extractCorpo so downstream logic (owner guardrail,
 * placeholder safety net, prompt rules 6b/6c) behaves identically:
 *
 *  - contacts  → '[Contato compartilhado: <nums> | nome: <NAME>]' (exact format)
 *  - audio     → corpo null here; the inbound handler transcribes and stores
 *                '[áudio] <transcript>' on success (rule 6c), null on failure
 *                (placeholder → rule 6b asks to resend). Nothing is fabricated.
 *  - image/document/video/sticker → caption if present, else null (placeholder).
 *  - unknown   → corpo null, tipo verbatim; no placeholder exists → the
 *                responder stays silent (safer than guessing).
 */

/** Flatten a Meta 'contacts' message into the shared-card line. */
function formatarCartaoContato(contacts) {
  const list = Array.isArray(contacts) ? contacts : [];
  const nums = [];
  let nome = null;
  for (const c of list) {
    for (const p of c?.phones || []) {
      const n = (p?.wa_id || p?.phone || '').toString().trim();
      if (n) nums.push(n.startsWith('+') ? n : `+${n.replace(/[^\d]/g, '')}`);
    }
    if (!nome) {
      const n = (c?.name?.formatted_name || c?.name?.first_name || '').toString().trim();
      if (n) nome = n;
    }
  }
  if (nums.length === 0) return null;
  const base = `[Contato compartilhado: ${nums.join(', ')}`;
  return nome ? `${base} | nome: ${nome}]` : `${base}]`;
}

/**
 * Map one raw Meta message to { tipo, corpo, mediaId }. Pure — no I/O, no sends.
 * `corpo: null` means "stored as unreadable media"; the placeholder safety net
 * (prospect-agent.placeholderMidia) represents it to the LLM.
 *
 * @param {object} message - body.entry[0].changes[0].value.messages[0]
 * @returns {{tipo: string, corpo: string|null, mediaId: string|null}}
 */
function extractProspectCorpo(message) {
  const tipo = message?.type || 'unknown';
  switch (tipo) {
    case 'text':
      return { tipo, corpo: message.text?.body || null, mediaId: null };
    case 'button':
      return { tipo, corpo: message.button?.text || null, mediaId: null };
    case 'interactive': {
      const i = message.interactive;
      const corpo = i?.button_reply?.title || i?.list_reply?.title || null;
      return { tipo, corpo, mediaId: null };
    }
    case 'contacts':
      return { tipo, corpo: formatarCartaoContato(message.contacts), mediaId: null };
    case 'audio':
    case 'voice':
      // Transcription is I/O — the inbound handler does it and prefixes
      // '[áudio] '. corpo stays null here so a failed transcription falls
      // into the placeholder net instead of fabricating content.
      return { tipo: 'audio', corpo: null, mediaId: message.audio?.id || message.voice?.id || null };
    case 'image':
      return { tipo, corpo: message.image?.caption?.trim() || null, mediaId: message.image?.id || null };
    case 'video':
      return { tipo, corpo: message.video?.caption?.trim() || null, mediaId: message.video?.id || null };
    case 'document':
      return { tipo, corpo: message.document?.caption?.trim() || null, mediaId: message.document?.id || null };
    case 'sticker':
      return { tipo, corpo: null, mediaId: message.sticker?.id || null };
    default:
      return { tipo, corpo: message?.[tipo]?.caption || null, mediaId: null };
  }
}

module.exports = { extractProspectCorpo, formatarCartaoContato };
