/**
 * Cron Health Alert — Daily WhatsApp alert if crons are unhealthy
 *
 * Schedule: Daily at 10 UTC (7 AM BRT)
 * Only sends a WhatsApp message when overall status is 'degraded' or 'critical'.
 *
 * Requires: CRON_SECRET, HEALTH_ALERT_PHONE env vars
 */

// De _lib/, NÃO de cron/health.js. Aquele é handler publicado, e dar require
// nele faria a NFT da Vercel remover do manifesto a função que puxa este
// arquivo (o despachante api/cron/run.js) — em silêncio, sem erro de build,
// com todos os crons de 60s virando 404 em produção. A lógica mora em _lib
// desde a extração de 03/ago exatamente para isto.
const { checkCronHealth } = require('../_lib/cron-health');
const { sondarIntegracoes, NIVEIS } = require('../_lib/integration-probes');
const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { logCronRun } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');
const { isCronEnabled } = require('../_lib/cron-config');

const logger = createSecureLogger('CronHealthAlert');

function buildAlertMessage(healthResult, integracoes) {
  const { overall, summary, jobs } = healthResult;

  const staleJobs = jobs.filter(j => j.status === 'stale');
  const errorJobs = jobs.filter(j => j.errors_14d > 0);

  const lines = [
    `*Cron Health Alert*`,
    `Status: ${overall.toUpperCase()}`,
    ``,
    `Healthy: ${summary.healthy} | Stale: ${summary.stale} | Never run: ${summary.never_run} | Errors (14d): ${summary.errors_14d}`,
  ];

  // Integrações quebradas vêm PRIMEIRO na mensagem: um cron atrasado é
  // incômodo; o login fora do ar é o negócio parado. Quem lê no celular às
  // 7h da manhã precisa ver isso antes de qualquer outra coisa.
  const quebradas = (integracoes?.sondas || []).filter((s) => s.nivel === NIVEIS.FALHA);
  if (quebradas.length > 0) {
    lines.push('', '*Integrações fora do ar:*');
    for (const s of quebradas) {
      lines.push(`  - ${s.nome}: ${s.detalhe}`);
    }
  }

  if (staleJobs.length > 0) {
    lines.push('', '*Stale jobs:*');
    for (const job of staleJobs) {
      lines.push(`  - ${job.name} (last: ${job.age || 'never'})`);
    }
  }

  if (errorJobs.length > 0) {
    lines.push('', '*Jobs with errors (14d):*');
    for (const job of errorJobs) {
      lines.push(`  - ${job.name}: ${job.errors_14d} errors`);
    }
  }

  return lines.join('\n');
}

module.exports = async (req, res) => {
  // Auth: CRON_SECRET only
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase Y.5 kill switch.
  if (!(await isCronEnabled('health-alert'))) {
    logger.warn('health-alert cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const healthResult = await checkCronHealth();

    if (!healthResult) {
      logger.warn('Could not run health check — DB unavailable');
      return res.status(200).json({ skipped: true, reason: 'DB unavailable' });
    }

    // Integrações entram no mesmo alerta diário. Elas já eram sondadas, mas
    // só sob demanda em /api/admin-health?integrations=1 — ou seja, alguém
    // precisava ter a ideia de ir olhar. Um diagnóstico que depende de
    // curiosidade não é vigilância.
    //
    // A sonda nunca derruba o alerta de cron: se ela mesma explodir, o alerta
    // sai só com os crons e o problema fica registrado.
    let integracoes = null;
    try {
      integracoes = await sondarIntegracoes({ deps: { supabaseAdmin } });
    } catch (err) {
      logger.error('Sondagem de integrações falhou — alerta segue só com crons', { erro: err?.message });
    }

    const integracoesQuebradas = (integracoes?.sondas || []).filter((s) => s.nivel === NIVEIS.FALHA);

    // O CANAL DE ALERTA PRECISA SER VERIFICADO NO DIA BOM.
    //
    // Sem isto, a única prova de que o alerta alcança alguém é o dia em que
    // algo quebra — e aí, se o telefone não estiver configurado, o silêncio é
    // idêntico ao de "está tudo bem". Um alerta que só se testa na emergência
    // não é vigilância, é esperança.
    //
    // Então todo dia, mesmo saudável, o cron responde se CONSEGUIRIA falar
    // com o fundador — e grita no log quando não conseguiria.
    const alertPhone = process.env.HEALTH_ALERT_PHONE;
    const podeAlertar = Boolean(alertPhone) && isWhatsAppConfigured();
    if (!podeAlertar) {
      logger.error(
        '[health-alert] CANAL DE ALERTA MUDO: este cron detecta problemas mas NÃO consegue avisar ninguém. '
        + 'Enquanto isto durar, qualquer incidente passa despercebido.',
        {
          falta_telefone: !alertPhone,
          falta_whatsapp: !isWhatsAppConfigured(),
          variavel: 'HEALTH_ALERT_PHONE',
        },
      );
    }

    const { overall } = healthResult;
    const cronRuim = overall === 'degraded' || overall === 'critical';
    const shouldAlert = cronRuim || integracoesQuebradas.length > 0;

    if (!shouldAlert) {
      logger.info('Cron health OK, no alert needed', { overall, pode_alertar: podeAlertar });
      await logCronRun('health-alert', { overall, alerted: false, pode_alertar: podeAlertar });
      return res.status(200).json({
        overall,
        alerted: false,
        integracoes_quebradas: 0,
        // Vem mesmo no dia bom: é a resposta para "o alerta me alcança?"
        pode_alertar: podeAlertar,
      });
    }

    let sent = false;

    if (podeAlertar) {
      const message = buildAlertMessage(healthResult, integracoes);
      const result = await sendWhatsAppMessage(alertPhone, message);
      sent = result.success;

      if (!result.success) {
        logger.warn('Failed to send health alert WhatsApp', { error: result.error });
      }
    } else {
      logger.warn('Health alert not sent — HEALTH_ALERT_PHONE or WhatsApp not configured');
    }

    const nomesQuebrados = integracoesQuebradas.map((s) => s.nome);
    logger.info('Cron health alert processed', { overall, sent, integracoes_quebradas: nomesQuebrados });
    await logCronRun('health-alert', {
      overall,
      alerted: true,
      whatsapp_sent: sent,
      integracoes_quebradas: nomesQuebrados,
    });

    return res.status(200).json({
      overall,
      alerted: true,
      whatsapp_sent: sent,
      pode_alertar: podeAlertar,
      summary: healthResult.summary,
      integracoes_quebradas: nomesQuebrados,
    });
  } catch (err) {
    logger.error('Health alert failed', { error: err.message });
    return res.status(500).json({ error: 'Health alert failed' });
  }
};
