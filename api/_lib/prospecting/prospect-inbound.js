'use strict';

/**
 * Prospecting inbound handler.
 *
 * Cold-outreach replies arrive on the dedicated prospecting number and are
 * routed here by the webhook fork (see whatsapp-webhook.js) BEFORE the
 * restaurant pipeline, because a prospect has no restaurant_id and would
 * otherwise be dropped into a restaurant AI conversation / the restaurant picker.
 *
 * Parsing is prospecting-aware (prospect-parse.js), NOT the restaurant
 * adapter's parseIncoming: that path auto-replies to unreadable media from the
 * RESTAURANT number/persona and drops contact cards entirely. Here:
 *  - contact cards become '[Contato compartilhado: ...]' (owner-referral path),
 *  - audio is transcribed to '[áudio] <texto>' (prompt rule 6c) or stored with
 *    an empty body on failure (placeholder → rule 6b asks to resend),
 *  - nothing is ever auto-replied outside the responder (single send path).
 *
 * Flow: dedup → parse → store inbound → honor opt-out suppression → (if the
 * phone maps to a known lead) hand off to the responder. An inbound from an
 * unknown number is stored but not answered. Sends are DRY-RUN-default-on.
 */

const { createSecureLogger } = require('../secure-logger');
const { isMessageDuplicate } = require('../rate-limit');
const { isOptedOut, findLeadByPhone, storeMessage, patchLead, recordEvent } = require('./prospect-store');
const { respondToProspect } = require('./prospect-responder');
const { extractProspectCorpo } = require('./prospect-parse');
const { placeholderMidia } = require('./prospect-agent');
const { extrairNumeroIndicado } = require('./numero-indicado');

const logger = createSecureLogger('ProspectInbound');

/**
 * @param {import('../channels/channel-adapter').ChannelAdapter} adapter - kept in
 *   the signature for webhook-fork compatibility; no longer used for parsing.
 * @param {object} req - the raw webhook request (req.body already parsed)
 * @returns {Promise<{handled: boolean, reason?: string}>}
 */
async function handleProspectInbound(adapter, req) {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return { handled: false, reason: 'no_message' };

  const from = message.from;
  const messageId = message.id;
  const profileName = value.contacts?.[0]?.profile?.name || null;

  // Dedup FIRST — Meta retries webhooks; the same wamid must process once, and
  // must never pay for transcription twice. Shares the restaurant pipeline's
  // Redis dedup namespace/TTL (keyed by msg id).
  if (messageId && await isMessageDuplicate(messageId, 86400)) {
    logger.info(`[prospect] duplicate ${String(messageId).slice(-8)}, skipping`);
    return { handled: true, reason: 'duplicate' };
  }

  // Resolved BEFORE transcription so a failed transcript can be recorded on the
  // lead's timeline (below) instead of dying in a log line.
  const lead = await findLeadByPhone(from);

  // Prospecting-aware parse (pure). Audio is transcribed here (I/O), stored as
  // '[áudio] <texto>' so the agent treats it as typed content (rule 6c); a
  // failed transcription keeps corpo null → placeholder safety net (rule 6b).
  let { tipo, corpo, mediaId } = extractProspectCorpo(message);
  if (tipo === 'audio' && mediaId) {
    try {
      const { transcribeVoiceMessage } = require('../whatsapp-interactions');
      const transcript = await transcribeVoiceMessage(mediaId);
      if (transcript && transcript.trim()) corpo = `[áudio] ${transcript.trim()}`;
    } catch (err) {
      logger.warn(`[prospect] audio transcription failed (placeholder path): ${err.message}`);
      // Sem isto a falha só existe no log: ninguém no cockpit descobre que o
      // Whisper caiu, e o turno mais quente da conversa (dono de bairro responde
      // por áudio) vira um "me manda por escrito" sem explicação.
      if (lead) {
        await recordEvent(lead.id, `🎙 áudio não transcrito (${String(err.message).slice(0, 80)}) — a agente vai pedir por escrito`);
      }
    }
  }

  const optedOut = await isOptedOut(from);

  // Always store the inbound, even from an unknown number / opted-out contact —
  // the message log is the audit trail. lead_id is null when we can't match yet.
  // corpo may be null (unreadable media): the placeholder net represents it.
  await storeMessage({
    leadId: lead?.id || null,
    direcao: 'in',
    wamid: messageId || null,
    tipo,
    corpo: corpo || null,
    raw: value || null,
  });

  logger.info(
    `[prospect] inbound stored from=${String(from).slice(0, 4)}**** ` +
    `lead=${lead?.id ? 'matched' : 'unknown'} optout=${optedOut} ` +
    `type=${tipo} corpo=${corpo ? 'yes' : 'empty'} name=${profileName ? 'yes' : 'no'}`
  );

  let leadAtual = lead;
  if (lead) {
    // last_in_at drives the 24h-window countdown, triage ordering and the
    // multi-touch halt (a lead that ever replied leaves the cold sequence);
    // an inbound also wakes a snoozed thread and cancels pending touches.
    const frescos = {
      last_in_at: new Date().toISOString(),
      snoozed_until: null,
      next_touch_at: null,
      // The lead messaged first — cancel any pending dated callback (#32); the
      // live conversation supersedes "me chama amanhã".
      retorno_em: null,
      retorno_motivo: null,
    };

    // A casa publicou OUTRO número? O menu do autoatendimento costuma dizer
    // para onde vai cada assunto ("2️⃣ Reservas 📲 / 1197321-0441"). O Zé Leite
    // mandou isso na PRIMEIRA resposta e a agente seguiu oito mensagens
    // perguntando quem cuidava de reservas, com o número na tela.
    //
    // Só registra — quem decide falar com esse número é o fundador. Escrever
    // sozinha para um número que a casa publica para clientes, sem template
    // aprovado, é pedido de denúncia.
    //
    // Não sobrescreve indicação anterior: a primeira costuma ser a do menu
    // oficial, e re-registrar a cada mensagem faria o cockpit piscar sem motivo.
    if (corpo && !lead.numero_indicado) {
      const indicado = extrairNumeroIndicado(corpo, { numeroDoLead: lead.whatsapp_phone });
      if (indicado) {
        frescos.numero_indicado = indicado.numero;
        frescos.numero_indicado_contexto = indicado.contexto;
        frescos.numero_indicado_em = new Date().toISOString();
        await recordEvent(lead.id, `📇 a casa indicou outro número: ${indicado.numero} — "${indicado.contexto.slice(0, 90)}"`);
        logger.info(`[prospect] numero indicado lead=${lead.id} ${indicado.numero}`);
      }
    }

    await patchLead(lead.id, frescos);
    // MIRROR THE PATCH LOCALLY — do not delete this spread.
    // patchLead writes to the DB but returns only { ok }, so `lead` still holds
    // the PREVIOUS last_in_at. The responder gates the Meta 24h free-text window
    // on lead.last_in_at: passing the stale object makes it judge the inbound
    // that JUST arrived by the timestamp of the one before it. Since the resgate
    // template fires at D+3 of silence, that previous inbound is always >24h old
    // → the reply is cancelled with "⏱ janela de 24h fechada". Net effect: the
    // lead comes back and we silence them. (Breaks from the 2nd inbound on — on
    // the 1st, last_in_at is null and the `lead.last_in_at &&` guard passes. The
    // flush path never had the bug because selectDueFlush re-reads the row.)
    leadAtual = { ...lead, ...frescos };
  }

  // Suppressed (LGPD) — stored for the audit trail, but never answered.
  if (optedOut) {
    return { handled: true, reason: 'optout' };
  }

  // Unknown number — no lead context to converse from. Stored; a human can
  // triage. (Cold conversations always start from a lead we messaged in Phase 2.)
  if (!lead) {
    return { handled: true, reason: 'unknown_number' };
  }

  // Reply when there is readable text OR the media type has a placeholder (the
  // agent acknowledges it and asks to resend — rule 6b). Media without a
  // placeholder stays silent: safer than guessing.
  if ((!corpo || !String(corpo).trim()) && !placeholderMidia(tipo)) {
    return { handled: true, reason: 'no_text' };
  }

  const result = await respondToProspect({ lead: leadAtual, from, text: corpo || '' })
    .catch((err) => {
      logger.error('respondToProspect error:', err.message);
      return { action: 'error' };
    });
  return { handled: true, reason: `responded:${result.action}` };
}

module.exports = { handleProspectInbound };
