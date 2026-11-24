'use strict';

/**
 * POST /api/prospect-enrich — BR enrichment trigger (internal tooling).
 *
 * Body:
 *   { lead_id }            → enrich one lead (CNPJ → owner → Instagram).
 *   { limit }              → enrich a bounded batch of CNPJ-less discovered leads.
 *   { force }              → ignore the "already has cnpj" / 7-day cooldown skips.
 *
 * Degrades gracefully: works partially without SCRAPINGDOG_API_KEY (site-footer
 * CNPJ + local Receita index + keyless official sources) and with an empty
 * cnpj_index (falls back to the SERP path). Auth: CRON_SECRET bearer.
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { enrichLead, enrichPending } = require('./_lib/prospecting/prospect-enrich');

const logger = createSecureLogger('ProspectEnrich');

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

  const body = req.body || {};
  const force = Boolean(body.force);

  try {
    if (body.lead_id) {
      const result = await enrichLead(String(body.lead_id), { force });
      if (result.error) return res.status(result.error === 'lead não encontrado' ? 404 : 500).json({ success: false, error: result.error });
      return res.status(200).json({ success: true, data: { enrich_status: result.enrich_status, skipped: !!result.skipped, reason: result.reason } });
    }
    const summary = await enrichPending({ limit: body.limit, force });
    if (summary.error) return res.status(500).json({ success: false, error: summary.error });
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    logger.error('enrich endpoint error:', err.message);
    return res.status(500).json({ success: false, error: 'Enrichment failed' });
  }
};
