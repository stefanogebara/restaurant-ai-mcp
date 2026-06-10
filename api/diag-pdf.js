/**
 * Diagnostic — run generateWeeklyReportPDF + upload + return status as JSON.
 * Usage: curl "https://seatable.one/api/diag-pdf?restaurantId=c3368ea1-...&secret=..."
 */
'use strict';

const { generateWeeklyReportHTML, generateWeeklyReportPDF, uploadReportToStorage, sendWeeklyReportViaWhatsApp } = require('./_services/pdfReportService');
const { sendWhatsAppDocumentMessage } = require('./_lib/whatsapp-sender');

module.exports = async (req, res) => {
  const secret = req.query?.secret || req.headers['x-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const restaurantId = req.query?.restaurantId || 'c3368ea1-b278-416f-ad24-de28434fe9ce';
  const out = { restaurantId, gotenberg_url: process.env.GOTENBERG_URL || '(default demo)', steps: [] };
  const t0 = Date.now();
  try {
    out.steps.push({ step: 'html:start', elapsed_ms: Date.now() - t0 });
    const html = await generateWeeklyReportHTML(restaurantId, 'pt-BR');
    out.steps.push({ step: 'html:ok', elapsed_ms: Date.now() - t0, html_len: html.length });

    out.steps.push({ step: 'pdf:start', elapsed_ms: Date.now() - t0 });
    const pdf = await generateWeeklyReportPDF(restaurantId, 'pt-BR');
    out.steps.push({ step: 'pdf:ok', elapsed_ms: Date.now() - t0, pdf_bytes: pdf.byteLength });

    out.steps.push({ step: 'upload:start', elapsed_ms: Date.now() - t0 });
    const url = await uploadReportToStorage(pdf, restaurantId, 'weekly');
    out.steps.push({ step: 'upload:ok', elapsed_ms: Date.now() - t0 });
    out.url = url.slice(0, 150);

    // Optionally also test the document send to a test phone
    const testPhone = req.query?.phone;
    if (testPhone) {
      out.steps.push({ step: 'doc_send:start', elapsed_ms: Date.now() - t0 });
      const result = await sendWhatsAppDocumentMessage(testPhone, url, 'diag-pdf', 'test.pdf');
      out.steps.push({
        step: 'doc_send:done',
        elapsed_ms: Date.now() - t0,
        success: result.success,
        error: result.error,
        messageId: result.messageId,
      });
      out.doc_send_result = result;
    }
    // Test the full wrapper that RELATORIO actually calls
    if (req.query?.fullWrapper === '1' && testPhone) {
      out.steps.push({ step: 'wrapper:start', elapsed_ms: Date.now() - t0 });
      const wrapResult = await sendWeeklyReportViaWhatsApp(restaurantId, testPhone, 'pt-BR');
      out.steps.push({
        step: 'wrapper:done',
        elapsed_ms: Date.now() - t0,
        success: wrapResult.success,
        error: wrapResult.error,
      });
      out.wrapper_result = wrapResult;
    }
    out.success = true;
  } catch (err) {
    out.success = false;
    out.error = err?.message?.slice(0, 300);
    out.stack = err?.stack?.split('\n').slice(0, 4);
    out.steps.push({ step: 'error', elapsed_ms: Date.now() - t0 });
  }
  return res.status(200).json(out);
};
