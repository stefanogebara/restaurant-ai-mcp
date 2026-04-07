/**
 * Chart Service — QuickChart.io integration
 *
 * Generates chart image URLs for WhatsApp delivery.
 * Uses QuickChart.io free API (no API key needed).
 *
 * Usage:
 *   const { buildWeeklyReservationsChart, buildNoShowChart, buildRevenueChart } = require('./chartService');
 *   const url = buildWeeklyReservationsChart(data);
 *   // Send url via WhatsApp as image
 */

const QUICKCHART_BASE = 'https://quickchart.io/chart';

const BRAND_COLORS = {
  burgundy: '#9F1239',
  burgundyLight: 'rgba(159, 18, 57, 0.3)',
  amber: '#D97706',
  amberLight: 'rgba(217, 119, 6, 0.3)',
  teal: '#0D9488',
  tealLight: 'rgba(13, 148, 136, 0.3)',
  charcoal: '#1C1917',
  cream: '#F5F0EB',
  gray: '#706A65',
};

/**
 * Build a QuickChart URL from a Chart.js config
 */
function buildChartUrl(config, { width = 800, height = 400, backgroundColor = '#FFFFFF' } = {}) {
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `${QUICKCHART_BASE}?c=${encoded}&w=${width}&h=${height}&bkg=${encodeURIComponent(backgroundColor)}&f=png`;
}

/**
 * Weekly reservations bar chart
 * @param {Array<{day: string, count: number}>} data — 7 days of reservation counts
 * @param {string} restaurantName
 */
function buildWeeklyReservationsChart(data, restaurantName) {
  const config = {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: 'Reservas',
        data: data.map(d => d.count),
        backgroundColor: BRAND_COLORS.burgundy,
        borderRadius: 4,
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: `${restaurantName} — Reservas da Semana`, font: { size: 16, family: 'Inter' }, color: BRAND_COLORS.charcoal },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: BRAND_COLORS.gray } },
        x: { grid: { display: false }, ticks: { color: BRAND_COLORS.gray } },
      },
    },
  };
  return buildChartUrl(config);
}

/**
 * No-show rate doughnut chart
 * @param {{showed: number, noShow: number, cancelled: number}} data
 * @param {string} restaurantName
 */
function buildNoShowChart(data, restaurantName) {
  const config = {
    type: 'doughnut',
    data: {
      labels: ['Compareceu', 'No-show', 'Cancelado'],
      datasets: [{
        data: [data.showed, data.noShow, data.cancelled],
        backgroundColor: [BRAND_COLORS.teal, BRAND_COLORS.burgundy, BRAND_COLORS.amber],
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: `${restaurantName} — Taxa de No-Show`, font: { size: 16 }, color: BRAND_COLORS.charcoal },
        doughnutlabel: {
          labels: [{ text: `${data.noShow + data.showed + data.cancelled}`, font: { size: 20, weight: 'bold' }, color: BRAND_COLORS.charcoal }, { text: 'total', font: { size: 12 }, color: BRAND_COLORS.gray }],
        },
      },
    },
  };
  return buildChartUrl(config, { width: 600, height: 400 });
}

/**
 * Revenue trend line chart
 * @param {Array<{day: string, revenue: number}>} data — daily revenue
 * @param {string} restaurantName
 */
function buildRevenueTrendChart(data, restaurantName) {
  const config = {
    type: 'line',
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: 'Receita (R$)',
        data: data.map(d => d.revenue),
        borderColor: BRAND_COLORS.burgundy,
        backgroundColor: BRAND_COLORS.burgundyLight,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: BRAND_COLORS.burgundy,
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: `${restaurantName} — Receita Semanal`, font: { size: 16 }, color: BRAND_COLORS.charcoal },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: BRAND_COLORS.gray, callback: (v) => 'R$' + v } },
        x: { grid: { display: false }, ticks: { color: BRAND_COLORS.gray } },
      },
    },
  };
  return buildChartUrl(config);
}

/**
 * Daily covers + capacity bar chart (stacked)
 * @param {Array<{day: string, covers: number, capacity: number}>} data
 * @param {string} restaurantName
 */
function buildOccupancyChart(data, restaurantName) {
  const config = {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [
        { label: 'Covers', data: data.map(d => d.covers), backgroundColor: BRAND_COLORS.burgundy, borderRadius: 4 },
        { label: 'Capacidade', data: data.map(d => d.capacity), backgroundColor: BRAND_COLORS.burgundyLight, borderRadius: 4 },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: `${restaurantName} — Ocupação`, font: { size: 16 }, color: BRAND_COLORS.charcoal },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: BRAND_COLORS.gray } },
        x: { grid: { display: false }, ticks: { color: BRAND_COLORS.gray } },
      },
    },
  };
  return buildChartUrl(config);
}

/**
 * Build a summary stats card image (KPI dashboard)
 * Uses QuickChart's /qr endpoint trick — actually just builds a formatted chart
 * @param {Object} stats — { reservations, noShows, revenue, avgRating }
 * @param {string} restaurantName
 */
function buildKPIDashboard(stats, restaurantName) {
  const config = {
    type: 'bar',
    data: {
      labels: ['Reservas', 'No-Shows', 'Receita (R$100)', 'Nota'],
      datasets: [{
        data: [stats.reservations, stats.noShows, Math.round(stats.revenue / 100), stats.avgRating * 10],
        backgroundColor: [BRAND_COLORS.teal, BRAND_COLORS.burgundy, BRAND_COLORS.amber, '#6366F1'],
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: `${restaurantName} — Resumo Semanal`, font: { size: 16 }, color: BRAND_COLORS.charcoal },
        legend: { display: false },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { grid: { display: false }, ticks: { color: BRAND_COLORS.charcoal, font: { size: 14, weight: 'bold' } } },
      },
    },
  };
  return buildChartUrl(config, { width: 800, height: 350 });
}

module.exports = {
  buildChartUrl,
  buildWeeklyReservationsChart,
  buildNoShowChart,
  buildRevenueTrendChart,
  buildOccupancyChart,
  buildKPIDashboard,
  BRAND_COLORS,
};
