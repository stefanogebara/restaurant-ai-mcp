/**
 * Diagnostic — run generateWeeklyReportPDF + upload + return status as JSON.
 * Usage: curl "https://seatable.one/api/diag-pdf?restaurantId=c3368ea1-...&secret=..."
 */
'use strict';

const { generateWeeklyReportHTML, generateWeeklyReportPDF, uploadReportToStorage } = require('./services/pdfReportService');

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
    out.success = true;
  } catch (err) {
    out.success = false;
    out.error = err?.message?.slice(0, 300);
    out.stack = err?.stack?.split('\n').slice(0, 4);
    out.steps.push({ step: 'error', elapsed_ms: Date.now() - t0 });
  }
  return res.status(200).json(out);
};
