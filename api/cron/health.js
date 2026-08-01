/**
 * Cron Health Monitoring Endpoint
 *
 * GET /api/cron/health
 *
 * Returns the health status of all cron jobs by comparing their last run
 * timestamp against expected schedule intervals. Secured with CRON_SECRET.
 *
 * Status levels:
 * - healthy: ran within expected window
 * - stale: missed 2+ expected intervals
 * - never_run: no record in cron_runs table
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('CronHealth');

// Expected cron jobs with their schedule intervals in minutes
// Derived from vercel.json crons configuration
const CRON_JOBS = [
  { name: 'check-late-reservations', intervalMinutes: 15 },     // */15
  { name: 'send-campaigns', intervalMinutes: 15 },              // */15
  { name: 'send-feedback', intervalMinutes: 30 },               // hourly (top of hour → 60, but 30min tolerance)
  { name: 'send-surveys', intervalMinutes: 60 },                // hourly (:30)
  { name: 'send-reminders', intervalMinutes: 1440 },            // daily
  { name: 'update-churn-scores', intervalMinutes: 1440 },       // daily
  { name: 'report-usage', intervalMinutes: 1440 },              // daily
  { name: 'generate-reflections', intervalMinutes: 1440 },      // daily
  { name: 'demo-nurture', intervalMinutes: 1440 },              // daily
  { name: 'cleanup-expired-demos', intervalMinutes: 1440 },     // daily
  { name: 'warm-seo-cache', intervalMinutes: 1440 },            // daily
  { name: 'manager-briefings-morning', intervalMinutes: 1440 },
  { name: 'manager-briefings-eod', intervalMinutes: 1440 },
  { name: 'manager-alerts-low-covers', intervalMinutes: 1440 },
  { name: 'manager-alerts-high-noshows', intervalMinutes: 1440 },
  { name: 'manager-alerts-late-cancellations', intervalMinutes: 120 }, // every 2h
  { name: 'proactive-comms', intervalMinutes: 10080 },          // weekly
  { name: 'refresh-restaurant-profiles', intervalMinutes: 10080 }, // weekly
  { name: 'pre-reservation-upsell', intervalMinutes: 1440 },    // daily
  { name: 'analytics-briefing', intervalMinutes: 1440 },        // daily
  { name: 'cleanup-waitlist', intervalMinutes: 1440 },           // daily
  { name: 'automated-campaigns', intervalMinutes: 1440 },       // daily
  { name: 'health-alert', intervalMinutes: 1440 },              // daily

  // MOTOR DA OLÍMPIA (adicionados 01/08/2026). Estes já gravavam em cron_runs
  // — prospect-flush com 114 execuções em 3 dias — mas não estavam aqui, então
  // o vigia e o alerta de WhatsApp nunca os avaliavam. Era o único conjunto de
  // jobs sem watchdog, e justamente o que precisava: o incidente do Coco Bambu
  // foi um lead 15h sem resposta com o painel todo verde.
  //
  // TOLERÂNCIA: getStatus marca stale em 2× o intervalo, e estes dois NÃO rodam
  // 24/7 — declarar o intervalo nominal faria o alarme gritar toda madrugada e
  // todo fim de semana, e alarme que grita à toa é alarme desligado. O valor é
  // "maior folga legítima ÷ 2".
  // Os valores dão folga ACIMA do gap legítimo, não igual a ele: tolerância
  // exata empata com a madrugada honesta e alerta por milissegundos.
  { name: 'prospect-flush', intervalMinutes: 480 },             // 15min, só 12-22 UTC → gap de 14h, tolera 16h
  { name: 'prospect-nudge', intervalMinutes: 2100 },            // horário, 13-21 UTC seg-sex → gap de 64h, tolera 70h
  { name: 'prospect-handoff-digest', intervalMinutes: 1440 },   // diário
  { name: 'prospect-score-outcomes', intervalMinutes: 1440 },   // diário
];

function getStatus(lastRanAt, intervalMinutes) {
  if (!lastRanAt) return 'never_run';

  const now = Date.now();
  const lastRan = new Date(lastRanAt).getTime();
  const elapsed = now - lastRan;
  const toleranceMs = intervalMinutes * 60 * 1000 * 2; // 2x interval = stale

  return elapsed <= toleranceMs ? 'healthy' : 'stale';
}

function formatAge(lastRanAt) {
  if (!lastRanAt) return null;

  const mins = Math.floor((Date.now() - new Date(lastRanAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

/**
 * Core health check logic — reusable by health-alert.js
 * @returns {{ overall, summary, jobs, checked_at }} or null if DB unavailable
 */
async function checkCronHealth() {
  if (!supabaseAdmin) {
    return null;
  }

  const { data: runs, error } = await supabaseAdmin
    .from('cron_runs')
    .select('job_name, ran_at, meta')
    .gte('ran_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order('ran_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.warn('Failed to query cron_runs', { error: error.message });
    return null;
  }

  // Build lookup maps: job_name -> latest ran_at, job_name -> error count (14d)
  const lastRunMap = {};
  const errorCountMap = {};
  for (const run of (runs || [])) {
    if (!lastRunMap[run.job_name]) {
      lastRunMap[run.job_name] = run.ran_at;
    }
    if (run.meta && run.meta.status === 'error') {
      errorCountMap[run.job_name] = (errorCountMap[run.job_name] || 0) + 1;
    }
  }

  // Evaluate each job
  const jobs = CRON_JOBS.map(job => {
    const lastRanAt = lastRunMap[job.name] || null;
    const status = getStatus(lastRanAt, job.intervalMinutes);
    const errorCount = errorCountMap[job.name] || 0;

    return {
      name: job.name,
      status,
      last_ran_at: lastRanAt,
      age: formatAge(lastRanAt),
      interval_minutes: job.intervalMinutes,
      errors_14d: errorCount,
    };
  });

  // Overall status
  const staleCount = jobs.filter(j => j.status === 'stale').length;
  const neverRunCount = jobs.filter(j => j.status === 'never_run').length;
  const healthyCount = jobs.filter(j => j.status === 'healthy').length;
  const totalErrors = jobs.reduce((sum, j) => sum + j.errors_14d, 0);

  let overall = 'healthy';
  if (staleCount > 0) overall = 'degraded';
  if (staleCount > 3) overall = 'critical';
  if (neverRunCount === jobs.length) overall = 'not_tracking';

  return {
    overall,
    summary: {
      healthy: healthyCount,
      stale: staleCount,
      never_run: neverRunCount,
      errors_14d: totalErrors,
      total: jobs.length,
    },
    jobs,
    checked_at: new Date().toISOString(),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: CRON_SECRET Bearer token.
  // HH.1 — constant-time compare (EE.1 missed this site).
  const { bearerEquals } = require('../_lib/secure-compare');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (!bearerEquals(req.headers.authorization, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const result = await checkCronHealth();

    if (!result) {
      const jobs = CRON_JOBS.map(job => ({
        name: job.name,
        status: 'never_run',
        last_ran_at: null,
        age: null,
        interval_minutes: job.intervalMinutes,
      }));

      return res.status(200).json({
        overall: 'unknown',
        message: 'cron_runs table may not exist yet. Run the migration first.',
        jobs,
        checked_at: new Date().toISOString(),
      });
    }

    logger.info('Cron health check', {
      overall: result.overall,
      healthy: result.summary.healthy,
      stale: result.summary.stale,
      never_run: result.summary.never_run,
      errors_14d: result.summary.errors_14d,
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error('Cron health check failed', { error: err.message });
    return res.status(500).json({ error: 'Health check failed' });
  }
}

// Export handler as default + checkCronHealth for internal use
module.exports = handler;
module.exports.checkCronHealth = checkCronHealth;
// Expostos para teste: o registro é a única coisa que decide se um job é
// vigiado, e a tolerância é onde mora a sutileza (jobs de janela limitada).
module.exports.CRON_JOBS = CRON_JOBS;
module.exports.getStatus = getStatus;
