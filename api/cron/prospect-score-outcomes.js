'use strict';

/**
 * Cron: prospect-score-outcomes — rate finished conversations (Phase 5).
 *
 * Picks terminal-state outcomes that still lack a quality_score, reconstructs the
 * transcript, and asks Haiku for a 1–5 score + theme tags (parseScoreText, anti-
 * garbage). Dashboard INPUT only — never mutates Olímpia's prompt/strategy.
 *
 * Low frequency (daily): a terminal outcome is a rare event and scoring isn't
 * time-sensitive, so this respects the cron cost rule. Bounded per run.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const { selectUnscoredOutcomes, updateOutcomeScore, loadHistory } = require('../_lib/prospecting/prospect-store');
const { transcriptFromHistory, scoreOutcome } = require('../_lib/prospecting/prospect-reflect');

const logger = createSecureLogger('CronProspectScore');
const MAX_PER_RUN = 25;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!(await isCronEnabled('prospect-score-outcomes'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  let scored = 0; let skipped = 0; let errors = 0;
  try {
    const rows = await selectUnscoredOutcomes(MAX_PER_RUN);
    for (const row of rows) {
      try {
        const history = await loadHistory(row.lead_id, 200);
        const transcript = transcriptFromHistory(history);
        const { quality_score, theme_tags } = await scoreOutcome(transcript);
        if (quality_score == null) { skipped++; continue; } // transient/un-scorable → retry next run
        await updateOutcomeScore(row.id, { quality_score, theme_tags });
        scored++;
      } catch (err) {
        errors++;
        logger.error(`score outcome=${row.id} failed:`, err.message);
      }
    }
    await logCronRun('prospect-score-outcomes', { scored, skipped, errors });
    return res.status(200).json({ success: true, candidates: rows.length, scored, skipped, errors });
  } catch (err) {
    logger.error('score-outcomes fatal:', err.message);
    await logCronRun('prospect-score-outcomes', { scored, skipped, errors: errors + 1 });
    return res.status(500).json({ success: false, error: 'Scoring failed' });
  }
};
