'use strict';

/**
 * POST /api/prospect-dispatch — operator-triggered cold-intro dispatch.
 *
 * Deliberately a MANUAL endpoint, not an auto-cron: cold outreach should be
 * operator-initiated (compliance + believability), not blasted on a timer. Sends
 * the approved intro template to leads that have never been contacted, bounded by
 * the warm-up daily cap. Dry-run-default-on and force-safe without a configured
 * number + template. Auth: CRON_SECRET bearer (internal tooling).
 *
 * Body: { limit? }
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { dispatchIntros } = require('./_lib/prospecting/sequencer');

const logger = createSecureLogger('ProspectDispatch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('CRON_SECRET not configured');
    return res.status(500).json({ success: false, error: 'Not configured' });
  }
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 20, 1), 100);
  // Operator override — deliberately send outside the 10-17 dispatch window.
  const force = (req.body || {}).force === true;
  try {
    const summary = await dispatchIntros({ limit, force });
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    logger.error('dispatch error:', err.message);
    return res.status(500).json({ success: false, error: 'Dispatch failed' });
  }
};
