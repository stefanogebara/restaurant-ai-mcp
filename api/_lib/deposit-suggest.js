/**
 * Phase AA — No-show risk → deposit auto-suggest.
 *
 * Pure function that decides whether the host should be prompted to
 * request a deposit for an incoming reservation. The signal is
 * surface-only — the host always decides whether to actually send the
 * payment link.
 *
 * Logic (all must hold):
 *   1. Restaurant has opted into deposits (deposit_config.enabled === true)
 *   2. Reservation is risky:
 *        - ml_risk_level is 'high' or 'very-high', OR
 *        - ml_risk_score >= DEFAULT_THRESHOLD (51) when level is missing
 *   3. No deposit is already in flight (deposit_payment_intent_id is null)
 *
 * Tunable via env:
 *   DEPOSIT_SUGGEST_THRESHOLD — numeric override for #2. Default 51.
 *
 * Returns the reservation enriched with two fields:
 *   deposit_suggested: boolean
 *   deposit_suggested_reason: string|null   — human-readable, for UI tooltips
 *                                              and audit logs
 */

const DEFAULT_THRESHOLD = 51;

function isHighRiskLevel(level) {
  return level === 'high' || level === 'very-high';
}

function getThreshold() {
  const env = Number(process.env.DEPOSIT_SUGGEST_THRESHOLD);
  return Number.isFinite(env) && env >= 0 && env <= 100 ? env : DEFAULT_THRESHOLD;
}

/**
 * Pure decoration. Mutates nothing.
 *
 * @param {object} reservation     — the shape returned by getUpcomingReservations
 * @param {object} depositConfig   — restaurant.restaurant_config.deposit_config (JSONB)
 * @returns {object} reservation + deposit_suggested + deposit_suggested_reason
 */
function decorateWithDepositSuggestion(reservation, depositConfig) {
  const r = reservation || {};

  // Gate 1: restaurant must accept deposits.
  if (!depositConfig?.enabled) {
    return { ...r, deposit_suggested: false, deposit_suggested_reason: null };
  }

  // Gate 3: don't suggest if a deposit is already collected or pending.
  if (r.deposit_payment_intent_id) {
    return { ...r, deposit_suggested: false, deposit_suggested_reason: null };
  }

  // Gate 2: risk threshold.
  const level = r.ml_risk_level || null;
  const score = typeof r.ml_risk_score === 'number' ? r.ml_risk_score : null;
  const threshold = getThreshold();

  let suggested = false;
  let reason = null;

  if (isHighRiskLevel(level)) {
    suggested = true;
    reason = level === 'very-high'
      ? 'very_high_no_show_risk'
      : 'high_no_show_risk';
  } else if (score !== null && score >= threshold) {
    suggested = true;
    reason = `risk_score_${Math.round(score)}_above_threshold_${threshold}`;
  }

  return {
    ...r,
    deposit_suggested: suggested,
    deposit_suggested_reason: reason,
  };
}

module.exports = {
  decorateWithDepositSuggestion,
  // Exported for tests + tuning calls.
  DEFAULT_THRESHOLD,
  isHighRiskLevel,
};
