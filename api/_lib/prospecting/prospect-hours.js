'use strict';

/**
 * Business-hours gate for the prospecting agent. Ported from olivia_horario.ts.
 *
 * Replying to cold outreach at 3am gives away the bot as much as replying in
 * <1s. Outside business hours the agent does NOT reply immediately — it defers
 * to the next opening (the prospect-flush cron sends when business hours open;
 * Phase 2). Everything is computed in the configured timezone via Intl so it's
 * independent of the (UTC) serverless runtime.
 */

const PADRAO = { tz: 'America/Sao_Paulo', dias: [1, 2, 3, 4, 5], inicio: 9, fim: 19 };
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partesLocais(d, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday');
  const hh = parts.find((p) => p.type === 'hour');
  return { dow: DOW[wd ? wd.value : 'Mon'] ?? 1, hora: Number(hh ? hh.value : '0') % 24 };
}

/** true if `iso` falls within business hours (weekday + hour in window). */
function dentroDoHorario(iso, opts = {}) {
  const { tz, dias, inicio, fim } = { ...PADRAO, ...opts };
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const { dow, hora } = partesLocais(d, tz);
  return dias.includes(dow) && hora >= inicio && hora < fim;
}

/**
 * Next instant (ISO) INSIDE business hours from `iso`. Steps 15min at a time.
 * Only meaningful when `iso` is outside hours.
 */
function proximaAbertura(iso, opts = {}) {
  const base = iso instanceof Date ? iso : new Date(iso);
  const passo = 15 * 60 * 1000;
  let t = base.getTime();
  for (let i = 0; i < 8 * 24 * 4 + 8; i++) {
    t += passo;
    if (dentroDoHorario(t, opts)) return new Date(t).toISOString();
  }
  return new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Deferral that never crosses Meta's 24h service window: the next business
 * opening, clamped to now+22h (2h margin before the window closes). When the
 * clamp bites (weekend inbound), the reply goes out off-hours — a Sunday
 * message is unusual for a B2B seller; a dead thread is worse.
 */
const JANELA_CLAMP_MS = 22 * 60 * 60 * 1000;

function deferralDentroDaJanela(iso, opts = {}) {
  const base = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  const abertura = new Date(proximaAbertura(base, opts)).getTime();
  return new Date(Math.min(abertura, base + JANELA_CLAMP_MS)).toISOString();
}

/**
 * PURE: what to do with an inbound outside business hours, anchored on the
 * lead's 24h window (lastInMs — Meta's clock, not ours):
 *  - deadline (lastIn+22h) not reached → { acao:'adiar', replyApos: min(abertura, deadline) }
 *  - deadline reached/imminent (≤5min) → { acao:'responder' } — off-hours beats a dead thread.
 * Inside business hours callers never ask; this only arbitrates the conflict.
 */
function decisaoForaDeHorario(nowMs, lastInMs, opts = {}) {
  const anchor = Number.isFinite(lastInMs) ? lastInMs : nowMs;
  const deadline = anchor + JANELA_CLAMP_MS;
  if (nowMs >= deadline - 5 * 60 * 1000) return { acao: 'responder' };
  const abertura = new Date(proximaAbertura(nowMs, opts)).getTime();
  return { acao: 'adiar', replyApos: new Date(Math.min(abertura, deadline)).toISOString() };
}

module.exports = { dentroDoHorario, proximaAbertura, deferralDentroDaJanela, decisaoForaDeHorario, JANELA_CLAMP_MS };
