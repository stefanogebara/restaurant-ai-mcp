'use strict';

/**
 * Cron: prospect-nudge — conversational follow-up when a lead goes quiet.
 *
 * ~23h after a lead's last message (when the agent spoke last and got silence),
 * the agent writes ONE short, natural line to pick the conversation back up —
 * no template, no tools, once per silence period, only inside WhatsApp's 24h
 * free-text window. Cooled conversations are the biggest recoverable conversion
 * pool; today they died silently.
 *
 * Schedule (vercel.json): hourly during BR business hours (Mon-Fri). Eligibility
 * is decided per lead by elegivelParaNudge (23h silence + last-is-ours + 24h
 * window + once per silence). Bounded batch; leftovers caught next tick.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const { getProspectingPhoneNumberId } = require('../_lib/prospecting/routing');
const { selectNudgeStates, loadHistory, loadLastInbound } = require('../_lib/prospecting/prospect-store');
const { elegivelParaNudge } = require('../_lib/prospecting/prospect-nudge');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
const { onlyDigits } = require('../_lib/prospecting/phone');

const logger = createSecureLogger('CronProspectNudge');

const MAX_NUDGES_PER_RUN = 10;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!(await isCronEnabled('prospect-nudge'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }
  // Nudges are agent-initiated sends — the graduated dispatch breaker
  // (number-health circuit) silences them along with cold dispatch.
  if (!(await isCronEnabled('prospecting-dispatch'))) {
    return res.status(200).json({ success: true, skipped: 'dispatch_breaker' });
  }
  // Zero-cost until prospecting is provisioned and live.
  if (!getProspectingPhoneNumberId() || process.env.PROSPECTING_DRY_RUN !== 'false') {
    return res.status(200).json({ success: true, skipped: 'prospecting_not_live' });
  }

  const nowMs = Date.now();
  let nudged = 0; let checked = 0; let errors = 0;
  try {
    const candidates = await selectNudgeStates(50);
    for (const lead of candidates) {
      if (nudged >= MAX_NUDGES_PER_RUN) break;
      checked++;
      try {
        // Fine-grained eligibility needs message-level facts (2 cheap queries).
        const [lastMsgArr, lastIn] = await Promise.all([
          loadHistory(lead.id, 1),
          loadLastInbound(lead.id),
        ]);
        const gate = elegivelParaNudge({
          lastMsg: lastMsgArr[0] || null,
          lastInboundAtMs: lastIn?.enviada_em ? new Date(lastIn.enviada_em).getTime() : null,
          nudgeEmMs: lead.nudge_em ? new Date(lead.nudge_em).getTime() : null,
          nowMs,
        });
        if (!gate.eligible) continue;

        const from = onlyDigits(lead.whatsapp_phone);
        const result = await respondToProspect({
          lead, from, text: '', nowMs, skipPacing: true, mode: 'nudge',
        });
        if (result.action === 'responder' && result.sent) nudged++;
      } catch (err) {
        errors++;
        logger.error(`nudge lead=${lead.id} failed:`, err.message);
      }
    }
    await logCronRun('prospect-nudge', { checked, nudged, errors });
    return res.status(200).json({ success: true, checked, nudged, errors });
  } catch (err) {
    logger.error('nudge fatal:', err.message);
    await logCronRun('prospect-nudge', { checked, nudged, errors: errors + 1 });
    return res.status(500).json({ success: false, error: 'Nudge failed' });
  }
};
