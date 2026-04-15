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
  generateWeeklyReportPDF,
  uploadReportToStorage,
  sendWeeklyReportViaWhatsApp,
} = require('./services/pdfReportService');

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

  if (!action || !['generate', 'send_whatsapp'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid action. Use: generate | send_whatsapp',
    });
  }

  try {
    // Fetch language preference from restaurant_config
    const { data: config } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('agent_language, manager_phone')
      .eq('id', restaurantId)
      .maybeSingle();

    const language = config?.agent_language || 'pt-BR';

    if (action === 'generate') {
      logger.info('PDF generate request', { restaurantId });

      const pdfBuffer = await generateWeeklyReportPDF(restaurantId, language);
      const signedUrl = await uploadReportToStorage(pdfBuffer, restaurantId, 'weekly');

      // URL expires in 24h
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return res.status(200).json({ success: true, url: signedUrl, expiresAt });
    }

    if (action === 'send_whatsapp') {
      const phone = config?.manager_phone;
      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'No manager phone configured. Set a WhatsApp number in Settings.',
        });
      }

      logger.info('PDF send_whatsapp request', { restaurantId });

      const result = await sendWeeklyReportViaWhatsApp(restaurantId, phone, language);

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
