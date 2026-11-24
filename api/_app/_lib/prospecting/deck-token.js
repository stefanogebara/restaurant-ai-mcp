'use strict';

/**
 * Token assinado da proposta personalizada (a "apresentação" por prospect).
 *
 * O link vai num e-mail frio e é encaminhado internamente, então não há sessão
 * para autenticar: o token É a credencial. HMAC-SHA256 sobre `${leadId}.${exp}`.
 *
 * POR QUE NÃO REUSA prospect-close-token: aquele assina com o rótulo
 * 'prospect-close:v1:' e autoriza UMA ação destrutiva de funil (marcar o lead
 * como ganho). Separação de domínio é justamente o ponto — uma assinatura
 * cunhada aqui, num link que circula por e-mail corporativo e pode ser
 * encaminhado a estranhos, jamais pode valer como "fechar negócio" lá. Os dois
 * módulos DEVEM divergir; isto não é cópia acidental.
 *
 * TTL longo de propósito: gerência encaminha internamente e a pessoa abre duas
 * semanas depois. Um link morto nesse momento é a proposta morrendo de sede.
 *
 * PURO: mesmo leadId + exp + secret → mesmo token. Testa sem DB e sem relógio.
 */

const crypto = require('crypto');
const { secureEquals } = require('../secure-compare');

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LABEL = 'racha-deck:v1:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSecret(secret) {
  return secret || process.env.PROSPECTING_DECK_SECRET || process.env.CRON_SECRET || null;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(LABEL + payload).digest('base64url');
}

/** @returns {string|null} token, ou null se não há segredo configurado. */
function signDeckToken(leadId, { nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS, secret } = {}) {
  const key = resolveSecret(secret);
  if (!key || !leadId) return null;
  const exp = nowMs + ttlMs;
  const payload = `${leadId}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

/** @returns {{ ok: boolean, leadId?: string, reason?: string }} */
function verifyDeckToken(token, { nowMs = Date.now(), secret } = {}) {
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

/** URL pública da proposta personalizada deste lead. */
function deckUrlFor(leadId, { nowMs = Date.now(), baseUrl, ttlMs, secret } = {}) {
  const token = signDeckToken(leadId, { nowMs, ttlMs, secret });
  if (!token) return null;
  const base = baseUrl || process.env.PROSPECTING_DECK_BASE_URL || 'https://seatable.one';
  return `${base.replace(/\/+$/, '')}/proposta?t=${encodeURIComponent(token)}`;
}

module.exports = { signDeckToken, verifyDeckToken, deckUrlFor, DEFAULT_TTL_MS, LABEL };
