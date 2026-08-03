/**
 * Saúde dos crons — LÓGICA, sem HTTP.
 *
 * Mora em _lib/ de propósito. O painel da Olímpia precisa destes dados, e
 * prospect-admin.js não pode dar require em api/cron/health.js: a NFT da Vercel
 * DERRUBA em silêncio a função que importa um handler irmão, sem erro de build
 * (foi assim que /api/demo virou 404 em jun/2026). Handler fino lá, lógica aqui.
 */

const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

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
  { name: 'prospect-enrich', intervalMinutes: 60 },             // horário, 24/7 → gap de 1h, tolera 2h

  // O RESTO DA CASA (adicionados 03/08/2026). Depois do motor da Olímpia,
  // estes eram os últimos do vercel.json fora do vigia. Todos JÁ gravavam em
  // cron_runs — só ninguém os avaliava, então uma parada passaria em silêncio.
  //
  // Os dois de conversa são os que mais doem se pararem: sync-conversation-data
  // puxa transcrição de voz ANTES da janela de expurgo de 48h da ElevenLabs, e
  // o que não for puxado a tempo some para sempre.
  { name: 'sync-conversation-data', intervalMinutes: 60 },      // horário, 24/7
  { name: 'validate-conversations', intervalMinutes: 60 },      // horário, 24/7
  // NOME DO TRACKER, não do arquivo: api/cron/monitor-meta-token-expiry.js
  // grava em cron_runs como 'check-meta-token-expiry' (65 execuções lá com esse
  // nome). Registrar pelo nome do arquivo — que foi o que eu fiz na primeira
  // versão deste commit — deixaria o job em 'never_run' para sempre, e
  // 'never_run' NÃO dispara alerta: vigia decorativo.
  { name: 'check-meta-token-expiry', intervalMinutes: 1440 }, // diário 10:05
  { name: 'cleanup-whatsapp-dedup', intervalMinutes: 1440 },    // diário 4:15
  { name: 'sync-stripe-connect-accounts', intervalMinutes: 1440 }, // diário 4:30
  { name: 'compile-wiki', intervalMinutes: 1440 },              // diário 4:30
  // Roda TODO DIA às 8:30 e bate ponto todo dia: o filtro de "é o dia deste
  // restaurante?" é interno ao handler, depois do logCronRun. Tolerância
  // diária, não semanal — semanal aqui seria um buraco de 6 dias.
  { name: 'weekly-report', intervalMinutes: 1440 },
  // Semanal de verdade (sábado 4:30).
  { name: 'compress-memories', intervalMinutes: 10080 },
  // Só entrou porque ganhou logCronRun neste commit — sem bater ponto, estaria
  // eternamente 'never_run', e painel que mente vermelho ensina a ignorar.
  { name: 'process-scheduled-ig-posts', intervalMinutes: 15 },  // */15
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

  // O teto NÃO é decorativo: a consulta ordena por ran_at desc, então ele
  // transforma "14 dias" na janela que couber nas N linhas mais recentes.
  // Medido em produção (01/08/2026, ~375 execuções/dia):
  //     500 linhas  -> 32h de histórico
  //    1000 linhas  -> 64.8h de histórico
  // 1000 é o TETO DO SERVIDOR: o PostgREST do Supabase corta aí, e pedir 8000
  // devolve 1000 do mesmo jeito (testado). Ou seja, nenhum número aqui compra
  // mais de ~2.7 dias — e o volume só cresce, então a janela só encolhe.
  //
  // CONSEQUÊNCIA VIVA: job de baixa frequência não cabe na janela, some do
  // lastRunMap e sai como `never_run` — que NÃO dispara alerta (health-alert.js
  // só olha `stale` e `errors_14d`). Era o never_run:4 do painel: jobs semanais
  // vivos, invisíveis. E um job semanal MORTO seria igualmente invisível.
  //
  // Solução sem migration: a varredura larga resolve os jobs frequentes numa
  // consulta só; quem não aparecer nela é perguntado individualmente. Faltantes
  // são poucos (os raros + os realmente mortos) e cada consulta é minúscula.
  const TETO_LINHAS = 1000;
  const desde = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: runs, error } = await supabaseAdmin
    .from('cron_runs')
    .select('job_name, ran_at, meta')
    .gte('ran_at', desde)
    .order('ran_at', { ascending: false })
    .limit(TETO_LINHAS);

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

  // Repescagem: ausente da janela larga ≠ nunca rodou. Sem isto, "raro" e
  // "morto" são indistinguíveis — os dois viram never_run silencioso.
  // Só vale a pena se a varredura ENCHEU o teto; se veio folgada, ela já
  // cobriu os 14 dias inteiros e quem falta de fato nunca rodou.
  if ((runs || []).length >= TETO_LINHAS) {
    const faltantes = CRON_JOBS.filter((j) => !lastRunMap[j.name]);
    for (const job of faltantes) {
      // SEM filtro de data de propósito. Com ele, um job morto há mais de 14
      // dias volta vazio e fica indistinguível de um que nunca rodou — os dois
      // viram never_run, que não alerta. Foi assim que generate-reflections
      // (cron DIÁRIO) passou 64 dias morto sem ninguém ver.
      // 20 linhas bastam: se o job tivesse mais que isso no período, teria
      // aparecido na varredura larga.
      const { data: raros } = await supabaseAdmin
        .from('cron_runs')
        .select('ran_at, meta')
        .eq('job_name', job.name)
        .order('ran_at', { ascending: false })
        .limit(20);
      if (raros && raros.length) {
        // Freshness usa a execução mais recente de qualquer época (é o que
        // separa "morto" de "inexistente"); errors_14d continua sendo 14 dias.
        lastRunMap[job.name] = raros[0].ran_at;
        errorCountMap[job.name] = raros.filter(
          (r) => r.meta && r.meta.status === 'error' && r.ran_at >= desde
        ).length;
      }
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

module.exports = { CRON_JOBS, getStatus, formatAge, checkCronHealth };
