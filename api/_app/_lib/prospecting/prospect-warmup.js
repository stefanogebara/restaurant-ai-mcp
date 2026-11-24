'use strict';

/**
 * Daily send cap / warm-up throttle for cold outreach.
 *
 * Cold B2B WhatsApp at volume risks the number's Meta quality rating and the
 * per-number messaging tier. We cap sends per UTC day and consume-before-send
 * (fail-closed): the slot is reserved before the message goes out, so a crash
 * mid-send can only UNDER-count, never over-send. Backed by Upstash when
 * configured, with an in-memory fallback (single-instance dev).
 *
 * Olivia ran the same warm-up concept on a Postgres advisory lock; on Vercel,
 * Upstash INCR+EXPIRE is the natural primitive (mirrors rate-limit.js).
 */

const { createSecureLogger } = require('../secure-logger');
const { createRedisClient } = require('../redis-client');

const logger = createSecureLogger('ProspectWarmup');

const redis = createRedisClient('ProspectWarmup');

// In-memory fallback: { dayKey -> count }. Reset implicitly as the key rolls over.
const memCounts = new Map();

/**
 * Teto duro do teto: nenhuma fonte de configuração pode passar daqui. Este
 * número governa quantas mensagens FRIAS saem do WhatsApp da empresa por dia,
 * e a reputação do número é ativo caro e lento de recuperar. É o mesmo valor
 * do topo da rampa, por construção.
 */
const TETO_ABSOLUTO = 250;

const capValido = (v) => Number.isInteger(v) && v > 0 && v <= TETO_ABSOLUTO;

/**
 * PURA: decide o teto do dia e de ONDE ele veio.
 *
 * Precedência banco > env > rampa. O banco ganha do env de propósito: mudar o
 * ritmo da prospecção não deveria exigir redeploy, e o cockpit precisa poder
 * mostrar o valor que está valendo de verdade em vez de uma nota escrita à mão.
 *
 * Valor fora da faixa é RECUSADO, não ajustado. Clampe silencioso (1000 virar
 * 250) esconderia o dedo gordo e deixaria a pessoa achando que configurou o
 * que não configurou; recusar mantém o teto anterior e devolve o valor
 * recusado para quem chamou registrar.
 *
 * @param {{dbCap:*, envCap:*, rampa:*}} fontes
 * @returns {{cap:number, origem:'banco'|'env'|'rampa'|'piso', recusado?:number}}
 */
function resolverCap({ dbCap, envCap, rampa }) {
  if (capValido(dbCap)) return { cap: dbCap, origem: 'banco' };
  const recusado = (typeof dbCap === 'number' && Number.isFinite(dbCap) && dbCap > TETO_ABSOLUTO) ? dbCap : undefined;
  if (capValido(envCap)) return { cap: envCap, origem: 'env', ...(recusado ? { recusado } : {}) };
  if (capValido(rampa)) return { cap: rampa, origem: 'rampa', ...(recusado ? { recusado } : {}) };
  return { cap: 40, origem: 'piso', ...(recusado ? { recusado } : {}) };
}

/**
 * PURE: warm-up ramp by days since the first outbound. Conservative start,
 * ceiling at 250 — Meta's business-initiated floor for an unverified number.
 */
function rampCap(dias) {
  const d = Number.isFinite(dias) && dias >= 0 ? dias : 0;
  if (d < 2) return 40;
  if (d < 4) return 60;
  if (d < 6) return 90;
  if (d < 8) return 120;
  if (d < 10) return 150;
  if (d < 12) return 200;
  return 250;
}

// First-outbound day, cached 10 min — drives the ramp. The message log is the
// source of truth (the earlier redis SETNX seeded TODAY on first run, which
// silently restarted the ramp; a MIN query per cache window is negligible).
let _firstSend = { iso: null, at: 0 };
async function firstSendIso() {
  if (_firstSend.iso && Date.now() - _firstSend.at < 10 * 60 * 1000) return _firstSend.iso;
  let iso;
  try {
    const { supabaseAdmin } = require('../supabase');
    const { data } = await supabaseAdmin.from('prospect_messages')
      .select('enviada_em').eq('direcao', 'out')
      .order('enviada_em', { ascending: true }).limit(1);
    iso = (data && data[0] && data[0].enviada_em) ? data[0].enviada_em.slice(0, 10) : new Date().toISOString().slice(0, 10);
  } catch { iso = new Date().toISOString().slice(0, 10); }
  _firstSend = { iso, at: Date.now() };
  return iso;
}

/**
 * Today's cap: PROSPECTING_DAILY_CAP (when set) is a fixed operator override;
 * without it the warm-up ramp applies (40 → 250 over ~2 weeks of activity).
 */
// Teto operacional vindo do banco, cacheado 60s. Custa uma linha por minuto e
// evita uma consulta por envio; 60s é rápido o bastante para uma mudança de
// ritmo valer "na hora" para quem está olhando o cockpit.
let _dbCap = { valor: null, at: 0 };
async function capDoBanco() {
  if (Date.now() - _dbCap.at < 60 * 1000) return _dbCap.valor;
  let valor = null;
  try {
    const { supabaseAdmin } = require('../supabase');
    const { data, error } = await supabaseAdmin.from('cron_config')
      .select('daily_cap').eq('job_name', 'prospecting-dispatch').limit(1);
    // Erro de leitura NÃO vira "sem teto configurado" em silêncio: registra e
    // deixa o env/rampa assumirem, que é o comportamento antigo e seguro.
    if (error) logger.error('leitura do daily_cap falhou (usando env/rampa):', error.message);
    else valor = data && data[0] ? data[0].daily_cap : null;
  } catch (err) {
    logger.error('daily_cap indisponível (usando env/rampa):', err.message);
  }
  _dbCap = { valor, at: Date.now() };
  return valor;
}

async function currentCap(nowMs = Date.now()) {
  const envBruto = parseInt(process.env.PROSPECTING_DAILY_CAP || '', 10);
  const first = await firstSendIso();
  const dias = Math.floor((nowMs - new Date(first + 'T00:00:00Z').getTime()) / 86400000);

  const r = resolverCap({
    dbCap: await capDoBanco(),
    envCap: Number.isFinite(envBruto) ? envBruto : null,
    rampa: rampCap(dias),
  });
  if (r.recusado) {
    logger.error(`daily_cap=${r.recusado} RECUSADO (teto ${TETO_ABSOLUTO}); valendo ${r.cap}/dia via ${r.origem}`);
  }
  return r.cap;
}

function dailyCap() {
  const n = parseInt(process.env.PROSPECTING_DAILY_CAP || '40', 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** UTC day key, e.g. "prospect:sendcap:2026-06-26". */
function dayKey(nowMs = Date.now()) {
  return `prospect:sendcap:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * Reserve one send slot for today. Returns { allowed, count, cap }.
 * fail-closed: increments first; if the new count exceeds the cap, the send is
 * NOT allowed (the consumed increment just keeps the day blocked).
 */
async function consumeSendSlot(nowMs = Date.now()) {
  const cap = await currentCap(nowMs);
  const key = dayKey(nowMs);
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 26 * 3600); // outlive the UTC day
      return { allowed: count <= cap, count, cap };
    } catch (err) {
      // Fail-CLOSED on infra error: do not risk over-sending cold outreach.
      logger.error('warmup consume failed (blocking send):', err.message);
      return { allowed: false, count: -1, cap };
    }
  }
  const count = (memCounts.get(key) || 0) + 1;
  memCounts.set(key, count);
  return { allowed: count <= cap, count, cap };
}

/** Read today's used count without consuming (for status/UI). */
async function usedToday(nowMs = Date.now()) {
  const key = dayKey(nowMs);
  if (redis) {
    try {
      const v = await redis.get(key);
      return Number(v) || 0;
    } catch {
      return 0;
    }
  }
  return memCounts.get(key) || 0;
}

module.exports = { consumeSendSlot, usedToday, dailyCap, currentCap, rampCap, resolverCap, TETO_ABSOLUTO };
