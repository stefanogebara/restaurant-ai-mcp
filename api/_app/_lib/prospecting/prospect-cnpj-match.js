'use strict';

/**
 * Deterministic gates + scoring for CNPJ candidates (BR enrichment).
 * =============================================================================
 * Pure logic, no I/O — unit-tested and consumed by the `prospect-enrich`
 * waterfall. Ported faithfully from Olivia's `_shared/cnpj_match.ts`.
 *
 * WHY this exists: in production, the 3 single-candidate matches that were
 * accepted with confidence=1 (no judge) were ALL wrong — one was a CLOSED
 * company, another an auctioneer matched to a bakery. Registration status and
 * municipality already come back from the official sources, so they're an
 * explicit block BEFORE the judge. An unknown signal (null) never decides — it
 * passes through to the judge.
 * =============================================================================
 */

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

// CNPJ with optional mask (XX.XXX.XXX/XXXX-XX or 14 bare digits).
const CNPJ_RE = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;

const onlyDigits = (s) => String(s == null ? '' : s).replace(/\D/g, '');

/** CNPJ check-digit validation (mod 11). */
function cnpjValido(cnpj) {
  const c = onlyDigits(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (len) => {
    let pos = len - 7;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(c[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/**
 * Extract VALID CNPJs from the visible text of an HTML page (the business's own
 * site footer — the most direct source there is). Scripts/styles stripped; each
 * match passes the check digit; dedupe; cap 5. The caller still confirms against
 * the official source + gates + judge.
 * @param {string|null|undefined} html
 * @returns {string[]}
 */
function extrairCnpjsDeHtml(html) {
  if (!html) return [];
  const text = String(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
  const out = [];
  const seen = new Set();
  for (const m of text.match(CNPJ_RE) || []) {
    const c = onlyDigits(m);
    if (c.length === 14 && cnpjValido(c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
      if (out.length >= 5) break;
    }
  }
  return out;
}

/** ATIVA → true; BAIXADA/SUSPENSA/INAPTA/NULA → false; unknown → null. */
function situacaoAtiva(situacao) {
  if (situacao == null || String(situacao).trim() === '') return null;
  return norm(situacao).startsWith('ativ');
}

/** Same city (accent/case-insensitive) → true; different → false; missing → null. */
function cidadeCompativel(leadCidade, candMunicipio) {
  if (!leadCidade || !candMunicipio) return null;
  return norm(leadCidade) === norm(candMunicipio);
}

/**
 * Apply gates to a candidate already confirmed at the official source. Returns
 * the rejection REASON, or null if the candidate may proceed to the judge. Only
 * rejects on a POSITIVE incompatibility signal — missing data passes.
 *
 * Municipality is NOT a block here: a brand may register its HQ in another city
 * and operate a store in the lead's city (real case: "PADOCA DO GAEL LTDA" HQ in
 * Dourados/MS, store in Pinheiros/SP — the city gate killed the right match).
 * It became a score signal instead (see scoreCandidato): a different city only
 * fails when the NAME is also weak.
 *
 * @param {{cidade: string|null}} _lead
 * @param {{situacao: string|null, municipio: string|null}} cand
 * @returns {string|null}
 */
function gateCandidato(_lead, cand) {
  if (situacaoAtiva(cand.situacao) === false) {
    return `situação cadastral "${cand.situacao}" (não ATIVA)`;
  }
  return null;
}

// =============================================================================
// Deterministic candidate scoring (match precision)
// =============================================================================
// The LLM judge alone (threshold 0.5) accepted plausible-but-wrong matches:
// "Lellis Trattoria" → "BANANA BOAT BAR E LANCHES", "Criminal Burguer" → an
// "ASSESSORIA E APOIO ADMINISTRATIVO". These deterministic signals — above all
// the PHONE cross-match (the lead already carries the Google phone in ~95% of
// cases) — kill those errors before (or instead of) the judge.

// Generic trade/legal words that don't distinguish one business from another.
const STOPWORDS = new Set([
  'confeitaria', 'doceria', 'restaurante', 'bar', 'lanches', 'lanchonete', 'padaria',
  'pizzaria', 'pizzeria', 'pizza', 'hamburgueria', 'burger', 'burguer', 'pet', 'petshop', 'shop',
  'cafe', 'cafeteria', 'patisserie', 'forneria', 'bistro', 'brasserie', 'boulangerie', 'trattoria', 'comercio',
  'comercial', 'alimentos', 'alimenticios', 'servicos', 'industria', 'eireli',
  'ltda', 'me', 'epp', 'sa', 'mei', 'de', 'da', 'do', 'das', 'dos', 'e', 'the',
]);

function tokensSignificativos(s) {
  return norm(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Name similarity (0..1): Jaccard over significant tokens (no generic
 * trade/legal words). Uses the BEST of razão social and nome fantasia.
 * @param {string} leadNome
 * @param {string|null|undefined} razao
 * @param {string|null|undefined} fantasia
 * @returns {number}
 */
function nomeSimilaridade(leadNome, razao, fantasia) {
  const L = new Set(tokensSignificativos(leadNome));
  if (L.size === 0) return 0;
  const sim = (cand) => {
    if (!cand) return 0;
    const C = new Set(tokensSignificativos(cand));
    if (C.size === 0) return 0;
    let inter = 0;
    for (const t of L) if (C.has(t)) inter++;
    if (inter === 0) return 0;
    // max(coverage, jaccard): "coverage" = how much of the lead name appears in
    // the candidate (rescues a 1-word brand whose razão social has many terms,
    // e.g. "Selvvva" → "SELVVVA PLANTAS E OBJETOS…"); jaccard rewards a fair match.
    const union = new Set([...L, ...C]).size;
    const cobertura = inter / L.size;
    const jaccard = inter / union;
    return Math.max(cobertura, jaccard);
  };
  return Math.max(sim(razao), sim(fantasia));
}

/**
 * How many significant tokens of the lead name appear in the candidate (max of
 * razão/fantasia). Distinguishes a 1-generic-token match ("Central") from a
 * brand match (≥2 tokens: "padoca"+"gael").
 * @param {string} leadNome
 * @param {string|null|undefined} razao
 * @param {string|null|undefined} fantasia
 * @returns {number}
 */
function tokensComunsNome(leadNome, razao, fantasia) {
  const L = new Set(tokensSignificativos(leadNome));
  const conta = (cand) => {
    if (!cand) return 0;
    const C = new Set(tokensSignificativos(cand));
    let n = 0;
    for (const t of L) if (C.has(t)) n++;
    return n;
  };
  return Math.max(conta(razao), conta(fantasia));
}

const soDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
// National number: drop the 55 country code (keep DDD + subscriber).
const nacional = (d) => (d.length >= 12 && d.startsWith('55') ? d.slice(2) : d);

/**
 * Does the lead's phone (Google) match the candidate's REGISTERED phone at the
 * Receita? Compares the national number (DDD+subscriber), ignoring formatting/DDI.
 * An exact match is a very strong signal it's the right company.
 * @param {string|null|undefined} leadTel
 * @param {string|null|undefined} candTel
 * @returns {boolean}
 */
function telefonesBatem(leadTel, candTel) {
  const a = nacional(soDigitos(leadTel));
  const b = nacional(soDigitos(candTel));
  if (a.length < 10 || b.length < 10) return false;
  return a === b || a.slice(-8) === b.slice(-8);
}

// CNAE that is almost never a retail/food establishment (a shell/holding/
// advisory company — the origin of wrong matches).
const CNAE_IMPLAUSIVEL =
  /(assessoria|apoio administrativo|gestao de participa|holding|consultoria em gest|escritorio|locacao de|atividades de associacoes)/i;

function cnaeImplausivel(cnae) {
  return !!cnae && CNAE_IMPLAUSIVEL.test(norm(cnae));
}

/**
 * @typedef {object} CandSignals
 * @property {number} nameSim
 * @property {boolean} phoneMatch
 * @property {boolean} cnaeBad
 * @property {number} score
 * @property {'accept'|'reject'|'judge'} decision
 */

/**
 * Combine the deterministic signals into a 0..1 score + decision:
 *  - accept: phone matches OR very strong name (≥0.8) → skip the judge.
 *  - reject: near-null name without phone, OR shell CNAE without strong name.
 *  - judge: ambiguous zone → goes to the LLM judge (which receives these signals).
 *
 * @param {{nome: string, telefone: string|null, cidade?: string|null}} lead
 * @param {{razao_social: string|null, nome_fantasia: string|null, telefone: string|null, cnae: string|null, municipio?: string|null}} cand
 * @returns {CandSignals}
 */
function scoreCandidato(lead, cand) {
  const nameSim = nomeSimilaridade(lead.nome, cand.razao_social, cand.nome_fantasia);
  const shared = tokensComunsNome(lead.nome, cand.razao_social, cand.nome_fantasia);
  const phoneMatch = telefonesBatem(lead.telefone, cand.telefone);
  const cnaeBad = cnaeImplausivel(cand.cnae);
  // A divergent city is a WEAK negative signal — only weighs when the name is
  // not strong (a brand with HQ in another city still matches by name/phone).
  const cityDiff = cidadeCompativel(lead.cidade, cand.municipio) === false;

  let score = nameSim;
  if (phoneMatch) score = Math.max(score, 0.95);
  if (cnaeBad && !phoneMatch) score = Math.min(score, nameSim * 0.5);
  // Light penalty for a divergent city (no phone): breaks ties toward the
  // SAME-city establishment when two homonyms match the name (e.g. "Margherita
  // Pizzeria" SP vs "La Margherita" Macaé) — the SP one wins.
  if (cityDiff && !phoneMatch) score *= 0.9;

  // A strong-name accept requires ≥2 shared tokens when in ANOTHER city — so
  // "Padoca do Gael" (padoca+gael) accepts even with HQ in Dourados, but
  // "Padaria Central" (only "central") does NOT auto-accept an out-of-city homonym.
  const nomeForteAceitavel = nameSim >= 0.8 && !(cityDiff && shared < 2);

  let decision;
  if (phoneMatch || nomeForteAceitavel) decision = 'accept';
  else if (
    (nameSim < 0.3 && !phoneMatch) ||
    (cnaeBad && nameSim < 0.5) ||
    (cityDiff && nameSim < 0.6 && !phoneMatch) // other city + weak name → not a match
  ) decision = 'reject';
  else decision = 'judge';

  return { nameSim, phoneMatch, cnaeBad, score, decision };
}

module.exports = {
  CNPJ_RE,
  cnpjValido,
  extrairCnpjsDeHtml,
  situacaoAtiva,
  cidadeCompativel,
  gateCandidato,
  nomeSimilaridade,
  tokensComunsNome,
  telefonesBatem,
  cnaeImplausivel,
  scoreCandidato,
};
