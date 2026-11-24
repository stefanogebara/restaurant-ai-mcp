'use strict';

/**
 * POST /api/prospect-discovery-worker — mass-discovery batch executor.
 *
 * Internal (CRON_SECRET bearer), event-driven — NOT a cron. The ops console
 * creates a job (prospect-admin action=discovery-job) and fires this worker
 * once; each invocation processes queries for ~40s within its serverless
 * budget, then SELF-CHAINS (fire-and-forget POST to itself) until the job is
 * done or cancelled. A 600-municipality state sweep completes in a handful of
 * chained invocations with zero standing infrastructure.
 *
 * Body: { job_id }
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { runDiscoveryBatch } = require('./_lib/prospecting/prospect-mass-discovery');

const logger = createSecureLogger('DiscoveryWorker');

function selfUrl() {
  // Prefer the canonical host; VERCEL_URL covers previews.
  const base = process.env.CLIENT_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://seatable.one');
  return `${base.replace(/\/$/, '')}/api/prospect-discovery-worker`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const jobId = req.body && req.body.job_id ? String(req.body.job_id) : null;
  if (!jobId) return res.status(400).json({ success: false, error: 'job_id required' });

  try {
    const result = await runDiscoveryBatch(jobId, { budgetMs: 40000 });

    if (!result.done && result.remaining > 0) {
      // Self-chain: fire-and-forget; the response below returns immediately.
      fetch(selfUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ job_id: jobId }),
      }).catch((err) => logger.error('self-chain failed:', err.message));
      logger.info(`batch done, chained — job=${jobId} remaining=${result.remaining}`);
    } else {
      logger.info(`job finished — job=${jobId}${result.error ? ` error=${result.error}` : ''}`);
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error('worker error:', err.message);
    return res.status(500).json({ success: false, error: 'Worker failed' });
  }
};
