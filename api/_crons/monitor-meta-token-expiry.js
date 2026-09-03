/**
 * Cron Check Meta Token Expiry — Daily WhatsApp alert when the Meta
 * (WhatsApp Cloud API) access token is approaching expiry.
 *
 * Background: Meta System User long-lived access tokens last ~60 days.
 * When they expire, ALL Meta API calls 401 — the WhatsApp Settings page,
 * template_status, phone verification, and the send-WhatsApp messaging
 * flow all silently degrade. We caught this once in production (token
 * expired on 2026-05-09, was noticed ~3 weeks later during an audit).
 *
 * This cron runs daily, calls Graph debug_token with the current
 * WHATSAPP_ACCESS_TOKEN, and only sends a WhatsApp alert to
 * HEALTH_ALERT_PHONE when:
 *   - the token is already expired (days_until_expiry <= 0), OR
 *   - it expires in the next 14 days
 *
 * Schedule: daily at 10 UTC (same window as health-alert).
 *
 * Requires: CRON_SECRET, WHATSAPP_ACCESS_TOKEN, HEALTH_ALERT_PHONE env
 * vars. Token alert only fires if the *other* WhatsApp env vars are also
 * configured (otherwise we'd never be able to send the alert via WhatsApp
 * anyway).
 */

const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { logCronRun } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');
const { isCronEnabled } = require('../_lib/cron-config');

const logger = createSecureLogger('CronCheckMetaTokenExpiry');

// Fire alert when the token has this many days left or fewer.
const ALERT_THRESHOLD_DAYS = 14;

/**
 * Hit Meta's debug_token endpoint with the current access token to
 * extract its expiry. Using the token to debug itself is allowed when
 * the token's app matches the inspected token's app (which it always
 * does here since we're inspecting our own token).
 *
 * Returns either:
 *   { ok: true, isValid, expiresAt, daysUntilExpiry, scopes }
 * or:
 *   { ok: false, error }
 */
async function inspectToken(token) {
  if (!token) return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN env var not set' };
  try {
    // Pass the token via Authorization header rather than the query string —
    // URLs land in HTTP proxy logs, Vercel request logs, and any network tap;
    // headers do not. input_token still goes in the query because it's the
    // token being inspected (not an auth credential), and Graph requires it
    // there. Meta documents Authorization: Bearer as supported on this endpoint.
    const url = `https://graph.facebook.com/v18.0/debug_token?input_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return { ok: false, error: `Graph debug_token HTTP ${res.status}` };
    }
    const body = await res.json();
    if (body.error) {
      return { ok: false, error: `Graph error: ${body.error.message || JSON.stringify(body.error)}` };
    }
    const data = body.data || {};
    const expiresAt = data.expires_at; // unix seconds; 0 means never expires
    const isValid = data.is_valid === true;
    let daysUntilExpiry = Infinity;
    if (expiresAt && expiresAt > 0) {
      daysUntilExpiry = Math.floor((expiresAt * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
    }
    return {
      ok: true,
      isValid,
      expiresAt,
      daysUntilExpiry,
      scopes: data.scopes || [],
      type: data.type || null,
      app: data.application || null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function buildAlertMessage(inspection) {
  const { isValid, daysUntilExpiry, expiresAt, app } = inspection;
  const expiresDate = expiresAt
    ? new Date(expiresAt * 1000).toISOString().slice(0, 10)
    : 'unknown';

  if (!isValid) {
    return [
      `*Meta WhatsApp token EXPIRED*`,
      ``,
      `App: ${app || 'unknown'}`,
      `Expired on: ${expiresDate}`,
      ``,
      `All WhatsApp flows are currently broken (templates, phone verification, message sending).`,
      ``,
      `Rotate ASAP:`,
      `1. business.facebook.com → Business Settings → System Users`,
      `2. Generate new token (whatsapp_business_messaging + whatsapp_business_management scopes)`,
      `3. Update WHATSAPP_ACCESS_TOKEN in Vercel Production/Preview/Development`,
      `4. Push empty commit to trigger fresh build`,
    ].join('\n');
  }

  return [
    `*Meta WhatsApp token expiring soon*`,
    ``,
    `App: ${app || 'unknown'}`,
    `Expires: ${expiresDate}  (${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} left)`,
    ``,
    `Rotate before expiry:`,
    `1. business.facebook.com → Business Settings → System Users`,
    `2. Generate new token (whatsapp_business_messaging + whatsapp_business_management scopes)`,
    `3. Update WHATSAPP_ACCESS_TOKEN in Vercel Production/Preview/Development`,
    `4. Push empty commit to trigger fresh build`,
  ].join('\n');
}

module.exports = async (req, res) => {
  // Auth: CRON_SECRET only (same pattern as health-alert).
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!(await isCronEnabled('check-meta-token-expiry'))) {
    logger.warn('check-meta-token-expiry cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const inspection = await inspectToken(process.env.WHATSAPP_ACCESS_TOKEN);

    // Token inspection itself failed (network/config) — log + return without
    // alerting since we can't tell if the token is good or bad.
    if (!inspection.ok) {
      logger.warn('Could not inspect Meta token', { error: inspection.error });
      await logCronRun('check-meta-token-expiry', { ok: false, error: inspection.error });
      return res.status(200).json({ success: true, skipped: 'inspect_failed', error: inspection.error });
    }

    const { isValid, daysUntilExpiry, expiresAt } = inspection;
    const expired = !isValid || daysUntilExpiry <= 0;
    const expiringSoon = isValid && daysUntilExpiry > 0 && daysUntilExpiry <= ALERT_THRESHOLD_DAYS;
    const shouldAlert = expired || expiringSoon;

    if (!shouldAlert) {
      logger.info('Meta token healthy', { isValid, daysUntilExpiry, expiresAt });
      await logCronRun('check-meta-token-expiry', {
        is_valid: isValid,
        days_until_expiry: daysUntilExpiry,
        alerted: false,
      });
      return res.status(200).json({
        is_valid: isValid,
        days_until_expiry: daysUntilExpiry,
        alerted: false,
      });
    }

    // Send WhatsApp alert.
    const alertPhone = process.env.HEALTH_ALERT_PHONE;
    let sent = false;

    if (alertPhone && isWhatsAppConfigured()) {
      const message = buildAlertMessage(inspection);
      const result = await sendWhatsAppMessage(alertPhone, message);
      sent = result.success;
      if (!result.success) {
        logger.warn('Failed to send Meta-token-expiry WhatsApp alert', { error: result.error });
      }
    } else {
      // If WHATSAPP_ACCESS_TOKEN itself is expired we'll fail to send a
      // WhatsApp alert about it. That's a known catch-22 — log loudly so
      // it shows up in Vercel runtime logs / Sentry.
      logger.error('Meta token expiring/expired but cannot send WhatsApp alert', {
        alertPhone: !!alertPhone,
        whatsappConfigured: isWhatsAppConfigured(),
        daysUntilExpiry,
      });
    }

    logger.warn('Meta token alert fired', { expired, expiringSoon, daysUntilExpiry, whatsapp_sent: sent });
    await logCronRun('check-meta-token-expiry', {
      is_valid: isValid,
      days_until_expiry: daysUntilExpiry,
      alerted: true,
      whatsapp_sent: sent,
    });

    return res.status(200).json({
      is_valid: isValid,
      days_until_expiry: daysUntilExpiry,
      alerted: true,
      whatsapp_sent: sent,
    });
  } catch (err) {
    logger.error('check-meta-token-expiry failed', { error: err.message });
    return res.status(500).json({ error: 'check-meta-token-expiry failed' });
  }
};

// Export internals for tests.
module.exports.inspectToken = inspectToken;
module.exports.buildAlertMessage = buildAlertMessage;
module.exports.ALERT_THRESHOLD_DAYS = ALERT_THRESHOLD_DAYS;
