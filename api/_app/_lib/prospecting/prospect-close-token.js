'use strict';

/**
 * Signed one-tap "já fechei" tokens for the founder digest.
 *
 * The digest is an e-mail: there is no session to authenticate against, so the
 * token IS the credential. HMAC-SHA256 over `${leadId}.${exp}` with a server-side
 * secret — unforgeable without the secret, scoped to ONE lead and ONE action
 * (mark as won), and self-expiring so an old digest in the founder's archive
 * can't be replayed months later.
 *
 * PURE + deterministic (same leadId + exp + secret → same token), so it unit
 * tests without a DB, a mail server or a clock.
 *
 * The endpoint that consumes this (api/prospect-close.js) still only mutates on
 * POST: e-mail link scanners prefetch GET URLs, and a prefetch must never close
 * a deal.
 */

const crypto = require('crypto');
const { secureEquals } = require('../secure-compare');

// 14 days: long enough that a digest sitting in the inbox over a holiday still
// works, short enough that a leaked archive stops being useful.
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Domain separation: the same CRON_SECRET signs other things (unsubscribe links,
// cron bearers). Prefixing the payload means a signature minted here can never be
// replayed as one of those.
const LABEL = 'prospect-close:v1:';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dedicated secret if set, else the cron secret. Null when neither is configured. */
function resolveSecret(secret) {
  return secret || process.env.PROSPECTING_CLOSE_SECRET || process.env.CRON_SECRET || null;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(LABEL + payload).digest('base64url');
}

/**
 * Mint a one-tap token for a lead. Returns null when the lead id is unusable or
 * no secret is configured — callers render the digest without the button rather
 * than shipping a link that can't work.
 * @param {string} leadId  UUID of the prospect lead
 * @param {{nowMs?: number, ttlMs?: number, secret?: string}} [opts]
 * @returns {string|null}
 */
function signCloseToken(leadId, { nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS, secret } = {}) {
  const s = resolveSecret(secret);
  if (!s || !UUID_RE.test(String(leadId || ''))) return null;
  const payload = `${leadId}.${nowMs + ttlMs}`;
  return `${payload}.${sign(payload, s)}`;
}

/**
 * Verify a one-tap token. Signature is checked in constant time BEFORE the
 * expiry, so a wrong signature and a stale one are indistinguishable in timing.
 * @param {unknown} token
 * @param {{nowMs?: number, secret?: string}} [opts]
 * @returns {{valid: boolean, leadId?: string, expMs?: number, reason?: string}}
 */
function verifyCloseToken(token, { nowMs = Date.now(), secret } = {}) {
  const s = resolveSecret(secret);
  if (!s) return { valid: false, reason: 'sem_segredo' };
  if (typeof token !== 'string' || !token) return { valid: false, reason: 'ausente' };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'formato' };
  const [leadId, expStr, sig] = parts;
  if (!UUID_RE.test(leadId)) return { valid: false, reason: 'formato' };

  if (!secureEquals(sig, sign(`${leadId}.${expStr}`, s))) return { valid: false, reason: 'assinatura' };

  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || nowMs > expMs) return { valid: false, reason: 'expirado' };

  return { valid: true, leadId, expMs };
}

/**
 * Full one-tap URL for a lead, or null when it can't be signed.
 * @param {string} leadId
 * @param {{baseUrl?: string, nowMs?: number, ttlMs?: number, secret?: string}} [opts]
 */
function closeUrlFor(leadId, { baseUrl = process.env.CLIENT_URL || 'https://seatable.one', ...rest } = {}) {
  const token = signCloseToken(leadId, rest);
  if (!token) return null;
  return `${String(baseUrl).replace(/\/$/, '')}/api/prospect-close?t=${encodeURIComponent(token)}`;
}

module.exports = { signCloseToken, verifyCloseToken, closeUrlFor, DEFAULT_TTL_MS };
