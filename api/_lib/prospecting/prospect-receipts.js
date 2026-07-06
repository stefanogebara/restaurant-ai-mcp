'use strict';

/**
 * Per-message delivery receipts + number-health circuit breaker (Phase 8, F3+F5).
 *
 * Meta status webhooks (sent → delivered → read, or failed) update the matching
 * prospect_messages row by wamid — the substrate for transcript tick marks, the
 * per-variant read-rate funnel, and the failed-rate breaker. Statuses arrive out
 * of order, so advancement is rank-monotonic ('failed' only overrides a message
 * that never reached delivered).
 *
 * Circuit breaker (community consensus for BR WhatsApp cold outreach):
 *  - failed-send rate > 5% over the trailing 24h (min 5 sends) → pause DISPATCH
 *    (cron_config 'prospecting-dispatch'); the responder keeps answering inbound
 *    (engagement is the number's best defense).
 *  - quality_update YELLOW → pause dispatch; RED → also pause the agent
 *    ('prospecting-agent'); operator takeover always stays available.
 * Every automatic action writes a prospect_number_events row (audit + console).
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('ProspectReceipts');

const STATUS_RANK = { failed: 0, sent: 1, delivered: 2, read: 3 };
const FAILED_RATE_LIMIT = 0.05;
const FAILED_RATE_MIN_SENDS = 5;

// Failure codes that say NOTHING about our number's reputation — expected
// attrition on any cold list. Counting them tripped the breaker at 9.1% on a
// day the quality rating was GREEN (2026-07-04):
//   131026 recipient not on WhatsApp / can't receive marketing messages
//   131049 Meta per-user marketing frequency cap ("healthy ecosystem")
//   130472 recipient is in a Meta marketing holdout experiment
// Everything else (spam rate 131048, policy blocks, auth) still counts.
//   131047 re-engagement message: OUR reply hit a closed 24h window — a
//   timing bug on our side, never a spam signal; backing off dispatch cannot
//   fix it, so it must not trip the breaker (2026-07-06 incident: 24×).
const BENIGN_FAIL_CODES = ['131026', '131049', '130472', '131047'];

/** PURE: does this error_detail describe benign (non-reputational) attrition? */
function isBenignFailure(errorDetail) {
  const code = String(errorDetail || '').trim().split(/\s+/)[0];
  return BENIGN_FAIL_CODES.includes(code);
}

/** Rank-monotonic advancement; failed only lands before delivery proof. */
function shouldAdvanceStatus(current, next) {
  if (!(next in STATUS_RANK)) return false;
  if (!current) return true;
  if (next === 'failed') return STATUS_RANK[current] <= STATUS_RANK.sent;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

async function setDispatchEnabled(enabled, detail) {
  await supabaseAdmin.from('cron_config').upsert({
    job_name: 'prospecting-dispatch',
    enabled,
    notes: detail,
    updated_at: new Date().toISOString(),
    updated_by: 'circuit-breaker',
  }, { onConflict: 'job_name' });
}

async function recordNumberEvent(event) {
  await supabaseAdmin.from('prospect_number_events').insert(event);
}

/**
 * Trailing-24h failure profile over outbound messages with a known status.
 * `rate` counts ONLY reputational failures (what the breaker watches);
 * `rateAll` includes benign attrition (what the console displays).
 */
async function failedRate24h() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [total, failedRows] = await Promise.all([
    supabaseAdmin.from('prospect_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direcao', 'out')
      .gte('enviada_em', cutoff)
      .not('status', 'is', null),
    supabaseAdmin.from('prospect_messages')
      .select('error_detail')
      .eq('direcao', 'out').eq('status', 'failed').gte('enviada_em', cutoff)
      .limit(500),
  ]);
  const t = total.count ?? 0;
  const rows = failedRows.data || [];
  const f = rows.length;
  const fRep = rows.filter((r) => !isBenignFailure(r.error_detail)).length;
  return {
    total: t, failed: f, failedReputational: fRep,
    rate: t > 0 ? fRep / t : 0,
    rateAll: t > 0 ? f / t : 0,
  };
}

/**
 * Apply a Meta `statuses[]` webhook value for the prospecting number.
 * Best-effort: receipt loss must never break webhook processing.
 * @param {object} value - entry[0].changes[0].value with value.statuses
 */
async function applyStatusEvents(value) {
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const s of statuses) {
    try {
      const wamid = s?.id;
      const next = s?.status;
      if (!wamid || !(next in STATUS_RANK)) continue;

      const { data } = await supabaseAdmin.from('prospect_messages')
        .select('id, status, lead_id').eq('wamid', wamid).limit(1);
      const row = Array.isArray(data) && data[0];
      if (!row || !shouldAdvanceStatus(row.status, next)) continue;

      const patch = { status: next, status_at: new Date().toISOString() };
      if (next === 'failed') {
        const err = Array.isArray(s.errors) && s.errors[0];
        patch.error_detail = err ? `${err.code || ''} ${err.title || err.message || ''}`.trim() : 'unknown';
      }
      await supabaseAdmin.from('prospect_messages').update(patch).eq('id', row.id);

      if (next === 'failed') {
        // "Not on WhatsApp" (131026): the number was a candidate (often a
        // landline) that isn't reachable — mark the lead so it exits the
        // dispatch pool. Benign for the number; self-cleaning for the funnel.
        if (row.lead_id && /\b131026\b/.test(String(patch.error_detail || ''))) {
          await supabaseAdmin.from('prospect_leads')
            .update({ whatsapp_status: 'missing' }).eq('id', row.lead_id);
          logger.info(`lead ${row.lead_id} marked whatsapp_status=missing (131026 not on WhatsApp)`);
        }
        await checkFailedRateBreaker();
      }
    } catch (err) {
      logger.warn('receipt apply failed (non-fatal):', err.message);
    }
  }
}

/** Trip the dispatch breaker when the trailing failed rate crosses the line. */
async function checkFailedRateBreaker() {
  try {
    const { total, failedReputational, rate } = await failedRate24h();
    if (total < FAILED_RATE_MIN_SENDS || rate <= FAILED_RATE_LIMIT) return;

    // Idempotent: only trip (and log) when currently enabled.
    const { data } = await supabaseAdmin.from('cron_config')
      .select('enabled').eq('job_name', 'prospecting-dispatch').maybeSingle();
    if (data && data.enabled === false) return;

    const detail = `failed-rate breaker: ${failedReputational}/${total} falhas reputacionais (${(rate * 100).toFixed(1)}%) nas últimas 24h`;
    await setDispatchEnabled(false, detail);
    await recordNumberEvent({ event_type: 'failed_rate_breaker', detail });
    logger.error(`CIRCUIT BREAKER tripped — ${detail}`);
  } catch (err) {
    logger.warn('breaker check failed (non-fatal):', err.message);
  }
}

/**
 * Apply a `phone_number_quality_update` webhook change. Only acts when the
 * event's display number matches PROSPECTING_DISPLAY_NUMBER (the reservations
 * number shares the WABA — its quality must not trip the prospecting breaker);
 * unmatched events are recorded for visibility but take no action.
 * @param {object} changeValue - changes[0].value for the quality update
 */
async function applyQualityUpdate(changeValue) {
  try {
    const display = String(changeValue?.display_phone_number || '').replace(/\D/g, '');
    const expected = String(process.env.PROSPECTING_DISPLAY_NUMBER || '').replace(/\D/g, '');
    const event = String(changeValue?.event || '').toUpperCase();
    // Meta uses FLAGGED (yellow/red path) / UNFLAGGED; some payloads carry
    // current_quality_rating GREEN|YELLOW|RED directly.
    const rating = String(changeValue?.current_quality_rating || (event === 'FLAGGED' ? 'YELLOW' : '')).toUpperCase() || null;
    const matched = expected && display && display.endsWith(expected.slice(-10));

    await recordNumberEvent({
      event_type: 'quality_update',
      rating,
      detail: matched ? `evento ${event}` : `evento ${event} (número não monitorado: ${display || '?'})`,
      payload: changeValue || null,
    });
    if (!matched) return;

    if (rating === 'YELLOW') {
      await setDispatchEnabled(false, 'qualidade AMARELA — disparos pausados automaticamente');
      await recordNumberEvent({ event_type: 'auto_pause', rating, detail: 'disparos pausados (qualidade AMARELA)' });
      logger.error('quality YELLOW — dispatch auto-paused');
    } else if (rating === 'RED') {
      await setDispatchEnabled(false, 'qualidade VERMELHA — disparos pausados automaticamente');
      await supabaseAdmin.from('cron_config').upsert({
        job_name: 'prospecting-agent', enabled: false,
        notes: 'qualidade VERMELHA — agente pausado automaticamente',
        updated_at: new Date().toISOString(), updated_by: 'circuit-breaker',
      }, { onConflict: 'job_name' });
      await recordNumberEvent({ event_type: 'auto_pause', rating, detail: 'disparos + agente pausados (qualidade VERMELHA)' });
      logger.error('quality RED — dispatch AND agent auto-paused');
    } else if (event === 'UNFLAGGED' || rating === 'GREEN') {
      // Recovery is deliberately MANUAL (operator reactivates from the console) —
      // auto-resume after a flag is how numbers die.
      logger.info('quality recovered — awaiting manual reactivation');
    }
  } catch (err) {
    logger.warn('quality update failed (non-fatal):', err.message);
  }
}

/** Latest quality rating + trailing failed rate for the console health card. */
async function numberHealth() {
  const [{ data: events }, rates] = await Promise.all([
    supabaseAdmin.from('prospect_number_events')
      .select('event_type, rating, detail, created_at')
      .order('created_at', { ascending: false }).limit(8),
    failedRate24h(),
  ]);
  const lastQuality = (events || []).find((e) => e.event_type === 'quality_update' && e.rating);
  return {
    rating: lastQuality ? lastQuality.rating : 'GREEN',
    failed_rate_24h: Math.round(rates.rateAll * 1000) / 10,
    failed_24h: rates.failed,
    failed_reputational_24h: rates.failedReputational,
    failed_rate_reputacional_24h: Math.round(rates.rate * 1000) / 10,
    sends_24h: rates.total,
    events: events || [],
  };
}

module.exports = {
  STATUS_RANK,
  shouldAdvanceStatus,
  isBenignFailure,
  applyStatusEvents,
  applyQualityUpdate,
  checkFailedRateBreaker,
  numberHealth,
};
