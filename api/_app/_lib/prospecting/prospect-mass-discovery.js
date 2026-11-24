'use strict';

/**
 * Mass discovery (Phase 9): expand a territory into a Places query list and
 * execute it in serverless-sized batches with live counters.
 *
 * Fan-out sources (keyless IBGE Localidades API):
 *   bairro → 1 query (the classic single search, now 60 results via pagination)
 *   cidade → the municipality's DISTRITOS (IBGE) + zone fallbacks → N queries
 *   estado → every MUNICÍPIO of the UF (IBGE; SP = 645) → N queries, capped
 *
 * Each query costs a Places Text Search request (~US$0.032 incl. pagination
 * pages) — jobs carry a hard max_queries cap and the console shows the cost
 * estimate before starting.
 *
 * SENDABLE FILTER: leads whose Google phone is not a BR mobile can't receive
 * WhatsApp — with only_sendable (default ON) they are counted as `discarded`
 * and never enter the pool. No point discovering who we can't message.
 *
 * Execution: api/prospect-discovery-worker.js claims batches by advancing
 * `cursor` atomically (UPDATE ... WHERE cursor = :old) and self-chains until
 * done/cancelled — thousands of results in minutes, zero new crons.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { searchPlaces } = require('./places-discovery');
const { upsertDiscoveredLeads } = require('./prospect-store');

const logger = createSecureLogger('MassDiscovery');

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const ZONAS_FALLBACK = ['Centro', 'Zona Sul', 'Zona Norte', 'Zona Leste', 'Zona Oeste'];
const COST_PER_QUERY_USD = 0.032; // Text Search Pro, up to 3 pages

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function ibgeJson(path) {
  const res = await fetch(`${IBGE_BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`IBGE ${path} → ${res.status}`);
  return res.json();
}

/** All municipalities of a UF (name-sorted; IBGE has no population here). */
async function municipiosDaUf(uf) {
  const rows = await ibgeJson(`/estados/${encodeURIComponent(uf)}/municipios`);
  return rows.map((m) => ({ id: m.id, nome: m.nome }));
}

/** Districts of a municipality (by name lookup within the UF). */
async function distritosDaCidade(uf, cidade) {
  const municipios = await municipiosDaUf(uf);
  const alvo = municipios.find((m) => norm(m.nome) === norm(cidade));
  if (!alvo) return { municipio: null, distritos: [] };
  const rows = await ibgeJson(`/municipios/${alvo.id}/distritos`);
  const distritos = rows.map((d) => d.nome).filter((n) => norm(n) !== norm(cidade));
  return { municipio: alvo, distritos };
}

/**
 * PURE: assemble the query list from territory inputs + already-fetched IBGE
 * data. Separated from the fetchers so the expansion logic is unit-testable.
 *
 * @param {{mode:'bairro'|'cidade'|'estado', uf?:string, city?:string, bairro?:string, query?:string}} t
 * @param {{distritos?: string[], municipios?: Array<{nome:string}>}} geo
 * @param {number} maxQueries
 * @returns {Array<{q:string, city:string, results:number}>}
 */
function buildQueries(t, geo = {}, maxQueries = 300) {
  const base = (t.query || 'restaurantes').trim();
  const uf = (t.uf || '').trim().toUpperCase();
  const out = [];

  if (t.mode === 'bairro') {
    const q = t.bairro ? `${base} ${t.bairro.trim()}` : base;
    out.push({ q, city: uf ? `${t.city}, ${uf}` : t.city, results: 60 });
  } else if (t.mode === 'cidade') {
    const cityFull = uf ? `${t.city}, ${uf}` : t.city;
    // City-wide sweep first (highest-ranked places), then per-district depth.
    out.push({ q: base, city: cityFull, results: 60 });
    const areas = (geo.distritos && geo.distritos.length >= 3) ? geo.distritos : ZONAS_FALLBACK;
    for (const area of areas) {
      out.push({ q: `${base} ${area}`, city: cityFull, results: 60 });
    }
  } else if (t.mode === 'estado') {
    // Breadth over depth: one 20-result page per municipality covers the state
    // without exploding cost; re-run a 'cidade' job to go deep where it pays.
    for (const m of geo.municipios || []) {
      out.push({ q: base, city: `${m.nome}, ${uf}`, results: 20 });
    }
  }

  return out.slice(0, Math.max(1, maxQueries));
}

/** Expand territory (with IBGE fetches as needed) → persisted job row. */
async function createDiscoveryJob({ mode, uf, city, bairro, query, maxQueries = 300, onlySendable = true, createdBy = null }) {
  const territory = { mode, uf, city, bairro, query };
  let geo = {};
  if (mode === 'cidade') {
    if (!uf || !city) return { ok: false, error: 'uf and city required' };
    geo = await distritosDaCidade(uf, city).catch((e) => {
      logger.warn('IBGE distritos failed (zone fallback):', e.message);
      return { distritos: [] };
    });
  } else if (mode === 'estado') {
    if (!uf) return { ok: false, error: 'uf required' };
    const municipios = await municipiosDaUf(uf).catch((e) => {
      logger.error('IBGE municipios failed:', e.message);
      return null;
    });
    if (!municipios) return { ok: false, error: 'ibge_unavailable' };
    geo = { municipios };
  } else if (mode === 'bairro') {
    if (!city) return { ok: false, error: 'city required' };
  } else {
    return { ok: false, error: 'invalid mode' };
  }

  const queries = buildQueries(territory, geo, Math.min(Math.max(maxQueries, 1), 2000));
  const { data, error } = await supabaseAdmin
    .from('prospect_discovery_jobs')
    .insert({ territory, queries, only_sendable: onlySendable !== false, created_by: createdBy })
    .select('id')
    .single();
  if (error) {
    logger.error('createDiscoveryJob insert failed:', error.message);
    return { ok: false, error: 'job_insert_failed' };
  }
  return {
    ok: true,
    jobId: data.id,
    totalQueries: queries.length,
    estCostUsd: Math.round(queries.length * COST_PER_QUERY_USD * 100) / 100,
  };
}

/**
 * Execute queries from `cursor` until the time budget runs out or the job
 * finishes. Cursor advances via optimistic UPDATE (no double-processing across
 * overlapping invocations). Returns { done, remaining }.
 */
async function runDiscoveryBatch(jobId, { budgetMs = 40000 } = {}) {
  const started = Date.now();
  for (;;) {
    const { data: job, error } = await supabaseAdmin
      .from('prospect_discovery_jobs').select('*').eq('id', jobId).single();
    if (error || !job) return { done: true, remaining: 0, error: 'job_not_found' };
    if (job.status !== 'running') return { done: true, remaining: 0 };

    const queries = Array.isArray(job.queries) ? job.queries : [];
    if (job.cursor >= queries.length) {
      await supabaseAdmin.from('prospect_discovery_jobs')
        .update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', jobId);
      return { done: true, remaining: 0 };
    }
    if (Date.now() - started > budgetMs) {
      return { done: false, remaining: queries.length - job.cursor };
    }

    // Atomic claim of THIS query index — a concurrent worker that lost the
    // race just re-reads and takes the next one.
    const { data: claimed } = await supabaseAdmin
      .from('prospect_discovery_jobs')
      .update({ cursor: job.cursor + 1, updated_at: new Date().toISOString() })
      .eq('id', jobId).eq('cursor', job.cursor)
      .select('id');
    if (!Array.isArray(claimed) || claimed.length === 0) continue;

    const q = queries[job.cursor];
    try {
      const result = await searchPlaces({
        query: q.q, city: q.city, sector: 'restaurante', maxResults: q.results || 20,
      });
      if (result.ok) {
        const sendable = result.leads.filter((l) => l.whatsapp_status === 'pending');
        const toInsert = job.only_sendable ? sendable : result.leads;
        const { inserted } = await upsertDiscoveredLeads(toInsert);
        await supabaseAdmin.from('prospect_discovery_jobs').update({
          found: job.found + result.leads.length,
          inserted: job.inserted + inserted,
          sendable: job.sendable + sendable.length,
          discarded: job.discarded + (result.leads.length - sendable.length),
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
      } else if (result.error === 'places_not_configured') {
        await supabaseAdmin.from('prospect_discovery_jobs')
          .update({ status: 'error', error_detail: result.error }).eq('id', jobId);
        return { done: true, remaining: 0, error: result.error };
      }
      // Other per-query errors (quota blips, odd municipalities) are skipped —
      // one bad query must not kill a 600-query sweep.
    } catch (err) {
      logger.warn(`query ${job.cursor} failed (skipping): ${err.message}`);
    }
  }
}

module.exports = {
  buildQueries,
  createDiscoveryJob,
  runDiscoveryBatch,
  municipiosDaUf,
  distritosDaCidade,
  COST_PER_QUERY_USD,
  ZONAS_FALLBACK,
};
