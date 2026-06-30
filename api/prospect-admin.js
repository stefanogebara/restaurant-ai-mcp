'use strict';

/**
 * Internal prospecting cockpit API (Phase 5). Lets the founder watch Olímpia's
 * conversations and intervene. Gated by the EXISTING Google-login JWT + an
 * admin-email allowlist (PROSPECTING_ADMIN_EMAILS, default the founder) — it is
 * deliberately NOT tied to the multi-tenant restaurant flow (prospecting is a
 * single internal tenant). Service-role reads via the store layer.
 *
 *   GET  /api/prospect-admin?action=list[&state=]   → { leads, counts }
 *   GET  /api/prospect-admin?action=lead&lead_id=ID → { lead, messages }
 *   POST /api/prospect-admin?action=pause      { lead_id }  → state 'pausada'
 *   POST /api/prospect-admin?action=reactivate { lead_id }  → state 'conversando'
 *   POST /api/prospect-admin?action=optout     { lead_id }  → suppression + 'optout'
 */

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const {
  listProspectLeads, getProspectLeadWithMessages, patchLead, recordOptout,
} = require('./_lib/prospecting/prospect-store');
const { statusBucket, bucketCounts } = require('./_lib/prospecting/prospect-admin-view');

const logger = createSecureLogger('ProspectAdmin');

function adminEmails() {
  return String(process.env.PROSPECTING_ADMIN_EMAILS || 'stefanogebara@gmail.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  // Existing Google-login JWT + admin allowlist (internal tool, not a tenant route).
  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status || 401).json({ success: false, error: auth.error });
  const email = String((auth.user && auth.user.email) || '').toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    logger.warn(`prospect-admin denied for ${email || 'unknown'}`);
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const action = String((req.query && req.query.action) || '').toLowerCase();

  try {
    if (req.method === 'GET' && action === 'list') {
      const state = (req.query.state && String(req.query.state)) || null;
      const leads = await listProspectLeads({ limit: 300, state });
      const withBucket = leads.map((l) => ({ ...l, bucket: statusBucket(l) }));
      return res.status(200).json({ success: true, data: { leads: withBucket, counts: bucketCounts(leads) } });
    }

    if (req.method === 'GET' && action === 'lead') {
      const leadId = req.query.lead_id && String(req.query.lead_id);
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });
      const detail = await getProspectLeadWithMessages(leadId);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      return res.status(200).json({ success: true, data: { ...detail, bucket: statusBucket(detail.lead) } });
    }

    if (req.method === 'POST' && ['pause', 'reactivate', 'optout'].includes(action)) {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });

      if (action === 'optout') {
        const detail = await getProspectLeadWithMessages(leadId, 1);
        if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
        await recordOptout({ phone: detail.lead.whatsapp_phone, leadId, reason: 'admin' });
      } else {
        // pause → silent kill switch (reversible); reactivate → back to active.
        await patchLead(leadId, { prospect_state: action === 'pause' ? 'pausada' : 'conversando' });
      }
      logger.info(`prospect-admin ${action} lead=${leadId} by=${email}`);
      return res.status(200).json({ success: true, data: { action, lead_id: leadId } });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    logger.error('prospect-admin error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};
