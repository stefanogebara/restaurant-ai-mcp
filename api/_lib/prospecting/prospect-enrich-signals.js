'use strict';

/**
 * Pure signal extractors for BR lead enrichment (no I/O, unit-tested).
 * Ported from Olivia's `_shared/{lead_score,bio_sinais,genero,contact_pages,endereco}.ts`.
 * Grouped here because in Seatable only the `prospect-enrich` waterfall consumes them.
 */

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// =============================================================================
// lead_score — additive 0..7 qualification score
// =============================================================================
// Linktree does NOT score (kept for future analysis, no defined weight).
// A NULL score in the DB = lead not yet classified (awaiting enrichment).

// Color bands (frontend + tests use the same thresholds).
const SCORE_FAIXAS = Object.freeze({ MID_MIN: 1, MID_MAX: 3, HIGH_MIN: 4 });

/**
 * @param {{pontoFisico: boolean, deliveryProprio: boolean, whatsappVendas: boolean, donoIdentificado: boolean}} s
 * @returns {number} 0..7
 */
function calcularLeadScore({ pontoFisico, deliveryProprio, whatsappVendas, donoIdentificado }) {
  return (
    (pontoFisico ? 1 : 0) +
    (deliveryProprio ? 2 : 0) +
    (whatsappVendas ? 3 : 0) +
    (donoIdentificado ? 1 : 0)
  );
}

// =============================================================================
// bio_sinais — qualification signals from the Instagram bio
// =============================================================================
// ANTI-FALSE-POSITIVE:
//   whatsappVendas: wa.me/api.whatsapp.com/wa.link link OR a sale-intent phrase
//     near "whats". A bare number is NOT enough.
//   deliveryProprio: own-delivery phrases ("entregamos", "delivery próprio").
//     A bio with ONLY an aggregator (iFood/Rappi/Uber Eats) → FALSE.
//   linktree: linktr.ee / linktree / beacons / linkbio in text or external_url.

/**
 * @param {string} bio
 * @param {string|null} externalUrl
 * @returns {{linktree: boolean, whatsappVendas: boolean, deliveryProprio: boolean}}
 */
function classificarBioSinais(bio, externalUrl) {
  const t = norm(bio);
  const extNorm = externalUrl ? norm(externalUrl) : '';

  const linktree =
    /linktr\.ee|linktree|beacons\.|linkbio/.test(t) ||
    /linktr\.ee|linktree|beacons\.|linkbio/.test(extNorm);

  const temLinkWA =
    /wa\.me|api\.whatsapp\.com|wa\.link/.test(t) ||
    /wa\.me|api\.whatsapp\.com|wa\.link/.test(extNorm);
  const temFraseVenda =
    /pedidos?\s+pelo\s+whats|pe[cç]a?\s+pelo\s+whatsapp|encomendas?\s+pelo\s+whatsapp|chama\s+no\s+whats|whatsapp\s+para\s+pedidos|pelo\s+whats|via\s+whatsapp/.test(t);
  const whatsappVendas = temLinkWA || temFraseVenda;

  const deliveryProprio =
    /delivery\s+pr[oó]prio|entregamos|fazemos\s+entrega|tele.?entrega/.test(t);

  return { linktree, whatsappVendas, deliveryProprio };
}

// =============================================================================
// genero — grammatical gender of the business name (picks o/a → m/f template)
// =============================================================================
// The classification itself is done by an LLM; here are the PURE parts: the
// response parser and the prompt builder.
// RULE: uncertain/empty/error → 'f' (the list is mostly doceria/padaria/
// confeitaria, feminine). The classification degrades safely.

/**
 * Normalize the LLM output to 'f'|'m'. Only becomes 'm' on an unambiguous
 * masculine answer; anything else (incl. empty/noise) → 'f'.
 * @param {string|null|undefined} raw
 * @returns {'f'|'m'}
 */
function parseGenero(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return 'f';
  if (/femin|\bfem\b|\bf\b/.test(s)) return 'f';
  if (/mascul|\bmasc\b|\bm\b/.test(s)) return 'm';
  return 'f';
}

/**
 * Classification prompt (deterministic, single-letter answer).
 * @param {string} nome
 * @returns {{system: string, user: string}}
 */
function generoPrompt(nome) {
  const system = [
    'Você classifica o gênero gramatical do nome de um negócio em português do Brasil.',
    'Pense no artigo que soa natural antes do nome numa frase como "Vi ___ <nome>".',
    'Ex.: "a Doceria Maria" → f; "o Empório dos Bichos" → m; "a Pietra Pâtisserie" → f; "o Café Central" → m.',
    'Responda APENAS com uma única letra: "f" ou "m". Sem pontuação, sem explicação.',
    'Na dúvida, responda "f".',
  ].join(' ');
  return { system, user: `Nome do negócio: ${nome}` };
}

// =============================================================================
// contact_pages — discover contact pages in HTML (same-origin only)
// =============================================================================
// The wa.me link usually lives on /contato or /fale-conosco, not the home page.
// SAME ORIGIN ONLY: the scan never follows third-party domains — the number must
// come from the business's own site (anti-invention / provenance).

const ANCHOR_RE = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
const CONTACT_HINT_RE = /contat|fale[\s-]*conosco|atendimento|whats?app|\bwpp\b/i;
const MAX_CONTACT_LINKS = 3;

/**
 * Extract up to 3 contact-page URLs from HTML, resolved against baseUrl,
 * same-origin only. Matches by URL OR link text ("Fale conosco").
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]}
 */
function extractContactLinks(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const out = [];
  const seen = new Set();

  for (const m of String(html || '').matchAll(ANCHOR_RE)) {
    const href = (m[1] || m[2] || m[3] || '').trim();
    if (!href || href.startsWith('#')) continue;

    const text = m[4].replace(/<[^>]*>/g, ' ');
    if (!CONTACT_HINT_RE.test(href) && !CONTACT_HINT_RE.test(text)) continue;

    let resolved;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.origin !== base.origin) continue;

    resolved.hash = '';
    const url = resolved.toString();
    if (url.replace(/\/$/, '') === base.toString().replace(/\/$/, '')) continue;

    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
      if (out.length >= MAX_CONTACT_LINKS) break;
    }
  }

  return out;
}

// =============================================================================
// endereco — parse Google Places formatted_address → real bairro + cidade
// =============================================================================
// The lead's neighborhood came from the SEARCH TERM — Google returns results
// from neighboring areas all labelled with the searched term. The formatted
// address carries the REAL neighborhood:
//   "<rua>, <nº>[ - complemento] - <bairro>, <cidade> - <UF>, <CEP>, Brazil"

/**
 * Extract real bairro + cidade from the formatted_address. Returns null when the
 * shape isn't recognized (caller falls back to the searched term).
 * @param {string|null|undefined} endereco
 * @returns {{bairro: string|null, cidade: string|null}|null}
 */
function parseEnderecoFormatado(endereco) {
  if (!endereco) return null;

  // Anchor: ", <cidade> - <UF>," — only the city-UF pair has this shape.
  const m = endereco.match(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\s*,/);
  if (!m || m.index == null) return null;
  const cidade = m[1].trim() || null;

  // Everything before the anchor: "<rua>, <nº>[ - complemento] - <bairro>".
  const antes = endereco.slice(0, m.index);
  const partes = antes.split(' - ').map((s) => s.trim()).filter(Boolean);
  let bairro = null;
  if (partes.length > 1) {
    const cand = partes[partes.length - 1];
    // A lone number is not a neighborhood (e.g. "Rua Augusta - 255").
    if (cand && !/^\d/.test(cand)) bairro = cand;
  }

  return { bairro, cidade };
}

module.exports = {
  SCORE_FAIXAS,
  calcularLeadScore,
  classificarBioSinais,
  parseGenero,
  generoPrompt,
  extractContactLinks,
  parseEnderecoFormatado,
};
