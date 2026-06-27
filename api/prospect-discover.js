'use strict';

/**
 * POST /api/prospect-discover — internal lead discovery.
 *
 * Runs a Google Places Text Search for a city/sector and upserts the results as
 * prospect_leads (dedup on google_place_id). Internal/operational tooling — auth
 * is the CRON_SECRET bearer (the operator holds it); a proper internal-admin
 * auth gate arrives with the Phase 5 cockpit. NOT customer-facing.
 *
 * Body: { query, city, country?, sector?, maxResults? }
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { searchPlaces } = require('./_lib/prospecting/places-discovery');
const { upsertDiscoveredLeads } = require('./_lib/prospecting/prospect-store');

const logger = createSecureLogger('ProspectDiscover');

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
  const { query, city, country, sector } = body;
  const maxResults = Math.min(Math.max(parseInt(body.maxResults, 10) || 20, 1), 20);

  if (!query || !city) {
    return res.status(400).json({ success: false, error: 'query and city are required' });
  }

  const result = await searchPlaces({ query, city, country, sector, maxResults });
  if (!result.ok) {
    return res.status(502).json({ success: false, error: result.error });
  }

  const { inserted } = await upsertDiscoveredLeads(result.leads);
  const sendable = result.leads.filter((l) => l.whatsapp_status === 'pending').length;

  logger.info(`discovery: found=${result.leads.length} inserted=${inserted} sendable=${sendable}`);
  return res.status(200).json({
    success: true,
    data: { found: result.leads.length, inserted, duplicates: result.leads.length - inserted, sendable },
  });
};
