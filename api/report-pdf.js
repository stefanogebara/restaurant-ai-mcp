/**
 * PDF Report Endpoint
 *
 * Requires JWT authentication.
 *
 * GET/POST /api/report-pdf?action=generate
 *   → Generates PDF, uploads to Storage, returns { url, expiresAt }
 *
 * GET/POST /api/report-pdf?action=send_whatsapp
 *   → Generates PDF, sends to manager's WhatsApp as document message
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const {
  resolveReportRange,
  generateWeeklyReportPDF,
  uploadReportToStorage,
  sendWeeklyReportViaWhatsApp,
} = require('./_services/pdfReportService');

const logger = createSecureLogger('ReportPdf');

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'report-pdf', 10, 60);
  if (rateLimited) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  const { action } = req.query;

  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with this account' });
  }

  if (!action || !['status', 'generate', 'send_whatsapp'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid action. Use: status | generate | send_whatsapp',
    });
  }

  if (action === 'send_whatsapp' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST required' });
  }

  let rendererReady = false;
  try {
    const renderer = new URL(process.env.GOTENBERG_URL);
    rendererReady = renderer.protocol === 'https:' && renderer.hostname !== 'demo.gotenberg.dev';
  } catch {
    // Missing or malformed configuration is never an invitation to use a public demo.
  }
  if (action !== 'status' && !rendererReady) {
    return res.status(503).json({ success: false, error: 'PDF renderer unavailable' });
  }

  try {
    // Fetch language preference from restaurant_config
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('agent_language, manager_phone, manager_whatsapp_verified, timezone')
      .eq('id', restaurantId)
      .maybeSingle();

    if (configError) throw new Error('Restaurant configuration unavailable');
    if (!config) return res.status(404).json({ success: false, error: 'Restaurant not found' });

    if (action === 'status') {
      const phoneReady = Boolean(config.manager_phone && config.manager_whatsapp_verified === true);
      return res.status(200).json({
        success: true,
        available: rendererReady && phoneReady,
        reason: !rendererReady ? 'renderer_unavailable' : phoneReady ? null : 'phone_unverified',
      });
    }

    const language = config?.agent_language || 'pt-BR';
    const rangeInput = {
      start_date: req.query.start_date,
      end_date: req.query.end_date,
    };
    try {
      resolveReportRange(rangeInput, config.timezone || 'UTC');
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (action === 'generate') {
      logger.info('PDF generate request', { restaurantId });

      const pdfBuffer = await generateWeeklyReportPDF(restaurantId, language, rangeInput);
      const signedUrl = await uploadReportToStorage(pdfBuffer, restaurantId, rangeInput);

      // URL expires in 24h
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return res.status(200).json({ success: true, url: signedUrl, expiresAt });
    }

    if (action === 'send_whatsapp') {
      const phone = config?.manager_phone;
      if (!phone || config.manager_whatsapp_verified !== true) {
        return res.status(400).json({
          success: false,
          error: 'A verified manager WhatsApp number is required.',
        });
      }

      logger.info('PDF send_whatsapp request', { restaurantId });

      const result = await sendWeeklyReportViaWhatsApp(restaurantId, phone, language, rangeInput);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      const message =
        language === 'pt-BR'
          ? 'Relatório enviado via WhatsApp com sucesso!'
          : 'Report sent via WhatsApp successfully!';

      return res.status(200).json({ success: true, message });
    }
  } catch (err) {
    logger.error('report-pdf error', { error: err.message, restaurantId });
    return res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
};
