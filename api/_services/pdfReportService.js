/** Private, period-bound PDF reports. No operational data goes to public demo renderers. */
const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppDocumentMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { validTimeZone, shiftDate, resolveReportRange, servicesInLocalRange } = require('../_lib/report-period');

const logger = createSecureLogger('PdfReportService');
const STORAGE_BUCKET = 'restaurant-reports';

const COPY = {
  'pt-BR': {
    title: 'Relatório do período', reservations: 'Reservas', covers: 'Pessoas atendidas',
    noShows: 'Não compareceram', cancellations: 'Cancelamentos', revenue: 'Receita registrada',
    noRevenue: 'Sem contas registradas', currencyUnknown: 'moeda não confirmada', day: 'Dia', count: 'Reservas',
    empty: 'Não houve reservas nem serviços concluídos neste período.',
    note: 'Pessoas atendidas e receita vêm de serviços concluídos. Reservas não são faturamento.',
    generated: 'Gerado em', caption: 'Seu relatório',
  },
  es: {
    title: 'Informe del período', reservations: 'Reservas', covers: 'Comensales atendidos',
    noShows: 'No se presentaron', cancellations: 'Cancelaciones', revenue: 'Ingresos registrados',
    noRevenue: 'Sin cuentas registradas', currencyUnknown: 'moneda sin confirmar', day: 'Día', count: 'Reservas',
    empty: 'No hubo reservas ni servicios completados en este período.',
    note: 'Los comensales e ingresos provienen de servicios completados. Las reservas no son ingresos.',
    generated: 'Generado el', caption: 'Tu informe',
  },
  en: {
    title: 'Period report', reservations: 'Reservations', covers: 'Guests served',
    noShows: 'No-shows', cancellations: 'Cancellations', revenue: 'Recorded revenue',
    noRevenue: 'No bills recorded', currencyUnknown: 'currency unconfirmed', day: 'Day', count: 'Reservations',
    empty: 'There were no reservations or completed services in this period.',
    note: 'Guests served and revenue come from completed services. Reservations are not revenue.',
    generated: 'Generated on', caption: 'Your report',
  },
};

function localeFor(language) {
  const normalized = String(language || '').toLowerCase();
  return normalized.startsWith('pt') ? 'pt-BR' : normalized.startsWith('es') ? 'es' : 'en';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

async function fetchReportData(restaurantId, requestedRange) {
  const { data: config, error: configError } = await supabaseAdmin
    .schema('restaurant').from('restaurant_config')
    .select('restaurant_name, country, timezone')
    .eq('id', restaurantId).maybeSingle();
  if (configError || !config) throw new Error('Restaurant configuration unavailable');

  const timeZone = validTimeZone(config.timezone || 'UTC');
  const range = resolveReportRange(requestedRange, timeZone);
  // Fetch a one-day margin around timestamped services, then filter in the
  // restaurant's local calendar. A raw UTC midnight filter loses edge visits.
  const [reservationsResult, servicesResult] = await Promise.all([
    supabaseAdmin.from('reservations')
      .select('date, party_size, status')
      .eq('restaurant_id', restaurantId).gte('date', range.start).lte('date', range.end),
    supabaseAdmin.from('service_records')
      .select('seated_at, party_size, total_bill, status')
      .eq('restaurant_id', restaurantId)
      .gte('seated_at', `${shiftDate(range.start, -1)}T00:00:00Z`)
      .lt('seated_at', `${shiftDate(range.end, 2)}T00:00:00Z`)
      .eq('status', 'completed'),
  ]);
  if (reservationsResult.error || servicesResult.error) {
    throw new Error('Report data unavailable');
  }

  const services = servicesInLocalRange(servicesResult.data, range, timeZone);
  return { config, range, reservations: reservationsResult.data || [], services, timeZone };
}

function buildStats(reservations, services) {
  const status = row => String(row.status || '').toLowerCase().replace('-', '_');
  const bills = services.filter(row => row.total_bill != null)
    .map(row => Number(row.total_bill)).filter(value => Number.isFinite(value) && value >= 0);
  return {
    reservations: reservations.length,
    covers: services.reduce((sum, row) => sum + (Number(row.party_size) || 0), 0),
    noShows: reservations.filter(row => status(row) === 'no_show').length,
    cancellations: reservations.filter(row => status(row) === 'cancelled').length,
    revenue: bills.reduce((sum, value) => sum + value, 0),
    hasBills: bills.length > 0,
  };
}

function currencyFor(country) {
  if (!country) return null;
  const normalized = String(country).trim().toLowerCase();
  if (['br', 'brazil', 'brasil'].includes(normalized)) return 'BRL';
  if (['us', 'usa', 'ca', 'united states', 'united states of america', 'canada'].includes(normalized)) return 'USD';
  if (['es', 'it', 'fr', 'de', 'pt', 'at', 'be', 'cy', 'ee', 'fi', 'gr', 'ie', 'lt', 'lu', 'lv', 'mt', 'nl', 'si', 'sk', 'hr',
    'spain', 'españa', 'espana', 'italy', 'italia', 'france', 'germany', 'deutschland', 'portugal', 'austria',
    'österreich', 'belgium', 'cyprus', 'estonia', 'finland', 'greece', 'ireland', 'lithuania', 'luxembourg',
    'latvia', 'malta', 'netherlands', 'nederland', 'slovenia', 'slovakia', 'croatia'].includes(normalized)) return 'EUR';
  return null;
}

async function generateWeeklyReportHTML(restaurantId, language = 'pt-BR', requestedRange) {
  const { config, range, reservations, services, timeZone } = await fetchReportData(restaurantId, requestedRange);
  const locale = localeFor(language);
  const copy = COPY[locale];
  const formatDate = iso => new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
  const stats = buildStats(reservations, services);
  const currency = currencyFor(config.country);
  const money = currency ? new Intl.NumberFormat(locale, { style: 'currency', currency }) : null;
  const revenueDisplay = !stats.hasBills ? copy.noRevenue : money
    ? money.format(stats.revenue)
    : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(stats.revenue)} (${copy.currencyUnknown})`;
  const name = escapeHtml(config.restaurant_name || 'Seatable');
  const counts = new Map();
  for (const row of reservations) counts.set(row.date, (counts.get(row.date) || 0) + 1);
  const days = [];
  for (let date = range.start; date <= range.end; date = shiftDate(date, 1)) {
    days.push(`<tr><td>${escapeHtml(formatDate(date))}</td><td>${counts.get(date) || 0}</td></tr>`);
  }
  const generated = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date());

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<title>${copy.title} — ${name}</title><style>
@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#292421;background:#FAFAF9}
h1{font:normal 30px Georgia,serif;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#706A65;margin:32px 0 12px}
header{border-bottom:1px solid #DCD6D0;padding-bottom:18px}header p{margin:5px 0;color:#706A65}.brand{font-weight:700;letter-spacing:.08em}
.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;padding:20px 0}.metric{border-top:1px solid #DCD6D0;padding-top:10px}
.metric span{display:block;font-size:12px;color:#706A65}.metric strong{font:normal 27px Georgia,serif}
table{width:100%;border-collapse:collapse}th,td{padding:8px 0;text-align:left;border-bottom:1px solid #E8E2DC}th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#706A65}
footer{border-top:1px solid #DCD6D0;padding-top:12px;margin-top:28px;color:#706A65;font-size:11px}
</style></head><body><header><div class="brand">seatable.</div><h1>${copy.title}</h1>
<p>${name} · ${escapeHtml(formatDate(range.start))} – ${escapeHtml(formatDate(range.end))}</p></header>
<div class="metrics">
<div class="metric"><span>${copy.reservations}</span><strong>${stats.reservations}</strong></div>
<div class="metric"><span>${copy.covers}</span><strong>${stats.covers}</strong></div>
<div class="metric"><span>${copy.noShows}</span><strong>${stats.noShows}</strong></div>
<div class="metric"><span>${copy.cancellations}</span><strong>${stats.cancellations}</strong></div>
<div class="metric"><span>${copy.revenue}</span><strong>${escapeHtml(revenueDisplay)}</strong></div>
</div><p>${copy.note}</p>${stats.reservations === 0 && services.length === 0 ? `<p>${copy.empty}</p>` : ''}
<h2>${copy.reservations}</h2><table><thead><tr><th>${copy.day}</th><th>${copy.count}</th></tr></thead>
<tbody>${days.join('')}</tbody></table><footer>${copy.generated} ${escapeHtml(generated)} · seatable.one</footer>
</body></html>`;
}

function rendererUrl() {
  const configured = process.env.GOTENBERG_URL;
  if (!configured) throw new Error('PDF renderer is not configured');
  const url = new URL(configured);
  if (url.protocol !== 'https:') throw new Error('PDF renderer requires HTTPS');
  if (url.hostname === 'demo.gotenberg.dev') throw new Error('Public demo renderer is not permitted');
  return `${url.toString().replace(/\/$/, '')}/forms/chromium/convert/html`;
}

async function generateWeeklyReportPDF(restaurantId, language = 'pt-BR', range) {
  const url = rendererUrl();
  const html = await generateWeeklyReportHTML(restaurantId, language, range);
  const formData = new FormData();
  formData.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  const response = await fetch(url, {
    method: 'POST', body: formData, signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`PDF renderer failed (${response.status})`);
  return response.arrayBuffer();
}

async function uploadReportToStorage(buffer, restaurantId, range = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = range.start_date && range.end_date ? `${range.start_date}-${range.end_date}` : date;
  const filename = `${restaurantId}/period-${suffix}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET)
    .upload(filename, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error('Report upload failed');
  const { data, error: urlError } = await supabaseAdmin.storage.from(STORAGE_BUCKET)
    .createSignedUrl(filename, 86400);
  if (urlError || !data?.signedUrl) throw new Error('Report URL unavailable');
  return data.signedUrl;
}

async function sendWeeklyReportViaWhatsApp(restaurantId, phone, language = 'pt-BR', range) {
  try {
    const pdf = await generateWeeklyReportPDF(restaurantId, language, range);
    const url = await uploadReportToStorage(pdf, restaurantId, range);
    const copy = COPY[localeFor(language)];
    const label = range?.start_date && range?.end_date
      ? `${range.start_date} – ${range.end_date}`
      : new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' }).format(new Date());
    const result = await sendWhatsAppDocumentMessage(phone, url, `${copy.caption} — ${label}`, 'seatable-report.pdf');
    if (!result?.success) throw new Error(result?.error || 'WhatsApp delivery failed');
    return { success: true, url };
  } catch (error) {
    logger.error('Report WhatsApp delivery failed', { restaurantId, error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = {
  resolveReportRange, generateWeeklyReportHTML, generateWeeklyReportPDF,
  uploadReportToStorage, sendWeeklyReportViaWhatsApp,
};
