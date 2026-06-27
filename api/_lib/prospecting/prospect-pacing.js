'use strict';

/**
 * Human reply pacing. Ported from olivia_pacing.ts.
 *
 * The biggest "this is a bot" tell isn't the TEXT (the prompt is good) — it's
 * the RHYTHM. A reply that lands in <1s, 24/7, gives it away. We compute a delay
 * proportional to reply length (simulate reading + typing) with a floor, ceiling
 * and jitter. The ceiling keeps us within the serverless execution budget; the
 * delay is idle wait (no CPU — cheap under Active-CPU billing).
 */

const DEFAULTS = { minMs: 1800, maxMs: 9000, msPorChar: 28, jitter: 0.2 };

/**
 * Delay (ms) the agent "takes" to reply to a message of `texto`. Proportional to
 * length + jitter, always within [minMs, maxMs]. Pass { rand } for determinism.
 */
function pacingDelayMs(texto, opts = {}) {
  if (opts.disabled || opts.dryRun || opts.testMode) return 0;
  const minMs = opts.minMs ?? DEFAULTS.minMs;
  const maxMs = opts.maxMs ?? DEFAULTS.maxMs;
  const msPorChar = opts.msPorChar ?? DEFAULTS.msPorChar;
  const jitter = opts.jitter ?? DEFAULTS.jitter;
  const rand = opts.rand || Math.random;
  const len = String(texto || '').trim().length;
  const base = minMs + len * msPorChar;
  const fator = 1 + (rand() * 2 - 1) * jitter;
  return Math.round(Math.max(minMs, Math.min(maxMs, base * fator)));
}

/** Split a reply into 1..maxParts bubbles on blank lines (opt-in via multipart). */
function splitReplyParts(texto, opts = {}) {
  const full = String(texto || '').trim();
  if (!full) return [];
  if (!opts.multipart) return [full];
  const maxParts = opts.maxParts ?? 3;
  const parts = full.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1 || parts.length > maxParts) return [full];
  return parts;
}

module.exports = { pacingDelayMs, splitReplyParts };
