'use strict';

/**
 * Internal prospecting ops platform API (Phase 5 cockpit → Phase 7 platform).
 * Lets the founder watch Olímpia's conversations, discover + mass-dispatch
 * leads, take over conversations, and stop the agent globally. Gated by the
 * EXISTING Google-login JWT + an admin-email allowlist
 * (PROSPECTING_ADMIN_EMAILS, default the founder) — deliberately NOT tied to
 * the multi-tenant restaurant flow (prospecting is a single internal tenant).
 *
 *   GET  /api/prospect-admin?action=list[&state=]   → { leads, counts, agent_enabled, dry_run }
 *   GET  /api/prospect-admin?action=lead&lead_id=ID → { lead, messages, can_free_text }
 *   POST /api/prospect-admin?action=pause      { lead_id }  → state 'pausada'
 *   POST /api/prospect-admin?action=reactivate { lead_id }  → state 'conversando'
 *   POST /api/prospect-admin?action=optout     { lead_id }  → suppression + 'optout'
 *   POST /api/prospect-admin?action=send       { lead_id, texto, keep_active? }
 *        → operator message from the prospecting number; pauses the agent for
 *          that lead by default (human takeover), 24h-window enforced.
 *   POST /api/prospect-admin?action=agent      { enabled }  → GLOBAL kill switch
 *        (cron_config row 'prospecting-agent'; responder+sequencer check it).
 *   POST /api/prospect-admin?action=discover   { query?, city, uf?, bairro?, maxResults? }
 *        → Google Places search + upsert into prospect_leads.
 *   POST /api/prospect-admin?action=dispatch   { limit? } → cold-intro mass send
 *        (warm-up daily cap + opt-out suppression + dry-run rules all apply).
 */

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { supabaseAdmin } = require('./_lib/supabase');
const { sendWhatsAppMessage } = require('./_lib/whatsapp-sender');
const { getProspectingPhoneNumberId } = require('./_lib/prospecting/routing');
const {
  listProspectLeads, getProspectLeadWithMessages, patchLead, recordOptout,
  storeMessage, loadLastInbound,
} = require('./_lib/prospecting/prospect-store');
const { statusBucket, bucketCounts } = require('./_lib/prospecting/prospect-admin-view');
const { podeMensagemLivre } = require('./_lib/prospecting/prospect-nudge');
const { getCronConfig } = require('./_lib/cron-config');
const { onlyDigits } = require('./_lib/prospecting/phone');

const logger = createSecureLogger('ProspectAdmin');

const AGENT_JOB = 'prospecting-agent';

function adminEmails() {
  return String(process.env.PROSPECTING_ADMIN_EMAILS || 'stefanogebara@gmail.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function setAgentEnabled(enabled, email) {
  const { error } = await supabaseAdmin.from('cron_config').upsert({
    job_name: AGENT_JOB,
    enabled: !!enabled,
    notes: `prospecting global switch (via platform by ${email})`,
    updated_at: new Date().toISOString(),
    updated_by: email,
  }, { onConflict: 'job_name' });
  if (error) throw new Error(`cron_config upsert failed: ${error.message}`);
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
      const [leads, agentCfg] = await Promise.all([
        listProspectLeads({ limit: 300, state }),
        getCronConfig(AGENT_JOB),
      ]);
      const withBucket = leads.map((l) => ({ ...l, bucket: statusBucket(l) }));
      return res.status(200).json({
        success: true,
        data: {
          leads: withBucket,
          counts: bucketCounts(leads),
          agent_enabled: agentCfg.enabled,
          dry_run: !getProspectingPhoneNumberId() || process.env.PROSPECTING_DRY_RUN !== 'false',
        },
      });
    }

    // ---- Overview ("what's going on") for the standalone ops console ----------
    if (req.method === 'GET' && action === 'overview') {
      const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
      const hojeIso = hoje.toISOString();
      const nowIso = new Date().toISOString();
      const [agentCfg, outStats, inStats, meetings, outcomes] = await Promise.all([
        getCronConfig(AGENT_JOB),
        supabaseAdmin.from('prospect_messages').select('id', { count: 'exact', head: true })
          .eq('direcao', 'out').gte('enviada_em', hojeIso),
        supabaseAdmin.from('prospect_messages').select('id', { count: 'exact', head: true })
          .eq('direcao', 'in').gte('enviada_em', hojeIso),
        supabaseAdmin.from('prospect_leads').select('id, name, city, reuniao_at, reuniao_link')
          .gt('reuniao_at', nowIso).order('reuniao_at', { ascending: true }).limit(10),
        supabaseAdmin.rpc('prospect_outcomes_agg', { p_dias: 30 }),
      ]);
      return res.status(200).json({
        success: true,
        data: {
          agent_enabled: agentCfg.enabled,
          dry_run: !getProspectingPhoneNumberId() || process.env.PROSPECTING_DRY_RUN !== 'false',
          daily_cap: parseInt(process.env.PROSPECTING_DAILY_CAP, 10) || 40,
          sent_today: outStats.count ?? 0,
          received_today: inStats.count ?? 0,
          meetings: meetings.data || [],
          outcomes: outcomes.data || null,
        },
      });
    }

    if (req.method === 'GET' && action === 'lead') {
      const leadId = req.query.lead_id && String(req.query.lead_id);
      if (!leadId) return res.status(400).json({ success: false, error: 'lead_id required' });
      const detail = await getProspectLeadWithMessages(leadId);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      // Meta's 24h customer-service window: free text is only deliverable within
      // 24h of the lead's last message. Surface it so the composer can warn.
      const lastIn = await loadLastInbound(leadId);
      const canFreeText = !!lastIn && podeMensagemLivre(new Date(lastIn.enviada_em).getTime());
      return res.status(200).json({
        success: true,
        data: { ...detail, bucket: statusBucket(detail.lead), can_free_text: canFreeText },
      });
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

    // ---- Operator manual send (human takeover) --------------------------------
    if (req.method === 'POST' && action === 'send') {
      const leadId = (req.body && req.body.lead_id) ? String(req.body.lead_id) : null;
      const texto = (req.body && req.body.texto) ? String(req.body.texto).trim() : '';
      const keepActive = !!(req.body && req.body.keep_active);
      if (!leadId || !texto) return res.status(400).json({ success: false, error: 'lead_id and texto required' });
      if (texto.length > 4000) return res.status(400).json({ success: false, error: 'texto too long' });

      const phoneNumberId = getProspectingPhoneNumberId();
      if (!phoneNumberId) return res.status(422).json({ success: false, error: 'Prospecting number not configured' });

      const detail = await getProspectLeadWithMessages(leadId, 1);
      if (!detail) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (detail.lead.prospect_state === 'optout') {
        return res.status(422).json({ success: false, error: 'Lead opted out (LGPD) — cannot message' });
      }

      // Meta rejects free text beyond the 24h window; fail with a clear reason
      // instead of a silent Meta error.
      const lastIn = await loadLastInbound(leadId);
      if (!lastIn || !podeMensagemLivre(new Date(lastIn.enviada_em).getTime())) {
        return res.status(422).json({
          success: false,
          error: 'Fora da janela de 24h do WhatsApp — só é possível enviar template aprovado.',
        });
      }

      const to = onlyDigits(detail.lead.whatsapp_phone);
      const result = await sendWhatsAppMessage(to, texto, { phoneNumberId });
      if (!result || !result.success) {
        return res.status(502).json({ success: false, error: 'Envio falhou no WhatsApp' });
      }
      await storeMessage({
        leadId,
        direcao: 'out',
        wamid: result.messageId || null,
        tipo: 'text',
        corpo: texto,
        raw: { operator: email },
      });
      // Human takeover: pause the agent for this lead unless told otherwise —
      // two voices in one chat is the fastest way to sound broken.
      if (!keepActive && detail.lead.prospect_state !== 'pausada') {
        await patchLead(leadId, { prospect_state: 'pausada' });
      }
      logger.info(`prospect-admin manual send lead=${leadId} by=${email} paused=${!keepActive}`);
      return res.status(200).json({ success: true, data: { sent: true, paused: !keepActive } });
    }

    // ---- Global agent kill switch ---------------------------------------------
    if (req.method === 'POST' && action === 'agent') {
      const enabled = !!(req.body && req.body.enabled);
      await setAgentEnabled(enabled, email);
      logger.info(`prospect-admin GLOBAL agent ${enabled ? 'ENABLED' : 'DISABLED'} by=${email}`);
      return res.status(200).json({ success: true, data: { agent_enabled: enabled } });
    }

    // ---- Discovery (Google Places → prospect_leads) ----------------------------
    if (req.method === 'POST' && action === 'discover') {
      const body = req.body || {};
      const city = body.city ? String(body.city).trim() : '';
      if (!city) return res.status(400).json({ success: false, error: 'city required' });
      const uf = body.uf ? String(body.uf).trim().toUpperCase() : '';
      const bairro = body.bairro ? String(body.bairro).trim() : '';
      const baseQuery = body.query ? String(body.query).trim() : 'restaurantes';
      const maxResults = Math.min(Math.max(parseInt(body.maxResults, 10) || 20, 1), 20);

      const { searchPlaces } = require('./_lib/prospecting/places-discovery');
      const { upsertDiscoveredLeads } = require('./_lib/prospecting/prospect-store');
      const query = [baseQuery, bairro].filter(Boolean).join(' ');
      const cityFull = uf ? `${city}, ${uf}` : city;
      const result = await searchPlaces({ query, city: cityFull, sector: 'restaurante', maxResults });
      if (!result.ok) return res.status(502).json({ success: false, error: result.error });
      const { inserted } = await upsertDiscoveredLeads(result.leads);
      logger.info(`prospect-admin discover "${query}" ${cityFull} found=${result.leads.length} inserted=${inserted} by=${email}`);
      return res.status(200).json({
        success: true,
        data: { found: result.leads.length, inserted, duplicates: result.leads.length - inserted },
      });
    }

    // ---- Mass dispatch (cold intros; warm-up cap + suppression apply) ----------
    if (req.method === 'POST' && action === 'dispatch') {
      const limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 20, 1), 100);
      const { dispatchIntros } = require('./_lib/prospecting/sequencer');
      const summary = await dispatchIntros({ limit });
      logger.info(`prospect-admin dispatch limit=${limit} sent=${summary.sent} by=${email}`);
      return res.status(200).json({ success: true, data: summary });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    logger.error('prospect-admin error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};
