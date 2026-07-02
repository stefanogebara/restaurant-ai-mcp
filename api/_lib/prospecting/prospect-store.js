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
      .select('direcao, corpo, tipo, enviada_em, wamid')
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

/**
 * Upsert discovered leads. Conflict on google_place_id DOES NOTHING — re-running
 * discovery must never clobber a lead that's already mid-conversation. Returns
 * the count of NEWLY inserted rows.
 * @param {object[]} rows
 * @returns {Promise<{inserted:number}>}
 */
async function upsertDiscoveredLeads(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      logger.error('upsertDiscoveredLeads failed:', error.message);
      return { inserted: 0 };
    }
    return { inserted: Array.isArray(data) ? data.length : 0 };
  } catch (err) {
    logger.error('upsertDiscoveredLeads exception:', err.message);
    return { inserted: 0 };
  }
}

/**
 * Leads ready for a cold intro: never contacted (whatsapp_sent_at null), in the
 * initial state, with a sendable WhatsApp number.
 * @param {number} [limit=20]
 */
async function selectIntroCandidates(limit = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, owner_name, whatsapp_phone, whatsapp_status')
      .eq('prospect_state', 'aguardando')
      .is('whatsapp_sent_at', null)
      .not('whatsapp_phone', 'is', null)
      .in('whatsapp_status', ['pending', 'found'])
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectIntroCandidates failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectIntroCandidates exception:', err.message);
    return [];
  }
}

/**
 * Atomically claim a lead for an intro send: set whatsapp_sent_at only if it's
 * still null. Returns true if THIS caller claimed it (prevents double-send across
 * concurrent dispatch runs).
 * @param {string} leadId
 */
async function claimIntro(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .update({ whatsapp_sent_at: new Date().toISOString(), whatsapp_send_status: 'queued' })
      .eq('id', leadId)
      .is('whatsapp_sent_at', null)
      .select('id');
    if (error) {
      logger.error('claimIntro failed:', error.message);
      return false;
    }
    return Array.isArray(data) && data.length === 1;
  } catch (err) {
    logger.error('claimIntro exception:', err.message);
    return false;
  }
}

/** Record the outcome of an intro send on the lead. */
async function markIntro(leadId, { status, wamid }) {
  const fields = { whatsapp_send_status: status };
  if (wamid) fields.whatsapp_msg_id = wamid;
  // A failed send releases the claim so a later run can retry.
  if (status === 'failed') fields.whatsapp_sent_at = null;
  return patchLead(leadId, fields);
}

/**
 * Leads whose business-hours-deferred reply is now due (reply_apos <= now) and
 * still in an active state — the flush cron resumes these.
 * @param {string} nowIso
 * @param {number} [limit=50]
 */
async function selectDueFlush(nowIso, limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('reply_apos', 'is', null)
      .lte('reply_apos', nowIso)
      .in('prospect_state', ['aguardando', 'conversando', 'agendando'])
      .order('reply_apos', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectDueFlush failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectDueFlush exception:', err.message);
    return [];
  }
}

/** Most recent inbound message body for a lead (for the flush cron to re-run). */
async function loadLastInbound(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('corpo, tipo, enviada_em')
      .eq('lead_id', leadId)
      .eq('direcao', 'in')
      .order('enviada_em', { ascending: false })
      .limit(1);
    if (error) {
      logger.error('loadLastInbound failed:', error.message);
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (err) {
    logger.error('loadLastInbound exception:', err.message);
    return null;
  }
}

/**
 * Burst-coalescing fingerprint: changes whenever the lead sends another message.
 * `${count}|${latest enviada_em}` over direcao='in' rows — the debounce loop in
 * the responder polls this until it stops changing ("lead went quiet").
 * @param {string} leadId
 * @returns {Promise<string|null>} null on error (caller degrades open)
 */
async function inboundFingerprint(leadId) {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('prospect_messages')
      .select('enviada_em', { count: 'exact' })
      .eq('lead_id', leadId)
      .eq('direcao', 'in')
      .order('enviada_em', { ascending: false })
      .limit(1);
    if (error) {
      logger.error('inboundFingerprint failed:', error.message);
      return null;
    }
    const latest = Array.isArray(data) && data.length ? data[0].enviada_em : '';
    return `${count ?? 0}|${latest}`;
  } catch (err) {
    logger.error('inboundFingerprint exception:', err.message);
    return null;
  }
}

/**
 * Atomic per-inbound claim: "this wamid is being answered". UPDATE ... WHERE
 * last_in_wamid <> wamid returns a row only for the first claimer — a flush-cron
 * overlap, webhook redelivery or manual re-run for the SAME inbound loses the
 * claim and skips. Degrades OPEN (returns true) on infra errors or exotic wamids
 * so a Redis/DB hiccup never mutes the agent (worst case: a rare double reply).
 * @param {string} leadId
 * @param {string} wamid
 * @returns {Promise<boolean>} true when this caller owns the reply
 */
async function claimInbound(leadId, wamid) {
  if (!leadId || !wamid) return true;
  // PostgREST .or() interpolation: commas/parens would break the filter syntax.
  // Meta wamids are base64-ish and never contain them, but guard anyway.
  if (/[(),]/.test(wamid)) return true;
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .update({ last_in_wamid: wamid })
      .eq('id', leadId)
      .or(`last_in_wamid.is.null,last_in_wamid.neq.${wamid}`)
      .select('id');
    if (error) {
      logger.error('claimInbound failed:', error.message);
      return true;
    }
    return Array.isArray(data) && data.length === 1;
  } catch (err) {
    logger.error('claimInbound exception:', err.message);
    return true;
  }
}

/**
 * Nudge candidates (coarse pass): active-conversation leads with no pending
 * deferral. Fine-grained eligibility (23h silence, last message is the agent's,
 * once per silence period, 24h free-text window) is decided per-lead by the
 * cron via elegivelParaNudge — message-level facts don't fit one PostgREST query.
 * @param {number} [limit=50]
 */
async function selectNudgeStates(limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .in('prospect_state', ['conversando', 'agendando'])
      .is('reply_apos', null)
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectNudgeStates failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectNudgeStates exception:', err.message);
    return [];
  }
}

/**
 * Timeline event (F6): a 'sys' row rendered inline in the transcript — pause,
 * takeover, booking, snooze, auto-pause… The transcript doubles as audit log.
 * The responder filters sys rows out of the LLM history.
 */
async function recordEvent(leadId, texto, meta = null) {
  if (!leadId || !texto) return { stored: false };
  return storeMessage({ leadId, direcao: 'sys', tipo: 'evento', corpo: texto, raw: meta });
}

/** Private operator note (F6) — never sent to WhatsApp, never seen by the LLM. */
async function recordNote(leadId, texto, operator) {
  if (!leadId || !texto) return { stored: false };
  return storeMessage({ leadId, direcao: 'sys', tipo: 'nota', corpo: texto, raw: { operator } });
}

/** Stamp the AI intent label (F1) on the inbound message + denormalize on the lead. */
async function updateIntent(leadId, wamid, intent) {
  try {
    if (wamid && intent) {
      await supabaseAdmin.from('prospect_messages').update({ intent }).eq('wamid', wamid);
    }
    if (leadId && intent) {
      await supabaseAdmin.from('prospect_leads')
        .update({ last_intent: intent, last_intent_at: new Date().toISOString() })
        .eq('id', leadId);
    }
    return { ok: true };
  } catch (err) {
    logger.error('updateIntent exception:', err.message);
    return { ok: false };
  }
}

/** Registered Meta-approved template variants (F2), optionally for one touch. */
async function listTemplates(touchNumber = null) {
  try {
    let q = supabaseAdmin.from('prospect_templates').select('*')
      .order('touch_number', { ascending: true }).order('variant_label', { ascending: true });
    if (touchNumber != null) q = q.eq('touch_number', touchNumber);
    const { data, error } = await q;
    if (error) { logger.error('listTemplates failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('listTemplates exception:', err.message);
    return [];
  }
}

async function upsertTemplate(row) {
  try {
    const clean = {
      variant_label: String(row.variant_label || '').trim().toUpperCase(),
      touch_number: Math.min(Math.max(parseInt(row.touch_number, 10) || 1, 1), 3),
      meta_template_name: String(row.meta_template_name || '').trim(),
      template_lang: String(row.template_lang || 'pt_BR').trim(),
      body_preview: row.body_preview ? String(row.body_preview) : null,
      active: row.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (!clean.variant_label || !clean.meta_template_name) return { ok: false, error: 'variant_label and meta_template_name required' };
    if (row.id) {
      const { error } = await supabaseAdmin.from('prospect_templates').update(clean).eq('id', row.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabaseAdmin.from('prospect_templates')
        .upsert({ ...clean }, { onConflict: 'touch_number,variant_label' });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Canned responses (F8). */
async function listCanned() {
  try {
    const { data, error } = await supabaseAdmin.from('prospect_canned')
      .select('*').order('short_code', { ascending: true });
    if (error) { logger.error('listCanned failed:', error.message); return []; }
    return data || [];
  } catch { return []; }
}

async function upsertCanned({ id, short_code, body }) {
  try {
    const clean = {
      short_code: String(short_code || '').trim().toLowerCase().replace(/\s+/g, '-'),
      body: String(body || '').trim(),
      updated_at: new Date().toISOString(),
    };
    if (!clean.short_code || !clean.body) return { ok: false, error: 'short_code and body required' };
    const q = id
      ? supabaseAdmin.from('prospect_canned').update(clean).eq('id', id)
      : supabaseAdmin.from('prospect_canned').upsert(clean, { onConflict: 'short_code' });
    const { error } = await q;
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function deleteCanned(id) {
  try {
    const { error } = await supabaseAdmin.from('prospect_canned').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Multi-touch (F4): due follow-up candidates — intro delivered, NEVER replied
 * (last_in_at null), still in the cold bucket, under 3 touches, not suppressed.
 */
async function selectDueTouches(nowIso, limit = 10) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('next_touch_at', 'is', null)
      .lte('next_touch_at', nowIso)
      .is('last_in_at', null)
      .lt('touch_count', 3)
      .in('prospect_state', ['aguardando'])
      .order('next_touch_at', { ascending: true })
      .limit(limit);
    if (error) { logger.error('selectDueTouches failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectDueTouches exception:', err.message);
    return [];
  }
}

/**
 * Cockpit: list leads for the internal admin view (newest activity first).
 * Optional state filter. Returns the columns the cockpit list + status buckets need.
 * @param {{limit?: number, state?: string|null}} [opts]
 */
async function listProspectLeads({ limit = 100, state = null } = {}) {
  try {
    let q = supabaseAdmin
      .from('prospect_leads')
      .select('id, name, sector, city, whatsapp_phone, whatsapp_send_status, prospect_state, lead_score, owner_name, reuniao_at, reuniao_link, handoff_motivo, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (state) q = q.eq('prospect_state', state);
    const { data, error } = await q;
    if (error) { logger.error('listProspectLeads failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('listProspectLeads exception:', err.message);
    return [];
  }
}

/**
 * Cockpit: a lead's full row + chronological transcript (last `limit` messages).
 * @param {string} leadId
 * @param {number} [limit=200]
 * @returns {Promise<{lead: object, messages: Array}|null>}
 */
async function getProspectLeadWithMessages(leadId, limit = 200) {
  try {
    const { data: lead, error } = await supabaseAdmin
      .from('prospect_leads').select('*').eq('id', leadId).single();
    if (error || !lead) { logger.error('getProspectLeadWithMessages: lead not found', error && error.message); return null; }
    const { data: msgs } = await supabaseAdmin
      .from('prospect_messages')
      .select('direcao, corpo, tipo, enviada_em, status, status_at, error_detail, intent')
      .eq('lead_id', leadId)
      .order('enviada_em', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    return { lead, messages: Array.isArray(msgs) ? msgs.slice().reverse() : [] };
  } catch (err) {
    logger.error('getProspectLeadWithMessages exception:', err.message);
    return null;
  }
}

/** Outcomes captured at a terminal state that the daily cron hasn't scored yet. */
async function selectUnscoredOutcomes(limit = 25) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_outcomes')
      .select('id, lead_id, outcome')
      .is('quality_score', null)
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) { logger.error('selectUnscoredOutcomes failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectUnscoredOutcomes exception:', err.message);
    return [];
  }
}

/** Write the LLM quality_score (1–5) + theme_tags onto an outcome row. */
async function updateOutcomeScore(id, { quality_score, theme_tags }) {
  try {
    const { error } = await supabaseAdmin
      .from('prospect_outcomes')
      .update({ quality_score, theme_tags: (theme_tags && theme_tags.length) ? theme_tags : null })
      .eq('id', id);
    if (error) { logger.error('updateOutcomeScore failed:', error.message); return { ok: false }; }
    return { ok: true };
  } catch (err) {
    logger.error('updateOutcomeScore exception:', err.message);
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
  upsertDiscoveredLeads,
  selectIntroCandidates,
  claimIntro,
  markIntro,
  selectDueFlush,
  loadLastInbound,
  inboundFingerprint,
  claimInbound,
  selectNudgeStates,
  recordEvent,
  recordNote,
  updateIntent,
  listTemplates,
  upsertTemplate,
  listCanned,
  upsertCanned,
  deleteCanned,
  selectDueTouches,
  listProspectLeads,
  getProspectLeadWithMessages,
  selectUnscoredOutcomes,
  updateOutcomeScore,
};
