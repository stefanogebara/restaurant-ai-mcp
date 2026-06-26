'use strict';

/**
 * Prospecting data-access layer (service_role only).
 *
 * All prospecting tables are service-role scoped (see 20260626_prospecting.sql),
 * so every read/write here goes through supabaseAdmin. Keep storage details
 * behind this module — handlers talk to these functions, not Supabase directly.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { brCandidates, toE164 } = require('./phone');

const logger = createSecureLogger('ProspectStore');

/** Build the set of E.164 + bare-digit strings a stored phone might equal. */
function phoneMatchCandidates(rawPhone) {
  const digits = brCandidates(rawPhone);
  const out = new Set();
  for (const d of digits) {
    out.add('+' + d);
    out.add(d);
  }
  const e164 = toE164(rawPhone);
  if (e164) out.add(e164);
  return Array.from(out);
}

/**
 * Is this phone on the prospecting opt-out / suppression list? (LGPD)
 * @param {string} rawPhone
 * @returns {Promise<boolean>}
 */
async function isOptedOut(rawPhone) {
  try {
    const candidates = phoneMatchCandidates(rawPhone);
    const { data, error } = await supabaseAdmin
      .from('prospect_optout')
      .select('id')
      .in('phone', candidates)
      .limit(1);
    if (error) {
      logger.error('isOptedOut query failed:', error.message);
      return false; // fail open on a read error — do not block on infra hiccup
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    logger.error('isOptedOut exception:', err.message);
    return false;
  }
}

/**
 * Find a prospect lead by inbound phone (handles BR 9th-digit / country-code
 * variants). Returns the lead row or null.
 * @param {string} rawPhone
 * @returns {Promise<object|null>}
 */
async function findLeadByPhone(rawPhone) {
  try {
    const candidates = phoneMatchCandidates(rawPhone);
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .or(candidates.map(c => `whatsapp_phone.eq.${c}`).join(','))
      .limit(1);
    if (error) {
      logger.error('findLeadByPhone query failed:', error.message);
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (err) {
    logger.error('findLeadByPhone exception:', err.message);
    return null;
  }
}

/**
 * Store an inbound or outbound prospect message. wamid is the dedup key — Meta
 * re-delivers webhooks, so a duplicate wamid is ignored (ON CONFLICT DO NOTHING
 * via upsert with ignoreDuplicates).
 *
 * @param {object} msg
 * @param {string|null} msg.leadId
 * @param {'in'|'out'} msg.direcao
 * @param {string|null} msg.wamid
 * @param {string} [msg.tipo='text']
 * @param {string|null} [msg.corpo]
 * @param {object|null} [msg.raw]
 * @returns {Promise<{stored: boolean}>}
 */
async function storeMessage({ leadId = null, direcao, wamid = null, tipo = 'text', corpo = null, raw = null }) {
  try {
    const row = { lead_id: leadId, direcao, wamid, tipo, corpo, raw };
    // Upsert on wamid so a re-delivered webhook no-ops instead of erroring on the
    // UNIQUE constraint. Rows with a null wamid (rare) always insert.
    const query = wamid
      ? supabaseAdmin.from('prospect_messages').upsert(row, { onConflict: 'wamid', ignoreDuplicates: true })
      : supabaseAdmin.from('prospect_messages').insert(row);
    const { error } = await query;
    if (error) {
      logger.error('storeMessage failed:', error.message);
      return { stored: false };
    }
    return { stored: true };
  } catch (err) {
    logger.error('storeMessage exception:', err.message);
    return { stored: false };
  }
}

/**
 * Load the last `limit` messages for a lead in chronological order — the history
 * the brain assembles into the conversation.
 * @param {string} leadId
 * @param {number} [limit=40]
 * @returns {Promise<Array<{direcao:string, corpo:string|null, tipo:string|null}>>}
 */
async function loadHistory(leadId, limit = 40) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('direcao, corpo, tipo, enviada_em')
      .eq('lead_id', leadId)
      .order('enviada_em', { ascending: false })
      .limit(limit);
    if (error) {
      logger.error('loadHistory failed:', error.message);
      return [];
    }
    // fetched newest-first for the LIMIT; return chronological (oldest-first)
    return Array.isArray(data) ? data.slice().reverse() : [];
  } catch (err) {
    logger.error('loadHistory exception:', err.message);
    return [];
  }
}

/**
 * Patch a lead row. The optout-terminal DB trigger still guards prospect_state,
 * so a buggy caller cannot resurrect an opted-out lead.
 * @param {string} leadId
 * @param {object} fields
 */
async function patchLead(leadId, fields) {
  try {
    const { error } = await supabaseAdmin.from('prospect_leads').update(fields).eq('id', leadId);
    if (error) {
      logger.error('patchLead failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logger.error('patchLead exception:', err.message);
    return { ok: false };
  }
}

/**
 * Record an opt-out: add to the suppression list (idempotent) and force the
 * lead's state to optout (terminal). LGPD.
 * @param {{phone:string, leadId?:string|null, reason?:string}} args
 */
async function recordOptout({ phone, leadId = null, reason = 'lead_request' }) {
  try {
    const e164 = toE164(phone) || phone;
    await supabaseAdmin
      .from('prospect_optout')
      .upsert({ phone: e164, lead_id: leadId, reason }, { onConflict: 'phone', ignoreDuplicates: true });
    if (leadId) {
      await supabaseAdmin
        .from('prospect_leads')
        .update({ prospect_state: 'optout', status: 'descartado' })
        .eq('id', leadId);
    }
    return { ok: true };
  } catch (err) {
    logger.error('recordOptout exception:', err.message);
    return { ok: false };
  }
}

module.exports = {
  isOptedOut,
  findLeadByPhone,
  storeMessage,
  loadHistory,
  patchLead,
  recordOptout,
  phoneMatchCandidates,
};
