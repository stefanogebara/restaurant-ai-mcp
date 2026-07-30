'use strict';

/**
 * POST /api/prospect-dispatch — operator-triggered cold-intro dispatch.
 *
 * Deliberately a MANUAL endpoint, not an auto-cron: cold outreach should be
 * operator-initiated (compliance + believability), not blasted on a timer. Sends
 * the approved intro template to leads that have never been contacted, bounded by
 * the warm-up daily cap. Dry-run-default-on and force-safe without a configured
 * number + template. Auth: CRON_SECRET bearer (internal tooling).
 *
 * Body: { limit? }
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { dispatchIntros } = require('./_lib/prospecting/sequencer');

const logger = createSecureLogger('ProspectDispatch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('CRON_SECRET not configured');
    return res.status(500).json({ success: false, error: 'Not configured' });
  }
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // `limit: 0` significa ZERO — e é uma sonda legítima: devolve o estado
  // (dryRun, janela, cap) sem selecionar nem enviar nada.
  //
  // A versão anterior era `parseInt(...) || 20` com piso 1, então `limit: 0`
  // virava 20 SILENCIOSAMENTE. Foi assim que uma chamada que eu acreditava
  // inofensiva disparou 20 tentativas reais de envio (30/jul). Não houve dano
  // — a Meta recusou todas porque o template não estava aprovado, e
  // `markIntro('failed')` liberou os claims — mas foi acidente, não desenho.
  // Um endpoint que envia dinheiro/mensagem não pode reinterpretar a
  // quantidade que o operador pediu.
  // `null`/`''` precisam cair no DEFAULT, não em zero: `Number(null)` é 0 e
  // `Number('')` é 0, então uma checagem só com Number.isFinite trataria
  // "campo vazio" como "não envie nada" — silencioso na direção oposta ao
  // problema original, mas igualmente enganoso.
  const bruto = (req.body || {}).limit;
  const ausente = bruto === null || bruto === undefined || bruto === '';
  const n = ausente ? NaN : Number(bruto);
  const limit = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), 100) : 20;
  // Operator override — deliberately send outside the 10-17 dispatch window.
  const force = (req.body || {}).force === true;
  try {
    const summary = await dispatchIntros({ limit, force });
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    logger.error('dispatch error:', err.message);
    return res.status(500).json({ success: false, error: 'Dispatch failed' });
  }
};
