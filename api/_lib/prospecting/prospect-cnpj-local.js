'use strict';

/**
 * CNPJ candidate generation from the LOCAL Receita Federal index (table
 * `cnpj_index`, bulk-loaded via scripts/load-rf-cnpj.mjs). Trigram name search
 * via the `buscar_cnpj_local` RPC. Ported from Olivia's `_shared/cnpj_local_search.ts`.
 * =============================================================================
 * This is the PRIMARY candidate source: it resolves names Google/SERP can't find
 * (short/generic — the biggest cause of a blank CNPJ) with ONE DB query, no
 * Scrapingdog. The data is already official → the caller skips re-confirmation
 * and goes straight to scoring. An empty index (before the ETL) → [] (degrades
 * to the SERP path).
 * =============================================================================
 *
 * @typedef {object} LocalCnpj
 * @property {string} cnpj
 * @property {string|null} razao_social
 * @property {string|null} nome_fantasia
 * @property {string|null} cep
 * @property {string|null} municipio
 * @property {string|null} uf
 * @property {string|null} bairro
 * @property {string|null} situacao
 * @property {string|null} cnae
 * @property {string|null} telefone
 * @property {string|null} porte
 * @property {boolean|null} mei
 * @property {{nome: string|null, qualificacao: string|null}[]|null} socios
 * @property {number} sim
 */

/**
 * @param {{rpc: (fn: string, args: object) => Promise<{data: unknown, error: unknown}>}} supabase
 * @param {string} nome
 * @param {string|null} cidade
 * @param {number} [limit=8]
 * @returns {Promise<LocalCnpj[]>}
 */
async function buscarCnpjLocal(supabase, nome, cidade, limit = 8) {
  const q = String(nome == null ? '' : nome).trim();
  if (q.length < 3) return []; // name too short → trigram doesn't discriminate
  try {
    const { data, error } = await supabase.rpc('buscar_cnpj_local', {
      p_nome: q,
      p_municipio: cidade == null ? null : cidade,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

module.exports = { buscarCnpjLocal };
