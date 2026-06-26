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

module.exports = { isOptedOut, findLeadByPhone, storeMessage, phoneMatchCandidates };
