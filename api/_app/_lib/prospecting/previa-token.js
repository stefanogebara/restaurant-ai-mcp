'use strict';

/**
 * Token assinado do beacon da prévia FIXA (Racha).
 *
 * O demo do Racha é UM link pra todo lead (`?t=demoracha`), então a abertura
 * era invisível: dos 5 demos já enviados, ninguém sabe se algum foi aberto —
 * e sem esse fato a Olímpia não tem como fazer o follow-up "e aí, testou?".
 * Este token identifica O LEAD dentro do link fixo (`&pl=<token>`): o app do
 * Racha só repassa o valor de volta pro /api/previa-event, que verifica aqui.
 *
 * HMAC-SHA256 sobre `${leadId}.${exp}`, rótulo próprio ('racha-previa:v1:') —
 * NÃO reusa deck-token nem prospect-close-token de propósito: aqueles tokens
 * autorizam páginas/ações; este só NOMEIA um lead pra telemetria. Separação de
 * domínio garante que um `pl` vazado jamais abre proposta nem fecha negócio.
 *
 * TTL longo (90d) de propósito: a Olímpia diz "o link fica aí pra quando
 * quiserem" — e o lead abre semanas depois. Um beacon morto nesse momento é
 * exatamente a abertura que a gente mais queria ver.
 *
 * PURO: mesmo leadId + exp + secret → mesmo token. Testa sem DB e sem relógio.
 */

const crypto = require('crypto');
const { secureEquals } = require('../secure-compare');

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LABEL = 'racha-previa:v1:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSecret(secret) {
  return secret || process.env.PROSPECTING_DECK_SECRET || process.env.CRON_SECRET || null;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(LABEL + payload).digest('base64url');
}

/** @returns {string|null} token, ou null se não há segredo configurado. */
function signPreviaToken(leadId, { nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS, secret } = {}) {
  const key = resolveSecret(secret);
  if (!key || !leadId) return null;
  const exp = nowMs + ttlMs;
  const payload = `${leadId}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

/** @returns {{ ok: boolean, leadId?: string, reason?: string }} */
function verifyPreviaToken(token, { nowMs = Date.now(), secret } = {}) {
  const key = resolveSecret(secret);
  if (!key) return { ok: false, reason: 'sem_segredo' };
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'ausente' };

  const partes = token.split('.');
  if (partes.length !== 3) return { ok: false, reason: 'malformado' };

  const [leadId, expStr, assinatura] = partes;
  if (!UUID_RE.test(leadId)) return { ok: false, reason: 'lead_invalido' };

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'exp_invalido' };

  // Assinatura ANTES da expiração: comparar tempo de um token não autenticado
  // vazaria que o formato estava certo. Sempre em tempo constante.
  const esperada = sign(`${leadId}.${expStr}`, key);
  if (!secureEquals(assinatura, esperada)) return { ok: false, reason: 'assinatura_invalida' };
  if (nowMs > exp) return { ok: false, reason: 'expirado' };

  return { ok: true, leadId };
}

module.exports = { signPreviaToken, verifyPreviaToken, DEFAULT_TTL_MS, LABEL };
