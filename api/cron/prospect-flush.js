'use strict';

/**
 * Cron: prospect-flush — resume business-hours-deferred replies.
 *
 * When an inbound arrives outside business hours, the responder defers it (sets
 * reply_apos to the next opening) instead of replying at 3am. This cron, running
 * during business hours, finds leads whose reply_apos is now due, clears it, and
 * re-runs the responder against their latest inbound.
 *
 * Schedule (vercel.json): every 15 min during BR business hours only (12-22 UTC
 * = 9-19 BRT, Mon-Fri) — drift-sensitive enough to justify the cadence, but
 * cost-bounded to the window that matters. No-ops instantly when unconfigured.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const { getProspectingPhoneNumberId } = require('../_lib/prospecting/routing');
const { selectDueFlush, loadLastInbound, patchLead } = require('../_lib/prospecting/prospect-store');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
const { onlyDigits } = require('../_lib/prospecting/phone');

const logger = createSecureLogger('CronProspectFlush');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!(await isCronEnabled('prospect-flush'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }
  // Zero-cost until prospecting is provisioned.
  if (!getProspectingPhoneNumberId() && process.env.PROSPECTING_DRY_RUN !== 'false') {
    // Still allow flush in dry-run testing when explicitly enabled; otherwise skip.
    if (process.env.PROSPECTING_IGNORE_HOURS !== 'true') {
      return res.status(200).json({ success: true, skipped: 'prospecting_not_configured' });
    }
  }

  const nowIso = new Date().toISOString();
  let resumed = 0; let errors = 0;
  try {
    // Bounded batch — each resume runs the LLM; skipPacing keeps each ~5s so the
    // batch fits the 120s budget. Leftovers are caught on the next */15 tick.
    const due = await selectDueFlush(nowIso, 8);
    for (const lead of due) {
      try {
        // Clear the deferral first so a slow run can't double-process it.
        await patchLead(lead.id, { reply_apos: null });
        const last = await loadLastInbound(lead.id);
        if (!last || !last.corpo) continue;
        const from = onlyDigits(lead.whatsapp_phone);
        await respondToProspect({ lead: { ...lead, reply_apos: null }, from, text: last.corpo, skipPacing: true });
        resumed++;
      } catch (err) {
        errors++;
        logger.error(`flush lead=${lead.id} failed:`, err.message);
      }
    }
    // Multi-touch follow-ups (F4): bump D+3 / breakup D+8 for never-repliers.
    // Piggybacks this cron (already scheduled in business hours) — no new
    // invocations. Gated internally by dry-run + both kill switches + the
    // warm-up daily cap shared with intros.
    let followups = null;
    try {
      const { dispatchFollowups } = require('../_lib/prospecting/sequencer');
      followups = await dispatchFollowups({ limit: 10 });
    } catch (err) {
      logger.error('followups failed:', err.message);
    }

    // Discovery-chain watchdog: the mass-discovery worker self-chains, but a
    // single dead link (cold-start kill, network blip) strands the job in
    // 'running' forever. Any running job untouched for >5 min gets re-kicked —
    // the atomic cursor makes resumes free.
    let rekicked = 0;
    try {
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: stale } = await supabaseAdmin
        .from('prospect_discovery_jobs')
        .select('id')
        .eq('status', 'running')
        .lt('updated_at', staleCutoff)
        .limit(3);
      const base = (process.env.CLIENT_URL || 'https://seatable.one').replace(/\/$/, '');
      for (const job of stale || []) {
        fetch(`${base}/api/prospect-discovery-worker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ job_id: job.id }),
        }).catch((err) => logger.error('watchdog kick failed:', err.message));
        rekicked++;
        logger.info(`discovery watchdog re-kicked stalled job ${job.id}`);
      }
    } catch (err) {
      logger.error('discovery watchdog failed:', err.message);
    }

    await logCronRun('prospect-flush', { resumed, errors, followups_sent: followups ? followups.sent : 0, rekicked });
    return res.status(200).json({ success: true, due: due.length, resumed, errors, followups, rekicked });
  } catch (err) {
    logger.error('flush fatal:', err.message);
    await logCronRun('prospect-flush', { resumed, errors: errors + 1 });
    return res.status(500).json({ success: false, error: 'Flush failed' });
  }
};
