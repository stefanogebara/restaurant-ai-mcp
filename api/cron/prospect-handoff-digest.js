'use strict';

/**
 * Cron: prospect-handoff-digest — the founder's daily "close these" list.
 *
 * When Olímpia hands a lead to the founder (someone asked for a human / the
 * founder's number), the lead lands in 'handoff' and she goes silent. Nothing
 * told the founder WHICH leads were waiting, so warm leads sat un-chased for
 * weeks (the closing bottleneck, 2026-07). This sends one e-mail a day listing
 * every waiting lead (handoff + agendando), each with a click-to-close wa.me
 * link that opens WhatsApp with a founder-voice pitch PRE-FILLED — tap, send,
 * done. The reclaim sweep (flush cron) is the safety net for whatever the
 * founder still doesn't close; this digest is the first move.
 *
 * Schedule (vercel.json): daily ~08:30 BRT so the founder starts the day with
 * the call-list. Auth: CRON_SECRET. Kill switch: 'prospect-handoff-digest'.
 * Reliable channel by design — e-mail has no 24h WhatsApp window to fight.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const { selectFounderHandoffQueue, isOptedOut } = require('../_lib/prospecting/prospect-store');
const { isFounderNumber } = require('../_lib/prospecting/prospect-agent');
const { buildFounderDigestEmail } = require('../_lib/prospecting/founder-digest');
const { closeUrlFor } = require('../_lib/prospecting/prospect-close-token');
const { HANDOFF_RECLAIM_MS } = require('../_lib/prospecting/prospect-state');
const { sendProspectDigestEmail } = require('../_lib/email');

const logger = createSecureLogger('CronHandoffDigest');

// Founder recipient. Env-first, with the founder's own address as the default
// (mirrors PROSPECTING_FOUNDER_WHATSAPP's hardcoded default) so it works out of
// the box; override per environment via PROSPECTING_FOUNDER_EMAIL.
const FOUNDER_EMAIL = process.env.PROSPECTING_FOUNDER_EMAIL || 'stefanogebara@gmail.com';
// Drop leads with no activity in this many days from the digest — beyond this
// they're effectively dead and the reclaim sweep has already taken them.
const MAX_AGE_DAYS = Number(process.env.PROSPECTING_DIGEST_MAX_AGE_DAYS) || 45;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!(await isCronEnabled('prospect-handoff-digest'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const nowMs = Date.now();
    const raw = await selectFounderHandoffQueue({ maxAgeDays: MAX_AGE_DAYS, limit: 100 });
    // Keep the founder's OWN test lead ("Restaurante do Stefano") out of the list.
    const notFounder = raw.filter((l) => !isFounderNumber(l.whatsapp_phone));
    // Defensive opt-out filter: an opt-out typed while a lead was in 'handoff' is
    // swallowed by the responder's silent-gate (recorded only if the reclaim/flush
    // re-runs the responder), so a suppressed number can still sit in this queue.
    // Never hand the founder a wa.me link to someone who asked to stop (LGPD).
    const optChecks = await Promise.all(notFounder.map((l) => isOptedOut(l.whatsapp_phone)));
    const leads = notFounder.filter((_, i) => !optChecks[i]);

    if (leads.length === 0) {
      await logCronRun('prospect-handoff-digest', { candidates: raw.length, sent: 0, empty: true });
      return res.status(200).json({ success: true, count: 0, sent: false });
    }

    const reclaimDays = Math.round(HANDOFF_RECLAIM_MS / (24 * 60 * 60 * 1000));
    const { subject, html, text, count } = buildFounderDigestEmail({
      leads,
      nowMs,
      reclaimDays,
      // One-tap "já fechei" per lead: a signed link (no session in an inbox) that
      // marks the lead 'ganho' so the reclaim sweep never re-warms a closed deal.
      closeUrlFor: (lead) => closeUrlFor(lead.id, { nowMs }),
    });

    let sent = false;
    try {
      sent = await sendProspectDigestEmail({ to: FOUNDER_EMAIL, subject, html, text });
    } catch (err) {
      logger.error('digest send failed:', err.message);
      await logCronRun('prospect-handoff-digest', { candidates: leads.length, sent: 0, error: err.message });
      return res.status(502).json({ success: false, error: 'digest send failed', count });
    }

    await logCronRun('prospect-handoff-digest', { candidates: leads.length, sent: sent ? 1 : 0 });
    logger.info(`handoff digest: ${count} leads, sent=${sent}`);
    return res.status(200).json({ success: true, count, sent });
  } catch (err) {
    logger.error('handoff digest fatal:', err.message);
    await logCronRun('prospect-handoff-digest', { sent: 0, error: err.message });
    return res.status(500).json({ success: false, error: 'Digest failed' });
  }
};
