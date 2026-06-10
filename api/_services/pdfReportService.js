/**
 * PDF Report Service
 *
 * Generates weekly PDF reports for restaurants and delivers them via WhatsApp.
 *
 * Flow:
 *   1. Fetch data from Supabase (reservations, service_records, restaurant_config)
 *   2. Build stats and QuickChart URLs using chartService
 *   3. Render full HTML document
 *   4. Convert HTML → PDF via Gotenberg
 *   5. Upload PDF to Supabase Storage (restaurant-reports bucket)
 *   6. Get 24h signed URL
 *   7. Send signed URL as WhatsApp document message
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppDocumentMessage } = require('../_lib/whatsapp-sender');
const {
  buildWeeklyReservationsChart,
  buildNoShowChart,
  buildRevenueTrendChart,
  buildKPIDashboard,
} = require('./chartService');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('PdfReportService');

const GOTENBERG_URL = process.env.GOTENBERG_URL || 'https://demo.gotenberg.dev';
const STORAGE_BUCKET = 'restaurant-reports';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all the data needed for the weekly report.
 * @param {string} restaurantId
 * @returns {Promise<{reservations: object[], serviceRecords: object[], config: object|null}>}
 */
async function fetchReportData(restaurantId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const [reservationsResult, serviceRecordsResult, configResult] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, date, time, party_size, status')
      .eq('restaurant_id', restaurantId)
      .gte('date', weekAgo)
      .lte('date', today),
    supabaseAdmin
      .from('service_records')
      .select('id, seated_at, party_size, total_bill')
      .eq('restaurant_id', restaurantId)
      .gte('seated_at', weekAgo)
      .eq('status', 'completed'),
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, agent_language')
      .eq('id', restaurantId)
      .maybeSingle(),
  ]);

  if (reservationsResult.error) {
    logger.error('fetchReportData reservations error', { error: reservationsResult.error.message });
  }
  if (serviceRecordsResult.error) {
    logger.error('fetchReportData service_records error', { error: serviceRecordsResult.error.message });
  }

  return {
    reservations: reservationsResult.data || [],
    serviceRecords: serviceRecordsResult.data || [],
    config: configResult.data || null,
  };
}

/**
 * Build aggregated stats from raw data.
 */
function buildStats(reservations, serviceRecords) {
  const totalReservations = reservations.length;
  const noShows = reservations.filter(r => r.status === 'no-show').length;
  const cancelled = reservations.filter(r => r.status === 'cancelled').length;
  const completed = reservations.filter(r => r.status === 'completed' || r.status === 'seated').length;

  const totalCovers = reservations
    .filter(r => r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.party_size || 0), 0);

  const avgPartySize = totalReservations > 0
    ? (totalCovers / Math.max(totalReservations - cancelled, 1)).toFixed(1)
    : '0';

  // Revenue from service records (total_bill column)
  const revenueEstimate = serviceRecords.reduce((sum, s) => sum + (s.total_bill || 0), 0);

  return {
    totalReservations,
    totalCovers,
    noShows,
    cancelled,
    completed,
    avgPartySize,
    revenueEstimate,
  };
}

/**
 * Build 7-day reservation counts by day name (PT-BR).
 */
function buildDailyChartData(reservations) {
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const dayCounts = {};
  for (const r of reservations) {
    const d = new Date(r.date + 'T12:00:00Z');
    const dayName = dayNames[d.getUTCDay()];
    dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
  }
  return dayNames.map(day => ({ day, count: dayCounts[day] || 0 }));
}

/**
 * Build 7-day revenue data from service records.
 */
function buildRevenueDailyData(serviceRecords) {
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const dayRevenue = {};
  for (const s of serviceRecords) {
    const d = new Date(s.seated_at);
    const dayName = dayNames[d.getDay()];
    dayRevenue[dayName] = (dayRevenue[dayName] || 0) + (s.total_bill || 0);
  }
  return dayNames.map(day => ({ day, revenue: dayRevenue[day] || 0 }));
}

// ---------------------------------------------------------------------------
// generateWeeklyReportHTML
// ---------------------------------------------------------------------------

/**
 * Generate a complete HTML document for the weekly report.
 *
 * @param {string} restaurantId
 * @param {string} [language='pt-BR']
 * @returns {Promise<string>} Full HTML string
 */
async function generateWeeklyReportHTML(restaurantId, language = 'pt-BR') {
  const { reservations, serviceRecords, config } = await fetchReportData(restaurantId);
  const restaurantName = config?.restaurant_name || 'Restaurante';
  const stats = buildStats(reservations, serviceRecords);
  const dailyChartData = buildDailyChartData(reservations);
  const revenueDailyData = buildRevenueDailyData(serviceRecords);

  // Build chart URLs
  const reservationsChartUrl = buildWeeklyReservationsChart(dailyChartData, restaurantName);
  const noShowChartUrl = buildNoShowChart(
    { showed: stats.completed, noShow: stats.noShows, cancelled: stats.cancelled },
    restaurantName
  );
  const revenueTrendUrl = buildRevenueTrendChart(revenueDailyData, restaurantName);
  const kpiUrl = buildKPIDashboard(
    { reservations: stats.totalReservations, noShows: stats.noShows, revenue: stats.revenueEstimate, avgRating: 4.5 },
    restaurantName
  );

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const weekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  const revenueFormatted = stats.revenueEstimate > 0
    ? `R$ ${stats.revenueEstimate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório Semanal — ${restaurantName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', Arial, sans-serif;
      background: #FAFAF9;
      color: #1C1917;
      font-size: 14px;
      line-height: 1.6;
      padding: 0;
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 48px;
    }
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #9F1239;
      padding-bottom: 20px;
      margin-bottom: 32px;
    }
    .header-brand { display: flex; align-items: center; gap: 12px; }
    .logo-dot {
      width: 36px; height: 36px;
      background: #9F1239;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 18px;
    }
    .brand-name { font-size: 20px; font-weight: 700; color: #1C1917; }
    .brand-tag { font-size: 11px; color: #706A65; margin-top: 2px; }
    .header-date { text-align: right; }
    .header-date .restaurant { font-size: 18px; font-weight: 700; color: #1C1917; }
    .header-date .period { font-size: 12px; color: #706A65; margin-top: 4px; }
    /* Section title */
    .section-title {
      font-size: 13px; font-weight: 600; color: #9F1239;
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 16px; margin-top: 36px;
    }
    /* KPI grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 8px;
    }
    .kpi-card {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 20px 24px;
    }
    .kpi-label { font-size: 11px; color: #706A65; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
    .kpi-value { font-size: 28px; font-weight: 700; color: #1C1917; }
    .kpi-sub { font-size: 11px; color: #706A65; margin-top: 4px; }
    .kpi-accent { color: #9F1239; }
    /* Charts */
    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 8px; }
    .chart-full { margin-top: 8px; }
    .chart-card {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 20px;
      overflow: hidden;
    }
    .chart-card img { width: 100%; height: auto; display: block; border-radius: 6px; }
    /* Stats table */
    .stats-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .stats-table th {
      font-size: 11px; font-weight: 600; color: #706A65;
      text-transform: uppercase; letter-spacing: 0.04em;
      text-align: left; padding: 10px 16px;
      border-bottom: 1px solid #E5E7EB;
      background: white;
    }
    .stats-table td {
      padding: 12px 16px; border-bottom: 1px solid #F5F0EB;
      font-size: 13px; background: white;
    }
    .stats-table tr:last-child td { border-bottom: none; }
    .stats-table .val { font-weight: 600; color: #1C1917; }
    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #706A65;
    }
    .footer a { color: #9F1239; text-decoration: none; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-brand">
        <div class="logo-dot">S</div>
        <div>
          <div class="brand-name">Seatable</div>
          <div class="brand-tag">Relatório Semanal</div>
        </div>
      </div>
      <div class="header-date">
        <div class="restaurant">${restaurantName}</div>
        <div class="period">${weekAgoDate} – ${today}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="section-title">Resumo da Semana</div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Reservas</div>
        <div class="kpi-value">${stats.totalReservations}</div>
        <div class="kpi-sub">${stats.cancelled} canceladas · ${stats.noShows} no-shows</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Covers Totais</div>
        <div class="kpi-value">${stats.totalCovers}</div>
        <div class="kpi-sub">Média ${stats.avgPartySize} por reserva</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Receita Estimada</div>
        <div class="kpi-value kpi-accent">${revenueFormatted}</div>
        <div class="kpi-sub">${stats.completed} serviços concluídos</div>
      </div>
    </div>

    <!-- Stats table -->
    <div class="section-title">Detalhamento</div>
    <table class="stats-table">
      <thead>
        <tr>
          <th>Métrica</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Total de reservas</td><td class="val">${stats.totalReservations}</td></tr>
        <tr><td>Reservas confirmadas / compareceu</td><td class="val">${stats.completed}</td></tr>
        <tr><td>No-shows</td><td class="val">${stats.noShows}</td></tr>
        <tr><td>Cancelamentos</td><td class="val">${stats.cancelled}</td></tr>
        <tr><td>Total de covers</td><td class="val">${stats.totalCovers}</td></tr>
        <tr><td>Tamanho médio do grupo</td><td class="val">${stats.avgPartySize}</td></tr>
        <tr><td>Taxa de no-show</td><td class="val">${stats.totalReservations > 0 ? Math.round((stats.noShows / stats.totalReservations) * 100) : 0}%</td></tr>
        <tr><td>Receita total registrada</td><td class="val">${revenueFormatted}</td></tr>
      </tbody>
    </table>

    <!-- Charts row -->
    <div class="section-title">Gráficos</div>
    <div class="chart-row">
      <div class="chart-card">
        <img src="${reservationsChartUrl}" alt="Reservas por dia da semana" />
      </div>
      <div class="chart-card">
        <img src="${noShowChartUrl}" alt="Taxa de no-show" />
      </div>
    </div>

    <div class="chart-full">
      <div class="chart-card">
        <img src="${revenueTrendUrl}" alt="Tendência de receita" />
      </div>
    </div>

    <div class="chart-full" style="margin-top: 24px;">
      <div class="chart-card">
        <img src="${kpiUrl}" alt="KPI Dashboard" />
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>Gerado em ${today} · <a href="https://seatable.one">seatable.one</a></span>
      <span>${restaurantName}</span>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// generateWeeklyReportPDF
// ---------------------------------------------------------------------------

/**
 * Convert the weekly report HTML to a PDF buffer using Gotenberg.
 *
 * @param {string} restaurantId
 * @param {string} [language='pt-BR']
 * @returns {Promise<ArrayBuffer>} PDF buffer
 */
async function generateWeeklyReportPDF(restaurantId, language = 'pt-BR') {
  const html = await generateWeeklyReportHTML(restaurantId, language);

  const formData = new FormData();
  formData.append(
    'files',
    new Blob([html], { type: 'text/html' }),
    'index.html'
  );
  // Allow external resources (Google Fonts, QuickChart images)
  formData.append('skipNetworkIdleEvent', 'false');

  const response = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gotenberg conversion failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  return response.arrayBuffer();
}

// ---------------------------------------------------------------------------
// uploadReportToStorage
// ---------------------------------------------------------------------------

/**
 * Upload a PDF buffer to Supabase Storage and return a 24h signed URL.
 *
 * @param {ArrayBuffer} buffer - PDF content
 * @param {string} restaurantId
 * @param {'weekly'} [reportType='weekly']
 * @returns {Promise<string>} Signed URL
 */
async function uploadReportToStorage(buffer, restaurantId, reportType = 'weekly') {
  const date = new Date().toISOString().split('T')[0];
  const filename = `${restaurantId}/${reportType}-${date}.pdf`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(filename, Buffer.from(buffer), {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data, error: urlError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filename, 86400); // 24 hours

  if (urlError) {
    throw new Error(`Signed URL generation failed: ${urlError.message}`);
  }

  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// sendWeeklyReportViaWhatsApp
// ---------------------------------------------------------------------------

/**
 * Generate, upload, and deliver the weekly PDF report via WhatsApp.
 *
 * @param {string} restaurantId
 * @param {string} phone - E.164 phone number of the recipient
 * @param {string} [language='pt-BR']
 * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
 */
async function sendWeeklyReportViaWhatsApp(restaurantId, phone, language = 'pt-BR') {
  try {
    logger.info('Generating weekly PDF report', { restaurantId });

    const pdfBuffer = await generateWeeklyReportPDF(restaurantId, language);
    const signedUrl = await uploadReportToStorage(pdfBuffer, restaurantId, 'weekly');

    const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const caption = `📊 Seu relatório semanal — ${date}`;
    const filename = `relatorio-semanal-${new Date().toISOString().split('T')[0]}.pdf`;

    const result = await sendWhatsAppDocumentMessage(phone, signedUrl, caption, filename);

    if (!result.success) {
      logger.error('WhatsApp document send failed', { restaurantId, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info('Weekly PDF report sent via WhatsApp', { restaurantId, messageId: result.messageId });
    return { success: true, url: signedUrl };
  } catch (err) {
    logger.error('sendWeeklyReportViaWhatsApp error', { restaurantId, error: err.message });
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateWeeklyReportHTML,
  generateWeeklyReportPDF,
  uploadReportToStorage,
  sendWeeklyReportViaWhatsApp,
};
