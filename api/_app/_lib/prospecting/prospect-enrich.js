'use strict';

/**
 * BR lead enrichment waterfall: CNPJ → owner (QSA) → Instagram.
 * Ported from Olivia's `enriquecer-lead` Edge Function (Deno → Node).
 * =============================================================================
 * Library module (no HTTP handler) — invoked by api/prospect-enrich.js and the
 * discovery flow. Uses supabaseAdmin (service role). Keys are server-only env:
 *   SCRAPINGDOG_API_KEY — Google SERP + page scrape + Instagram followers.
 * BrasilAPI / cnpj.ws / cnpja (official data + QSA) are free and keyless.
 *
 * Pipeline (each step degrades to "missing", never throws the whole thing):
 *   1a) CNPJ on the business's OWN site (footer) — most direct; skips SERP/scrape.
 *       Fetched via safeFetchText (Seatable's Node SSRF guard).
 *   0) Clean the lead name (strip "- bairro, SP…" suffix + lone neighborhood).
 *   1) Scrapingdog Google Search: `"<clean name>" cnpj <city>` (key-gated).
 *   2) Extract the CNPJ from result URL → title → snippet, mod-11 validated.
 *      Fallback: scrape the aggregator page via Scrapingdog (anti-bot).
 *   3) Confirm each candidate at the official source (BrasilAPI → cnpj.ws → cnpja).
 *   3b) LOCAL Receita index (buscar_cnpj_local RPC) — primary source; empty → no-op.
 *   3.5) Deterministic gates (situação ATIVA), then scoreCandidato (accept/reject/judge).
 *   4) LLM judge (getAI / AI_MODEL_FAST) ONLY for the ambiguous zone, with a
 *      validSet trap + nameSim floor (the same guards that stopped Olivia's
 *      "Lellis"→"Banana Boat" production error).
 *   5) Owner from the QSA. 6) Instagram handle (from site HTML) + followers.
 *
 * ANTI-INVENTION: a candidate the official source doesn't confirm, or a
 * low-confidence judge call → cnpj = null, status 'missing'. Never guesses.
 * LGPD: stores only {nome, qualificacao} of each partner. Never CPF.
 * Does not re-enrich a lead that already has a cnpj (unless force).
 * =============================================================================
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { getAI, AI_MODEL_FAST } = require('../ai-client');
const { exigirOrcamentoLlm } = require('./prospect-llm-budget');
const { safeFetchText } = require('../safe-fetch');
const {
  CNPJ_RE, cnpjValido, extrairCnpjsDeHtml, gateCandidato,
  nomeSimilaridade, telefonesBatem, scoreCandidato,
} = require('./prospect-cnpj-match');
const { calcularLeadScore } = require('./prospect-enrich-signals');
const { handleFromHtml, buscarSeguidores } = require('./prospect-instagram');
const { buscarCnpjLocal } = require('./prospect-cnpj-local');

const logger = createSecureLogger('ProspectEnrich');

const CONF_MIN = 0.7;        // below this, a judge call → not found
const MAX_CAND = 5;
const ENRICH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — anti re-charge
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s) => String(s == null ? '' : s).replace(/\D/g, '');

function safeJson(text) {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Step 0 — clean the name for search. Strips the "- bairro, São Paulo - SP, …"
// suffix Google Places glues on, and a lone neighborhood at the end of the name.
function limparNome(nome, bairro) {
  let n = String(nome || '').split(' - ')[0].trim();
  if (bairro) {
    const esc = String(bairro).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    n = n.replace(new RegExp('\\s+' + esc + '\\s*$', 'i'), '').trim();
  }
  return n.replace(/\s+/g, ' ').trim();
}

// Step 1 — Scrapingdog Google Search.
async function buscarGoogle(apiKey, query) {
  const url = `https://api.scrapingdog.com/google/?api_key=${apiKey}&query=${encodeURIComponent(query)}&country=br&results=10`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) { logger.info(`Google Search HTTP ${resp.status}`); return []; }
    const data = await resp.json();
    return Array.isArray(data && data.organic_results) ? data.organic_results : [];
  } catch {
    return [];
  }
}

// Scrape a page (passes the aggregators' anti-bot).
async function scrapePagina(apiKey, target) {
  const url = `https://api.scrapingdog.com/scrape?api_key=${apiKey}&dynamic=true&url=${encodeURIComponent(target)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return '';
    return await resp.text();
  } catch {
    return '';
  }
}

const onlyValid = (texts, into, seen) => {
  for (const t of texts) {
    for (const m of String(t || '').match(CNPJ_RE) || []) {
      const c = onlyDigits(m);
      if (c.length === 14 && cnpjValido(c) && !seen.has(c)) {
        seen.add(c);
        into.push(c);
        if (into.length >= MAX_CAND) return;
      }
    }
  }
};

// Step 2 — extract CNPJs from results, URL → title → snippet (snippet last).
function extrairCnpjs(results) {
  const out = [];
  const seen = new Set();
  onlyValid(results.flatMap((r) => [r.link || '', r.displayed_link || '']), out, seen);
  if (out.length < MAX_CAND) onlyValid(results.map((r) => r.title || ''), out, seen);
  if (out.length < MAX_CAND) onlyValid(results.map((r) => r.snippet || ''), out, seen);
  return out.slice(0, MAX_CAND);
}

const AGREGADORES = /(cnpj\.biz|econodata|casadosdados|cnpja|consultas\.plus|cnpjagora|empresascnpj|solutudo)/i;

const asBool = (v) => (typeof v === 'boolean' ? v : null);

function montarEndereco(parts) {
  const s = parts.map((p) => (p == null ? '' : String(p)).trim()).filter(Boolean).join(', ');
  return s || null;
}

// A local-index row (already official) → Candidato, same shape as the online
// sources, so it falls straight into gate + score + judge without re-confirming.
function localToCandidato(l) {
  return {
    cnpj: l.cnpj,
    razao_social: l.razao_social,
    nome_fantasia: l.nome_fantasia,
    endereco: montarEndereco([l.bairro, l.municipio, l.uf]),
    municipio: l.municipio,
    situacao: l.situacao,
    cnae: l.cnae,
    telefone: l.telefone,
    porte: l.porte,
    mei: l.mei,
    qsa: (l.socios || []).map((s) => ({ nome_socio: s.nome, qualificacao_socio: s.qualificacao })),
  };
}

// Step 3 — official source. BrasilAPI → cnpj.ws → cnpja (all free, keyless).
async function consultarBrasilApi(cnpj) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (resp.status === 429) { await sleep(800 * (attempt + 1)); continue; }
      if (!resp.ok) return null;
      const d = await resp.json();
      const qsa = Array.isArray(d.qsa)
        ? d.qsa.map((s) => ({
            nome_socio: s.nome_socio == null ? null : String(s.nome_socio),
            qualificacao_socio: s.qualificacao_socio == null ? null : String(s.qualificacao_socio),
          }))
        : [];
      return {
        cnpj,
        razao_social: d.razao_social || null,
        nome_fantasia: d.nome_fantasia || null,
        endereco: montarEndereco([d.logradouro, d.numero, d.bairro, d.municipio, d.uf]),
        municipio: d.municipio == null ? null : String(d.municipio),
        situacao: d.descricao_situacao_cadastral == null ? null : String(d.descricao_situacao_cadastral),
        cnae: d.cnae_fiscal_descricao == null ? null : String(d.cnae_fiscal_descricao),
        telefone: d.ddd_telefone_1 == null ? null : String(d.ddd_telefone_1),
        porte: d.porte == null ? null : String(d.porte),
        mei: asBool(d.opcao_pelo_mei),
        qsa,
      };
    } catch {
      return null;
    }
  }
  return null;
}

async function consultarCnpjWs(cnpj) {
  try {
    const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (!resp.ok) return null;
    const d = await resp.json();
    const est = d.estabelecimento || {};
    const qsa = Array.isArray(d.socios)
      ? d.socios.map((s) => {
          const q = s.qualificacao_socio;
          return {
            nome_socio: s.nome == null ? null : String(s.nome),
            qualificacao_socio:
              typeof q === 'object' && q ? String(q.descricao || '') || null : (q == null ? null : String(q)),
          };
        })
      : [];
    return {
      cnpj,
      razao_social: d.razao_social || null,
      nome_fantasia: est.nome_fantasia || null,
      endereco: montarEndereco([est.logradouro, est.numero, est.bairro, est.cidade && est.cidade.nome, est.estado && est.estado.sigla]),
      municipio: est.cidade && est.cidade.nome == null ? null : (est.cidade ? String(est.cidade.nome) : null),
      situacao: est.situacao_cadastral == null ? null : String(est.situacao_cadastral),
      cnae: est.atividade_principal && est.atividade_principal.descricao == null ? null : (est.atividade_principal ? String(est.atividade_principal.descricao) : null),
      telefone: est.ddd1 ? `${est.ddd1}${est.telefone1 || ''}` : null,
      porte: (d.porte && d.porte.descricao) || (d.porte == null ? null : String(d.porte)),
      mei: asBool(d.simei && d.simei.optante) || asBool(est.simei && est.simei.optante),
      qsa,
    };
  } catch {
    return null;
  }
}

// Fallback: open.cnpja.com. A masked CPF from the source is deliberately ignored.
async function consultarCnpja(cnpj) {
  try {
    const resp = await fetch(`https://open.cnpja.com/office/${cnpj}`);
    if (!resp.ok) return null;
    const d = await resp.json();
    const addr = d.address || {};
    const members = Array.isArray(d.company && d.company.members) ? d.company.members : [];
    const qsa = members.map((m) => {
      const person = m.person || {};
      const role = m.role || {};
      return {
        nome_socio: person.name == null ? null : String(person.name),
        qualificacao_socio: role.text == null ? null : String(role.text),
      };
    });
    return {
      cnpj,
      razao_social: (d.company && d.company.name) || null,
      nome_fantasia: d.alias || null,
      endereco: montarEndereco([addr.street, addr.number, addr.district, addr.city, addr.state]),
      municipio: addr.city == null ? null : String(addr.city),
      situacao: d.status && d.status.text == null ? null : (d.status ? String(d.status.text) : null),
      cnae: d.mainActivity && d.mainActivity.text == null ? null : (d.mainActivity ? String(d.mainActivity.text) : null),
      telefone: Array.isArray(d.phones) && d.phones[0]
        ? `${d.phones[0].area || ''}${d.phones[0].number || ''}` || null
        : null,
      porte: (d.company && d.company.size && d.company.size.text) || null,
      mei: asBool(d.company && d.company.simei && d.company.simei.optant),
      qsa,
    };
  } catch {
    return null;
  }
}

async function confirmarOficial(cnpj) {
  const brasil = await consultarBrasilApi(cnpj);
  if (brasil) return { cand: brasil, fonte: 'brasilapi' };
  const ws = await consultarCnpjWs(cnpj);
  if (ws) return { cand: ws, fonte: 'cnpj.ws' };
  const cnpja = await consultarCnpja(cnpj);
  if (cnpja) return { cand: cnpja, fonte: 'cnpja' };
  return null;
}

// Step 4 — LLM judge for the ambiguous zone (getAI / AI_MODEL_FAST). A single
// candidate WITHOUT semantic validation gave 3/3 wrong matches in production.
async function escolherCnpj(lead, candidatos, origemSiteDoLead) {
  const validSet = new Set(candidatos.map((c) => c.cnpj));
  const lista = candidatos.map((c) => ({
    cnpj: c.cnpj,
    razao_social: c.razao_social,
    nome_fantasia: c.nome_fantasia,
    endereco: c.endereco,
    atividade_principal: c.cnae,
    situacao_cadastral: c.situacao,
  }));

  const system = [
    'Você desambigua qual empresa (CNPJ) corresponde a um estabelecimento real.',
    'Responda APENAS com um objeto JSON, sem texto fora dele, sem crases.',
    'Formato: {"best_cnpj": "<cnpj OU null>", "confidence": <0..1>, "motivo": "<curto>"}.',
    'REGRA ABSOLUTA: best_cnpj DEVE ser exatamente um dos CNPJs fornecidos, ou null.',
    'É PROIBIDO inventar, completar ou alterar qualquer número de CNPJ.',
    'Case por similaridade de nome fantasia/razão social com o nome do lead E proximidade de endereço/bairro.',
    'A atividade_principal (CNAE) deve ser compatível com o setor do lead — um leiloeiro não é uma padaria; loja de calçados não é restaurante. Incompatibilidade grosseira → não é match.',
    'Razão social diferente do nome fantasia é NORMAL (ex.: restaurante operando sob razão social antiga) — desde que endereço/atividade batam.',
    'MARCAS COM VÁRIAS UNIDADES: o endereço do candidato pode ser de OUTRA unidade (matriz ou filial) da MESMA marca. Se nome e atividade casam fortemente, ainda é match — confidence moderada (0.6–0.8) — mesmo com endereço de outra unidade na mesma cidade.',
    'Se cnpj_publicado_no_site_do_lead=true, o CNPJ veio do RODAPÉ do site do próprio negócio: evidência forte. Salvo contradição clara de atividade, é match com confidence alta (≥0.8).',
    'Mesmo com UM único candidato, avalie criticamente: vir do Google não é evidência. Se não houver match claro, retorne best_cnpj=null. Na dúvida, prefira null.',
  ].join(' ');

  const user = JSON.stringify({
    lead: {
      nome: lead.nome, endereco: lead.endereco, bairro: lead.bairro,
      telefone: lead.telefone, setor: lead.setor,
    },
    cnpj_publicado_no_site_do_lead: origemSiteDoLead,
    candidatos: lista,
  });

  // A transient LLM error must NOT 502 the whole enrichment — it degrades to
  // "no match" like every other external call here. No CNPJ is just 'missing'.
  let content = '';
  try {
    await exigirOrcamentoLlm(); // global hourly budget — exhausted reads as judge down
    const resp = await getAI().messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
    const textBlock = blocks.find((b) => b.type === 'text' && b.text);
    content = textBlock ? textBlock.text : '';
  } catch (e) {
    logger.info('judge LLM failed:', e.message);
    return { best_cnpj: null, confidence: 0, motivo: 'juiz indisponível' };
  }

  const parsed = safeJson(content);
  if (!parsed) return { best_cnpj: null, confidence: 0, motivo: 'sem resposta válida' };

  let best = parsed.best_cnpj == null ? null : onlyDigits(String(parsed.best_cnpj));
  const confidence = Number(parsed.confidence) || 0;
  const motivo = String(parsed.motivo || '');
  if (best && !validSet.has(best)) best = null; // trap: only from the list
  return { best_cnpj: best, confidence, motivo };
}

// Step 5 — owner + sanitized partners (NO CPF).
function extrairDonoESocios(match) {
  const socios = match.qsa
    .map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio }))
    .filter((s) => s.nome);
  const admin = socios.find((s) => /administrador/i.test(s.qualificacao || ''));
  if (admin && admin.nome) return { dono_nome: admin.nome, socios };
  if (socios.length === 1 && socios[0].nome) return { dono_nome: socios[0].nome, socios };
  return { dono_nome: null, socios };
}

/**
 * Enrich a single prospect lead. Service-role; safe for cron/internal callers.
 * @param {string} leadId
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{lead?: object, enrich_status?: object, skipped?: boolean, reason?: string, error?: string}>}
 */
async function enrichLead(leadId, opts = {}) {
  const force = Boolean(opts.force);
  if (!leadId) return { error: 'leadId obrigatório' };

  const scrapingdogKey = process.env.SCRAPINGDOG_API_KEY || null;

  const { data: lead, error: loadErr } = await supabaseAdmin
    .from('prospect_leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (loadErr || !lead) return { error: 'lead não encontrado' };

  if (lead.cnpj && !force) {
    return { lead, enrich_status: lead.enrich_status, skipped: true };
  }

  // Anti re-charge cooldown: already tried and stayed without a CNPJ → don't
  // re-pay the pipeline (SERP+scrape+LLM) on every refetch within the window.
  const es = lead.enrich_status || {};
  const tentadoEm = es.attempted_at ? Date.parse(es.attempted_at) : 0;
  if (!force && es.cnpj === 'missing' && tentadoEm > 0 && (Date.now() - tentadoEm) < ENRICH_COOLDOWN_MS) {
    return { lead, enrich_status: lead.enrich_status, skipped: true, reason: 'cooldown' };
  }

  const status = { cnpj: 'pending', dono: 'pending', instagram: 'pending', attempted_at: new Date().toISOString() };
  const patch = {};

  // Olivia(pt) → Seatable(en) column view for the ported logic.
  const leadView = {
    nome: lead.name, endereco: lead.address, bairro: lead.neighborhood,
    cidade: lead.city, telefone: lead.phone, setor: lead.sector,
  };

  try {
    // Step 1a — CNPJ on the business's OWN site (footer). Most direct source.
    const nomeLimpo = limparNome(lead.name, lead.neighborhood);
    let cnpjs = [];
    let origemSiteDoLead = false;
    let handleDoSite = null;
    if (lead.website) {
      // High maxBytes: the CNPJ lives in the FOOTER, and e-commerce pages easily
      // exceed 500 KB (real case: a 3.5 MB page with the CNPJ at offset ~2.3 MB).
      let siteHtml = '';
      try {
        const r = await safeFetchText(lead.website, { maxBytes: 4_000_000 });
        siteHtml = (r && r.text) || '';
      } catch (e) {
        logger.info('site fetch blocked/failed:', e.message);
      }
      if (siteHtml) {
        cnpjs = extrairCnpjsDeHtml(siteHtml);
        if (!lead.instagram_handle) handleDoSite = handleFromHtml(siteHtml);
      }
      origemSiteDoLead = cnpjs.length > 0;
    }

    if (cnpjs.length === 0 && scrapingdogKey) {
      // Steps 0+1 — Google Search (key-gated).
      const cidade = lead.city || 'São Paulo';
      const query = `"${nomeLimpo}" cnpj ${cidade}`;
      const results = await buscarGoogle(scrapingdogKey, query);
      cnpjs = extrairCnpjs(results);

      // Fallback: scrape the 1st–2nd aggregator pages.
      if (cnpjs.length === 0) {
        const alvos = results
          .map((r) => r.link)
          .filter((l) => !!l && AGREGADORES.test(l))
          .slice(0, 2);
        const seen = new Set();
        const out = [];
        for (const alvo of alvos) {
          const html = await scrapePagina(scrapingdogKey, alvo);
          onlyValid([html], out, seen);
          if (out.length > 0) break;
        }
        cnpjs = out;
      }
    }

    let matched = null;
    let confidence = 0;

    // Step 3 — confirm SERP/site candidates at the official source.
    const confirmados = [];
    for (const cnpj of cnpjs) {
      const conf = await confirmarOficial(cnpj);
      if (conf) confirmados.push(conf.cand);
      await sleep(300);
    }

    // Step 3b — LOCAL Receita index (primary; already official). Empty → no-op.
    const locais = await buscarCnpjLocal(supabaseAdmin, nomeLimpo, lead.city);
    for (const lc of locais) {
      if (!confirmados.some((c) => c.cnpj === lc.cnpj)) confirmados.push(localToCandidato(lc));
    }
    if (locais.length) logger.info(`local index → ${locais.length} candidate(s)`);

    if (confirmados.length > 0) {
      // Step 3.5 — deterministic gates (situação ATIVA). Phone-match or a very
      // strong name bypasses the status gate (a closed establishment whose phone
      // still matches the Google listing is the right business; score decides).
      const candidatos = [];
      for (const cand of confirmados) {
        const phoneHit = telefonesBatem(leadView.telefone, cand.telefone);
        const nomeForte = nomeSimilaridade(leadView.nome, cand.razao_social, cand.nome_fantasia) >= 0.85;
        const motivo = (phoneHit || nomeForte) ? null : gateCandidato(leadView, cand);
        if (motivo) logger.info(`gate rejected ${cand.cnpj}: ${motivo}`);
        else candidatos.push(cand);
      }

      // Step 4 — deterministic score → judge only in the ambiguous zone.
      if (candidatos.length > 0) {
        const leadSig = { nome: leadView.nome, telefone: leadView.telefone, cidade: leadView.cidade };
        const scored = candidatos.map((c) => ({ cand: c, sig: scoreCandidato(leadSig, c) }));
        const aceitos = scored.filter((s) => s.sig.decision === 'accept').sort((a, b) => b.sig.score - a.sig.score);

        if (aceitos.length > 0) {
          matched = aceitos[0].cand;
          confidence = aceitos[0].sig.score;
          logger.info(`AUTO-ACCEPT ${matched.cnpj} nameSim=${aceitos[0].sig.nameSim.toFixed(2)} phone=${aceitos[0].sig.phoneMatch}`);
        } else {
          const paraJuiz = scored.filter((s) => s.sig.decision === 'judge').map((s) => s.cand);
          if (paraJuiz.length > 0) {
            const escolha = await escolherCnpj(leadView, paraJuiz, origemSiteDoLead);
            confidence = escolha.confidence;
            logger.info(`judge (${paraJuiz.length} cand., site=${origemSiteDoLead}) → best=${escolha.best_cnpj} conf=${confidence}`);
            if (escolha.best_cnpj && confidence >= CONF_MIN) {
              const cand = paraJuiz.find((c) => c.cnpj === escolha.best_cnpj) || null;
              if (cand) {
                // Anti-invention floor: the judge can't accept a near-null name
                // without a phone match (how "Lellis"→"Banana Boat" slipped through).
                const sig = scoreCandidato(leadSig, cand);
                if (sig.nameSim >= 0.35 || sig.phoneMatch) matched = cand;
                else logger.info(`judge picked ${cand.cnpj} but nameSim=${sig.nameSim.toFixed(2)} no phone → blocked`);
              }
            }
          }
        }
      }
    }

    if (matched) {
      const { dono_nome, socios } = extrairDonoESocios(matched);
      patch.cnpj = matched.cnpj;
      patch.razao_social = matched.razao_social;
      patch.socios = socios;
      patch.owner_name = dono_nome;
      patch.porte = matched.porte;
      patch.mei = matched.mei;
      status.cnpj = 'ok';
      status.cnpj_confidence = confidence;
      status.dono = dono_nome ? 'ok' : 'missing';
    } else {
      patch.cnpj = null;
      patch.razao_social = null;
      patch.socios = null;
      patch.owner_name = null;
      patch.porte = null;
      patch.mei = null;
      status.cnpj = 'missing';
      status.dono = 'missing';
    }

    // Step 6 — Instagram handle (from site, if missing) + followers.
    const handleEfetivo = lead.instagram_handle || handleDoSite;
    if (handleDoSite) patch.instagram_handle = handleDoSite;
    if (handleEfetivo && scrapingdogKey) {
      const followers = await buscarSeguidores(handleEfetivo, scrapingdogKey);
      if (followers != null) { patch.instagram_followers = followers; status.instagram = 'ok'; }
      else status.instagram = 'missing';
    } else {
      status.instagram = 'missing';
    }

    patch.enrich_status = status;
    if (status.cnpj === 'ok' && lead.status === 'descoberto') patch.status = 'enriquecido';

    // Lead score (additive 0..7). pontoFisico from the Google Places address;
    // owner from this run's resolved owner_name. Bio signals (delivery/whatsapp)
    // come from a future encontrar-whatsapp port — read from enrich_status if a
    // prior run stashed them, else false (never regress a previous score).
    const pontoFisico = !!(lead.address && lead.address.trim());
    const deliveryProprio = Boolean(es.bio_delivery_proprio);
    const whatsappVendas = Boolean(es.bio_whatsapp_vendas);
    const ownerNome = typeof patch.owner_name === 'string' ? patch.owner_name : (lead.owner_name || null);
    const donoIdentificado = !!(ownerNome && ownerNome.trim());
    patch.lead_score = calcularLeadScore({ pontoFisico, deliveryProprio, whatsappVendas, donoIdentificado });

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('prospect_leads')
      .update(patch)
      .eq('id', leadId)
      .select('*')
      .single();
    if (updErr) throw updErr;

    return { lead: updated, enrich_status: status };
  } catch (e) {
    logger.error('enrich error:', e.message);
    return { error: 'falha ao enriquecer o lead' };
  }
}

/**
 * Enrich a bounded batch of discovered leads that still lack a CNPJ. Sequential
 * (respects the official-source rate limits + the 300ms inter-call sleeps); each
 * enrichLead applies its own 7-day cooldown, so repeat calls don't re-pay.
 * Kept small (≤20) to stay within the 60s function budget.
 * @param {{limit?: number, force?: boolean}} [opts]
 * @returns {Promise<{processed: number, enriched: number, missing: number, skipped: number}|{error: string}>}
 */
async function enrichPending(opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 5, 1), 20);
  const force = Boolean(opts.force);
  const { data: leads, error } = await supabaseAdmin
    .from('prospect_leads')
    .select('id')
    .is('cnpj', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { logger.error('enrichPending query failed:', error.message); return { error: 'query failed' }; }

  const summary = { processed: 0, enriched: 0, missing: 0, skipped: 0 };
  for (const l of leads || []) {
    const r = await enrichLead(l.id, { force });
    summary.processed++;
    if (r.skipped) summary.skipped++;
    else if (r.enrich_status && r.enrich_status.cnpj === 'ok') summary.enriched++;
    else summary.missing++;
  }
  return summary;
}

module.exports = { enrichLead, enrichPending, ENRICH_COOLDOWN_MS };
