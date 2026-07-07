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

/**
 * Template DISPATCH window (cold intros + follow-up touches) — TIGHTER than the
 * reply window (9-19). A cold template fired at 01:24 or in the dinner rush reads
 * as a bot and burns the number; the conversion study's #1 finding (25x) was
 * amateur send timing. Defaults to weekdays 10-17, env-tunable via
 * PROSPECTING_DISPATCH_START / PROSPECTING_DISPATCH_END.
 */
function dentroDaJanelaDisparo(iso, opts = {}) {
  const inicio = parseInt(process.env.PROSPECTING_DISPATCH_START, 10);
  const fim = parseInt(process.env.PROSPECTING_DISPATCH_END, 10);
  return dentroDoHorario(iso, {
    inicio: Number.isFinite(inicio) ? inicio : 10,
    fim: Number.isFinite(fim) ? fim : 17,
    ...opts,
  });
}

// pt-BR weekday name → 1..5 (Mon..Fri) for dated-callback parsing.
const DIA_SEMANA = { segunda: 1, terca: 2, 'terça': 2, quarta: 3, quinta: 4, sexta: 5 };

function janelaDisparoOpts() {
  const inicio = parseInt(process.env.PROSPECTING_DISPATCH_START, 10);
  const fim = parseInt(process.env.PROSPECTING_DISPATCH_END, 10);
  return {
    inicio: Number.isFinite(inicio) ? inicio : 10,
    fim: Number.isFinite(fim) ? fim : 17,
  };
}

/**
 * Turn a pt-BR "quando" phrase from a dated callback ("me chama amanhã",
 * "segunda", "depois do almoço", "às 15h") into a concrete FUTURE instant to
 * reach back, clamped into the dispatch window (weekday, 10-17 BRT). Unparseable
 * → next business morning. Brazil dropped DST in 2019, so BRT = UTC-3 is used to
 * CONSTRUCT the instant; the result is then re-clamped through the window so any
 * edge (weekend, off-hours, past time) self-corrects.
 *
 * @param {string} quando
 * @param {number} nowMs
 * @returns {string} ISO timestamp, in the future, inside the dispatch window
 */
function computeRetornoAt(quando, nowMs) {
  const s = String(quando || '').toLowerCase();
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3, no DST
  const { inicio, fim } = janelaDisparoOpts();

  // --- target hour (BRT), clamped into the window ---
  let hora = 11;
  if (/de\s*manh|pela\s*manh/.test(s)) hora = 10;
  else if (/almo[çc]o|[àa]\s*tarde|de\s*tarde/.test(s)) hora = 14;
  else if (/fim\s*da\s*tarde|final\s*da\s*tarde/.test(s)) hora = 16;
  const mHora = s.match(/(\d{1,2})\s*h/);
  if (mHora) { const h = parseInt(mHora[1], 10); if (h >= 0 && h <= 23) hora = h; }
  hora = Math.min(Math.max(hora, inicio), fim - 1);

  // --- target day (relative to the current BRT calendar day) ---
  const nowBrt = new Date(nowMs - BRT_OFFSET_MS); // shift so UTC getters read BRT
  const [Y, Mo, D, dow] = [nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate(), nowBrt.getUTCDay()];

  let diasAdiante = 1; // default: tomorrow
  const mDias = s.match(/em\s*(\d{1,2})\s*dias?/);
  const weekdayKey = Object.keys(DIA_SEMANA).find((k) => s.includes(k));
  if (/depois\s*de\s*amanh/.test(s)) diasAdiante = 2;              // check BEFORE 'amanhã'
  else if (/semana\s*que\s*vem|pr[óo]xima\s*semana/.test(s)) diasAdiante = 7;
  else if (mDias) diasAdiante = Math.min(parseInt(mDias[1], 10) || 1, 30);
  else if (weekdayKey) diasAdiante = ((DIA_SEMANA[weekdayKey] - dow + 7) % 7) || 7;
  else if (/amanh/.test(s)) diasAdiante = 1;
  else if (/hoje|mais\s*tarde|daqui\s*a\s*pouco/.test(s)) diasAdiante = 0;

  // BRT date at `hora` → UTC instant (hora + 3, no day rollover for hora ≤ 20).
  let target = Date.UTC(Y, Mo, D + diasAdiante, hora + 3, 0, 0);
  if (target <= nowMs + 60 * 1000) {
    // "hoje"/past hour → push to the next day at the same hour.
    target = Date.UTC(Y, Mo, D + Math.max(diasAdiante, 1) + (diasAdiante === 0 ? 1 : 0), hora + 3, 0, 0);
  }
  // Self-correct into a valid dispatch slot (weekend / off-hours → next opening).
  if (!dentroDoHorario(target, { inicio, fim })) {
    return proximaAbertura(target, { inicio, fim });
  }
  return new Date(target).toISOString();
}

module.exports = {
  dentroDoHorario, proximaAbertura, deferralDentroDaJanela, decisaoForaDeHorario,
  dentroDaJanelaDisparo, computeRetornoAt, JANELA_CLAMP_MS,
};
