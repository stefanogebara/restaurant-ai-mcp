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

/**
 * Split a reply into 1..maxParts bubbles on blank lines (opt-in via multipart).
 * Default cap is 2 (was 3): the live data showed 55% of our messages were
 * rapid-fire bubbles — 3-bubble volleys read as a bot spraying, not a person.
 * A reply that splits into MORE than maxParts collapses to a single bubble
 * (better one calm message than an over-eager burst).
 *
 * ESTADO EM PRODUÇÃO (31/07): DESLIGADO via PROSPECTING_MULTIPART=0. O eval-001
 * achou rajadas em ~16 de 25 threads e o prompt da persona JÁ manda o oposto
 * ("UMA mensagem por turno... NÃO quebre em várias bolhas") — código e prompt
 * se contradiziam, e o código ganhava. Desligar alinha os dois sem perder a
 * capacidade: é uma env var, reversível, e a trajetória (3 → 2 → 0) é a mesma
 * leitura de sempre — bolha extra denuncia automação.
 */
function splitReplyParts(texto, opts = {}) {
  const full = String(texto || '').trim();
  if (!full) return [];
  if (!opts.multipart) return [full];
  const maxParts = opts.maxParts ?? 2;
  const parts = full.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1 || parts.length > maxParts) return [full];
  return parts;
}

const PART_PAUSE = { minMs: 900, maxMs: 3200, msPorChar: 8, jitter: 0.2 };

/**
 * Pause (ms) between multipart bubbles — shorter than the initial read+type
 * delay (the "typist" is already warmed up): clamp(900 + len*8, [900, 3200])
 * with ±20% jitter. Ported from olivia_pacing.buildReplyPacingPlan.
 */
function partPauseDelayMs(texto, opts = {}) {
  if (opts.disabled || opts.dryRun || opts.testMode) return 0;
  const rand = opts.rand || Math.random;
  const len = String(texto || '').trim().length;
  const base = PART_PAUSE.minMs + len * PART_PAUSE.msPorChar;
  const fator = 1 + (rand() * 2 - 1) * PART_PAUSE.jitter;
  return Math.round(Math.max(PART_PAUSE.minMs, Math.min(PART_PAUSE.maxMs, base * fator)));
}

module.exports = { pacingDelayMs, splitReplyParts, partPauseDelayMs };
