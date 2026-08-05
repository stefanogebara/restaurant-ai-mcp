'use strict';

/**
 * Cron: prospect-dispatch — a intro fria sai sozinha.
 *
 * POR QUE ESTE ARQUIVO EXISTE: até 05/08/2026 nenhum cron disparava intro.
 * O `dispatchIntros` só tinha dois chamadores, ambos manuais (o endpoint
 * POST /api/prospect-dispatch e o botão do cockpit), e o histórico de envios
 * mostrava a assinatura disso: 0, 1, 2, 12, 1, 11, 2, 25, 67, 0 por dia. Dente
 * de serra é gente lembrando, não máquina rodando. O teto diário existia,
 * a fila existia, e mesmo assim a prospecção parava quando o fundador parava.
 *
 * POR QUE UM HANDLER NOVO EM VEZ DE AGENDAR O QUE JÁ EXISTIA: cron da Vercel
 * chama por GET, e /api/prospect-dispatch é POST-only de propósito (é o
 * endpoint de operador, e POST-only é parte da defesa contra chamada
 * acidental). Abrir GET lá enfraqueceria essa guarda; este handler é a porta
 * do cron, com a mesma autenticação por CRON_SECRET.
 *
 * QUEM SEGURA O VOLUME: não é este arquivo. O `limit` daqui é só o tamanho do
 * lote por execução. O teto do dia é o `currentCap()` (cron_config.daily_cap,
 * hoje 100), consumido slot a slot antes de cada envio. O sequencer também
 * recusa fora da janela 10-17 BRT e quando o disjuntor de qualidade cai.
 *
 * Agenda (vercel.json): de hora em hora, 13-20 UTC (10-17 BRT), seg-sex. Oito
 * execuções por dia; a janela e o cap fazem o resto. Hora em hora e não */15
 * porque o trabalho aqui é limitado pelo cap diário, não por urgência.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { getProspectingPhoneNumberId } = require('../_lib/prospecting/routing');
const { dispatchIntros } = require('../_lib/prospecting/sequencer');

const logger = createSecureLogger('CronProspectDispatch');

/** Lote por execução. O teto do DIA é o currentCap(), não este número. */
const LOTE = 20;

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Chave de operação: o mesmo interruptor que o disjuntor de qualidade usa
  // para pausar disparo sozinho (prospect-receipts). Sem redeploy.
  if (!(await isCronEnabled('prospecting-dispatch'))) {
    await logCronRun('prospect-dispatch', { skipped: 'disabled_by_ops' });
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }
  if (!getProspectingPhoneNumberId()) {
    await logCronRun('prospect-dispatch', { skipped: 'prospecting_not_configured' });
    return res.status(200).json({ success: true, skipped: 'prospecting_not_configured' });
  }

  try {
    // `force` NUNCA aqui: a janela 10-17 BRT é a proteção de horário, e um
    // cron que a ignora tornaria a agenda do vercel.json a única barreira.
    const summary = await dispatchIntros({ limit: LOTE });
    await logCronRun('prospect-dispatch', summary);
    logger.info('cron dispatch done', summary);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    logger.error('cron dispatch failed:', err.message);
    await logCronError('prospect-dispatch', err);
    return res.status(500).json({ success: false, error: 'Dispatch failed' });
  }
};
