'use strict';

/**
 * Prospecting data-access layer (service_role only).
 *
 * All prospecting tables are service-role scoped (see 20260626_prospecting.sql),
 * so every read/write here goes through supabaseAdmin. Keep storage details
 * behind this module — handlers talk to these functions, not Supabase directly.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { brCandidates, toE164 } = require('./phone');
const { WON_STATE } = require('./prospect-state'); // pure module — no cycle

const logger = createSecureLogger('ProspectStore');

/** Build the set of E.164 + bare-digit strings a stored phone might equal. */
function phoneMatchCandidates(rawPhone) {
  const digits = brCandidates(rawPhone);
  const out = new Set();
  for (const d of digits) {
    out.add('+' + d);
    out.add(d);
  }
  const e164 = toE164(rawPhone);
  if (e164) out.add(e164);
  return Array.from(out);
}

/**
 * Is this phone on the prospecting opt-out / suppression list? (LGPD)
 * @param {string} rawPhone
 * @returns {Promise<boolean>}
 */
async function isOptedOut(rawPhone) {
  try {
    const candidates = phoneMatchCandidates(rawPhone);
    const { data, error } = await supabaseAdmin
      .from('prospect_optout')
      .select('id')
      .in('phone', candidates)
      .limit(1);
    if (error) {
      logger.error('isOptedOut query failed:', error.message);
      return false; // fail open on a read error — do not block on infra hiccup
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    logger.error('isOptedOut exception:', err.message);
    return false;
  }
}

/**
 * Find a prospect lead by inbound phone (handles BR 9th-digit / country-code
 * variants). Returns the lead row or null.
 * @param {string} rawPhone
 * @returns {Promise<object|null>}
 */
async function findLeadByPhone(rawPhone) {
  try {
    const candidates = phoneMatchCandidates(rawPhone);
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .or(candidates.map(c => `whatsapp_phone.eq.${c}`).join(','))
      .limit(1);
    if (error) {
      logger.error('findLeadByPhone query failed:', error.message);
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (err) {
    logger.error('findLeadByPhone exception:', err.message);
    return null;
  }
}

/**
 * Store an inbound or outbound prospect message. wamid is the dedup key — Meta
 * re-delivers webhooks, so a duplicate wamid is ignored (ON CONFLICT DO NOTHING
 * via upsert with ignoreDuplicates).
 *
 * @param {object} msg
 * @param {string|null} msg.leadId
 * @param {'in'|'out'} msg.direcao
 * @param {string|null} msg.wamid
 * @param {string} [msg.tipo='text']
 * @param {string|null} [msg.corpo]
 * @param {object|null} [msg.raw]
 * @returns {Promise<{stored: boolean}>}
 */
async function storeMessage({ leadId = null, direcao, wamid = null, tipo = 'text', corpo = null, raw = null }) {
  try {
    const row = { lead_id: leadId, direcao, wamid, tipo, corpo, raw };
    // Upsert on wamid so a re-delivered webhook no-ops instead of erroring on the
    // UNIQUE constraint. Rows with a null wamid (rare) always insert.
    const query = wamid
      ? supabaseAdmin.from('prospect_messages').upsert(row, { onConflict: 'wamid', ignoreDuplicates: true })
      : supabaseAdmin.from('prospect_messages').insert(row);
    const { error } = await query;
    if (error) {
      logger.error('storeMessage failed:', error.message);
      return { stored: false };
    }
    return { stored: true };
  } catch (err) {
    logger.error('storeMessage exception:', err.message);
    return { stored: false };
  }
}

/**
 * Load the last `limit` messages for a lead in chronological order — the history
 * the brain assembles into the conversation.
 * @param {string} leadId
 * @param {number} [limit=40]
 * @returns {Promise<Array<{direcao:string, corpo:string|null, tipo:string|null}>>}
 */
async function loadHistory(leadId, limit = 40) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('direcao, corpo, tipo, enviada_em, wamid')
      .eq('lead_id', leadId)
      .order('enviada_em', { ascending: false })
      .limit(limit);
    if (error) {
      logger.error('loadHistory failed:', error.message);
      return [];
    }
    // fetched newest-first for the LIMIT; return chronological (oldest-first)
    return Array.isArray(data) ? data.slice().reverse() : [];
  } catch (err) {
    logger.error('loadHistory exception:', err.message);
    return [];
  }
}

/**
 * Patch a lead row. The optout-terminal DB trigger still guards prospect_state,
 * so a buggy caller cannot resurrect an opted-out lead.
 * @param {string} leadId
 * @param {object} fields
 */
async function patchLead(leadId, fields) {
  try {
    const { error } = await supabaseAdmin.from('prospect_leads').update(fields).eq('id', leadId);
    if (error) {
      logger.error('patchLead failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logger.error('patchLead exception:', err.message);
    return { ok: false };
  }
}

/**
 * Record an opt-out: add to the suppression list (idempotent) and force the
 * lead's state to optout (terminal). LGPD.
 * @param {{phone:string, leadId?:string|null, reason?:string}} args
 */
async function recordOptout({ phone, leadId = null, reason = 'lead_request' }) {
  try {
    const e164 = toE164(phone) || phone;
    await supabaseAdmin
      .from('prospect_optout')
      .upsert({ phone: e164, lead_id: leadId, reason }, { onConflict: 'phone', ignoreDuplicates: true });
    if (leadId) {
      await supabaseAdmin
        .from('prospect_leads')
        .update({ prospect_state: 'optout', status: 'descartado' })
        .eq('id', leadId);
    }
    return { ok: true };
  } catch (err) {
    logger.error('recordOptout exception:', err.message);
    return { ok: false };
  }
}

/**
 * Upsert discovered leads. Conflict on google_place_id DOES NOTHING — re-running
 * discovery must never clobber a lead that's already mid-conversation. Returns
 * the count of NEWLY inserted rows.
 * @param {object[]} rows
 * @returns {Promise<{inserted:number}>}
 */
async function upsertDiscoveredLeads(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      logger.error('upsertDiscoveredLeads failed:', error.message);
      return { inserted: 0 };
    }
    return { inserted: Array.isArray(data) ? data.length : 0 };
  } catch (err) {
    logger.error('upsertDiscoveredLeads exception:', err.message);
    return { inserted: 0 };
  }
}

/**
 * FAIXA DE QUALIDADE do lead, medida contra a base real de produção (30/jul).
 *
 * O `sector` do Google Places diz "restaurante" para TODOS — inclusive
 * shoppings, por causa da praça de alimentação. Sem um teto, ordenar por
 * popularidade traz Mercado Municipal (201 mil avaliações) e sete shoppings
 * antes de qualquer restaurante. Com a faixa, o topo passa a ser Jardim de
 * Napoli, Sal Gastronomia, La Braciera — restaurante independente, com
 * movimento, cujo dono decide sozinho.
 *
 * MIN 150  — abaixo disso não há volume que gere dor de reserva.
 * MAX 5000 — acima é ponto turístico ou rede (Outback, Coco Bambu, Casa do
 *            Porco): decisão corporativa, ciclo longo, e provavelmente já têm
 *            sistema. Testei 15000 e a lista encheu de mercado e franquia.
 * NOTA 4.3 — negócio saudável; abaixo disso o problema não é reserva.
 *
 * Efeito no pool: 3643 → 1930 elegíveis. Com o cap diário de warm-up, mais de
 * um ano de disparos — a faixa não estrangula o funil, só ordena a fila.
 */
const QUALIDADE_MIN_AVALIACOES = 150;
const QUALIDADE_MAX_AVALIACOES = 5000;
const QUALIDADE_MIN_NOTA = 4.3;

/**
 * Leads ready for a cold intro: never contacted (whatsapp_sent_at null), in the
 * initial state, with a sendable WhatsApp number.
 * @param {number} [limit=20]
 */
async function selectIntroCandidates(limit = 20, territorio = null) {
  try {
    let q = supabaseAdmin
      .from('prospect_leads')
      .select('id, name, owner_name, whatsapp_phone, whatsapp_status, lead_score, reviews_count, rating, google_place_id')
      .eq('prospect_state', 'aguardando')
      .is('whatsapp_sent_at', null)
      .not('whatsapp_phone', 'is', null)
      .gte('reviews_count', QUALIDADE_MIN_AVALIACOES)
      .lte('reviews_count', QUALIDADE_MAX_AVALIACOES)
      .gte('rating', QUALIDADE_MIN_NOTA)
      .in('whatsapp_status', ['pending', 'found'])
      // SÓ CELULAR — WhatsApp não existe em fixo. Medido em 01/08/2026: o pool
      // elegível era 82% fixo e o TOPO da fila, 100% (a ordenação por porte,
      // logo abaixo, seleciona o restaurante grande, que publica o fixo do
      // salão no Google). Um lote de 5 falhou 5/5 com 131026 da Meta. Sem isto
      // a descoberta custava uma mensagem e um ponto de reputação por número.
      // Máscara: +55 + DDD(2) + 9 + 8 dígitos. As duas formas cobrem o dado
      // gravado com e sem '+'; a guarda em JS abaixo pega o resto.
      .or('whatsapp_phone.like.+55__9________,whatsapp_phone.like.55__9________');
    // Optional territory targeting (bairro/cidade/UF): matches the stored city
    // OR the full address. Sanitized to letters/digits/spaces/hyphens so the
    // PostgREST or() syntax can't be broken by user input.
    const t = territorio ? String(territorio).normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
    if (t) q = q.or(`city.ilike.%${t}%,address.ilike.%${t}%`);
    // ORDEM DE PRIORIDADE — quem recebe os disparos escassos do dia.
    //
    // Era `created_at asc`: os leads mais ANTIGOS primeiro, o que não tem
    // relação com qualidade. Na prática isso misturava o Santana Burger (712
    // avaliações, movimento real, dor real de reserva) com "Shake Saudável"
    // (2 avaliações, provavelmente nem trabalha com reserva) — e o cap diário
    // de warm-up é pequeno, então cada slot gasto num lead fraco é um slot que
    // o lead forte não recebeu.
    //
    // 1º lead_score (0..7, do enrich: ponto físico + delivery próprio +
    //    WhatsApp de vendas + dono identificado). `nullsFirst: false` é
    //    ESSENCIAL: hoje os 3643 elegíveis têm score NULL porque nunca passaram
    //    pelo enrich, e sem isso o Postgres poria justamente os não
    //    classificados na frente.
    // 2º reviews_count — o desempate que funciona AGORA. Enquanto o score não
    //    estiver populado, ele é quem decide, e é um bom proxy de movimento.
    // 3º created_at — determinismo. Sem um critério final estável, dois leads
    //    empatados alternariam de ordem entre execuções e o claim atômico
    //    ficaria disputando linhas diferentes a cada rodada.
    const { data, error } = await q
      .order('lead_score', { ascending: false, nullsFirst: false })
      .order('reviews_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      // Janela maior que o pedido: os filtros de qualificação abaixo descartam
      // parte do lote, e sem folga o dispatch entregaria menos que o limite —
      // desperdiçando teto diário justamente por causa do filtro que existe
      // para não desperdiçar teto. 3x cobre com sobra os ~12% medidos no topo
      // da fila (fora-do-ICP + duplicata), com teto absoluto para não puxar a
      // base inteira quando alguém pedir um limite grande.
      .limit(Math.min(limit * 3, 300));
    if (error) {
      logger.error('selectIntroCandidates failed:', error.message);
      return [];
    }
    // Guarda em JS: o filtro SQL acima é uma máscara de formato, esta é a regra
    // (DDD válido, nono dígito). Defesa em profundidade — um formato de gravação
    // novo passaria pela máscara e voltaria a queimar envio.
    const { ehCelularBr } = require('./prospect-extract');
    const comCelular = (data || []).filter((l) => ehCelularBr(l.whatsapp_phone));
    const semCelular = (data || []).length - comCelular.length;
    if (semCelular > 0) {
      logger.warn(`selectIntroCandidates: ${semCelular} candidato(s) descartado(s) por não serem celular (máscara SQL deixou passar)`);
    }
    // Qualificação: tira quem não faz reserva (supermercado, farmácia...) e
    // colapsa leads que dividem telefone ou place_id. Ver lead-qualifica.js.
    const { qualificar } = require('./lead-qualifica');
    const { candidatos, descartados } = qualificar(comCelular);
    const perdidos = descartados.fora_icp + descartados.dup_telefone + descartados.dup_place;
    if (perdidos > 0) {
      logger.info(`selectIntroCandidates: ${perdidos} descartado(s) — `
        + `fora do ICP ${descartados.fora_icp}, tel repetido ${descartados.dup_telefone}, place repetido ${descartados.dup_place}`);
    }
    return candidatos.slice(0, limit);
  } catch (err) {
    logger.error('selectIntroCandidates exception:', err.message);
    return [];
  }
}

/**
 * Turn a referred owner/decision-maker number into its own prospect lead
 * (source='indicacao'), inheriting the restaurant's discovery context. A
 * referral is the warmest lead the funnel produces — before this existed the
 * captured numbers died inside handoff_motivo (5 of 5 in the first campaign).
 *
 * Dedup: an existing lead on the same line (9th-digit aware) short-circuits;
 * the suppression list is honored BEFORE any row is created. Never throws.
 *
 * @param {object} fromLead - the referring restaurant's lead row
 * @param {string} numeroRaw - the referred number as it appeared (any format)
 * @param {string|null} nome - referred person's name, when given
 * @returns {Promise<{ok:boolean, created?:boolean, leadId?:string, reason?:string}>}
 */
async function createReferralLead(fromLead, numeroRaw, nome) {
  try {
    if (!fromLead || !fromLead.id || !numeroRaw) return { ok: false, reason: 'args' };
    const { escolherNumeroBr, extrairDddBr } = require('./prospect-extract');
    const numero = escolherNumeroBr(numeroRaw, extrairDddBr(fromLead.whatsapp_phone));
    if (!numero) return { ok: false, reason: 'numero_invalido' };
    if (await isOptedOut(numero)) return { ok: false, reason: 'optedout' };
    const existing = await findLeadByPhone(numero);
    if (existing) return { ok: false, reason: 'exists', leadId: existing.id };

    const payload = {
      name: fromLead.name,
      sector: fromLead.sector || null,
      address: fromLead.address || null,
      neighborhood: fromLead.neighborhood || null,
      city: fromLead.city || null,
      uf: fromLead.uf || null,
      website: fromLead.website || null,
      rating: fromLead.rating ?? null,
      reviews_count: fromLead.reviews_count ?? null,
      lead_score: fromLead.lead_score ?? null,
      // google_place_id is UNIQUE — the referral must NOT inherit it.
      source: 'indicacao',
      owner_name: nome || null,
      whatsapp_phone: numero,
      whatsapp_status: 'found',
      conversa_fatos: {
        ...(nome ? { nome_responsavel: nome } : {}),
        notas: [`Contato indicado pela equipe do ${fromLead.name} (lead ${fromLead.id})`],
      },
    };
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      logger.error('createReferralLead insert failed:', error.message);
      return { ok: false, reason: 'insert' };
    }
    logger.info(`referral lead created ${data.id} (from ${fromLead.id})`);
    return { ok: true, created: true, leadId: data.id };
  } catch (err) {
    logger.error('createReferralLead exception:', err.message);
    return { ok: false, reason: 'exception' };
  }
}

/**
 * Referral leads (source='indicacao') still waiting for their intro. Optional
 * leadId narrows to one specific referral (the just-registered one).
 */
async function selectReferralIntroCandidates(limit = 3, leadId = null) {
  try {
    let q = supabaseAdmin
      .from('prospect_leads')
      .select('id, name, owner_name, whatsapp_phone, whatsapp_status')
      .eq('source', 'indicacao')
      .eq('prospect_state', 'aguardando')
      .is('whatsapp_sent_at', null)
      .not('whatsapp_phone', 'is', null);
    if (leadId) q = q.eq('id', leadId);
    const { data, error } = await q.order('created_at', { ascending: true }).limit(limit);
    if (error) { logger.error('selectReferralIntroCandidates failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectReferralIntroCandidates exception:', err.message);
    return [];
  }
}

/**
 * Atomically claim a lead for an intro send: set whatsapp_sent_at only if it's
 * still null. Returns true if THIS caller claimed it (prevents double-send across
 * concurrent dispatch runs).
 * @param {string} leadId
 */
async function claimIntro(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .update({ whatsapp_sent_at: new Date().toISOString(), whatsapp_send_status: 'queued' })
      .eq('id', leadId)
      .is('whatsapp_sent_at', null)
      .select('id');
    if (error) {
      logger.error('claimIntro failed:', error.message);
      return false;
    }
    return Array.isArray(data) && data.length === 1;
  } catch (err) {
    logger.error('claimIntro exception:', err.message);
    return false;
  }
}

/**
 * Record the outcome of an intro send on the lead.
 *
 * Só 'failed' — recusa EXPLÍCITA da Meta, onde sabemos que nada saiu — devolve
 * o lead para a fila. 'unknown' (timeout/rede) MANTÉM o claim: a mensagem pode
 * ter sido entregue, e reenviar template frio para quem já recebeu é o pior
 * resultado possível — queima o lead e a reputação do número.
 *
 * O preço dessa escolha é um lead eventualmente nunca abordado quando o
 * timeout foi mesmo falha. É o preço certo: um lead a menos custa um lead;
 * uma mensagem repetida custa um bloqueio e um ponto de qualidade na Meta.
 */
async function markIntro(leadId, { status, wamid }) {
  const fields = { whatsapp_send_status: status };
  if (wamid) fields.whatsapp_msg_id = wamid;
  if (status === 'failed') fields.whatsapp_sent_at = null;
  return patchLead(leadId, fields);
}

/**
 * Leads whose business-hours-deferred reply is now due (reply_apos <= now) and
 * still in an active state — the flush cron resumes these.
 * @param {string} nowIso
 * @param {number} [limit=50]
 */
async function selectDueFlush(nowIso, limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('reply_apos', 'is', null)
      .lte('reply_apos', nowIso)
      .in('prospect_state', ['aguardando', 'conversando', 'agendando'])
      .order('reply_apos', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectDueFlush failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectDueFlush exception:', err.message);
    return [];
  }
}

/**
 * Leads whose dated callback (#32) is now due (retorno_em <= now) and still in
 * an active state — the flush cron fires a proactive retomada for these.
 * @param {string} nowIso
 * @param {number} [limit=5]
 */
async function selectDueRetornos(nowIso, limit = 5) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('retorno_em', 'is', null)
      .lte('retorno_em', nowIso)
      .in('prospect_state', ['aguardando', 'conversando', 'agendando'])
      .order('retorno_em', { ascending: true })
      .limit(limit);
    if (error) { logger.error('selectDueRetornos failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectDueRetornos exception:', err.message);
    return [];
  }
}

/**
 * Meetings that already happened (plus a grace period) and are STILL
 * 'agendado' → no-show candidates for the sweep. One-shot by construction:
 * processing resets state + reuniao_at, so the row leaves this selection.
 */
async function selectNoshowDue(cutoffIso, limit = 5) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .eq('prospect_state', 'agendado')
      .not('reuniao_at', 'is', null)
      .lte('reuniao_at', cutoffIso)
      .is('noshow_em', null)
      .order('reuniao_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectNoshowDue failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectNoshowDue exception:', err.message);
    return [];
  }
}

/** Most recent inbound message body for a lead (for the flush cron to re-run). */
async function loadLastInbound(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('corpo, tipo, enviada_em')
      .eq('lead_id', leadId)
      .eq('direcao', 'in')
      .order('enviada_em', { ascending: false })
      .limit(1);
    if (error) {
      logger.error('loadLastInbound failed:', error.message);
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (err) {
    logger.error('loadLastInbound exception:', err.message);
    return null;
  }
}

/**
 * Burst-coalescing fingerprint: changes whenever the lead sends another message.
 * `${count}|${latest enviada_em}` over direcao='in' rows — the debounce loop in
 * the responder polls this until it stops changing ("lead went quiet").
 * @param {string} leadId
 * @returns {Promise<string|null>} null on error (caller degrades open)
 */
async function inboundFingerprint(leadId) {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('prospect_messages')
      .select('enviada_em', { count: 'exact' })
      .eq('lead_id', leadId)
      .eq('direcao', 'in')
      .order('enviada_em', { ascending: false })
      .limit(1);
    if (error) {
      logger.error('inboundFingerprint failed:', error.message);
      return null;
    }
    const latest = Array.isArray(data) && data.length ? data[0].enviada_em : '';
    return `${count ?? 0}|${latest}`;
  } catch (err) {
    logger.error('inboundFingerprint exception:', err.message);
    return null;
  }
}

/**
 * Atomic per-inbound claim: "this wamid is being answered". UPDATE ... WHERE
 * last_in_wamid <> wamid returns a row only for the first claimer — a flush-cron
 * overlap, webhook redelivery or manual re-run for the SAME inbound loses the
 * claim and skips. Degrades OPEN (returns true) on infra errors or exotic wamids
 * so a Redis/DB hiccup never mutes the agent (worst case: a rare double reply).
 * @param {string} leadId
 * @param {string} wamid
 * @returns {Promise<boolean>} true when this caller owns the reply
 */
async function claimInbound(leadId, wamid) {
  if (!leadId || !wamid) return true;
  try {
    // RPC instead of UPDATE + .or(): this project's PostgREST 42703s any
    // UPDATE carrying an or= filter ("column prospect_leads.last_in_wamid
    // does not exist" — while the column exists and the same or= works on
    // GET). The claim failed on EVERY inbound Jul 3-13 and degrade-open
    // masked it. claim_prospect_inbound does the same conditional update in
    // SQL; returns true when THIS caller claimed, null otherwise.
    const { data, error } = await supabaseAdmin.rpc('claim_prospect_inbound', {
      p_lead_id: leadId,
      p_wamid: wamid,
    });
    if (error) {
      logger.error('claimInbound failed:', error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    logger.error('claimInbound exception:', err.message);
    return true;
  }
}

/**
 * Give back a claim taken by claimInbound — used when the reply attempt fails
 * for a TRANSIENT reason (LLM provider error / budget race) and the turn is
 * deferred via reply_apos: the flush retry must be able to claim the same
 * wamid again, or the guard at 6a-ii eats the retry. Guarded by the wamid so
 * a racing claim for a NEWER inbound is never clobbered. Best-effort.
 * @param {string} leadId
 * @param {string} wamid
 */
async function releaseInbound(leadId, wamid) {
  if (!leadId || !wamid) return;
  try {
    const { error } = await supabaseAdmin
      .from('prospect_leads')
      .update({ last_in_wamid: null })
      .eq('id', leadId)
      .eq('last_in_wamid', wamid);
    if (error) logger.error('releaseInbound failed:', error.message);
  } catch (err) {
    logger.error('releaseInbound exception:', err.message);
  }
}

/**
 * Resgate candidates (coarse pass): flush-eligible states, nothing queued,
 * last inbound between 10 min and 24h ago. Fine gates (last non-sys message is
 * the lead's, once-per-inbound + re-arme) are decided per-lead by the flush
 * cron via elegivelParaResgate — message-level facts don't fit one PostgREST
 * query (and column-vs-column comparisons 42703 here; see claimInbound).
 * @param {string} nowIso
 * @param {number} [limit=12]
 */
/**
 * Conversas candidatas a ARQUIVAMENTO: o lead falou por último e ninguém
 * respondeu há muito tempo.
 *
 * Passo GROSSO — estreita o universo por data e estado. A decisão final é pura
 * e mora em `elegivelParaArquivar`, porque ela precisa saber quem falou por
 * último, e isso exige olhar a última mensagem de cada thread (uma consulta por
 * lead). Mesmo desenho de selectFounderFollowupCandidates.
 *
 * @param {string} nowIso
 * @param {number} dias  idade mínima do último inbound
 * @param {number} [limit=50]
 */
async function selectArquivaveis(nowIso, dias, limit = 50) {
  try {
    const corte = new Date(Date.parse(nowIso) - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, prospect_state, last_in_at, reply_apos, retorno_em, snoozed_until, reuniao_at')
      .in('prospect_state', ['aguardando', 'conversando', 'agendando'])
      .not('last_in_at', 'is', null)
      .lte('last_in_at', corte)
      .is('reply_apos', null)
      .order('last_in_at', { ascending: true })
      .limit(limit);
    if (error) {
      // Falha FECHADA: sem lista, não arquiva ninguém. Arquivar por engano é
      // apagar conversa viva.
      logger.error('selectArquivaveis failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectArquivaveis exception:', err.message);
    return [];
  }
}

/**
 * Instante da ÚLTIMA saída nossa, por lead, numa consulta só.
 *
 * Existe para responder "quem falou por último?" em lote. A primeira versão da
 * varredura de arquivamento chamava loadHistory por lead — N+1 que obrigava um
 * teto de leitura baixo, e o teto baixo criava fome: os mesmos leads antigos e
 * já respondidos ocupavam as vagas todo dia e uma conversa realmente abandonada
 * nunca era avaliada.
 *
 * @param {string[]} leadIds
 * @returns {Promise<Map<string, number>>} lead_id → epoch ms da última saída
 */
async function ultimaSaidaPorLead(leadIds) {
  const mapa = new Map();
  const ids = (leadIds || []).filter(Boolean);
  if (!ids.length) return mapa;
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('lead_id, enviada_em')
      .eq('direcao', 'out')
      .in('lead_id', ids);
    if (error) {
      // Falha FECHADA: sem saber quem respondemos, todo lead pareceria
      // abandonado e a varredura arquivaria conversa viva.
      logger.error('ultimaSaidaPorLead failed:', error.message);
      throw new Error(`ultimaSaidaPorLead: ${error.message}`);
    }
    for (const m of data || []) {
      const t = Date.parse(m.enviada_em);
      if (!Number.isFinite(t)) continue;
      const atual = mapa.get(m.lead_id);
      if (atual === undefined || t > atual) mapa.set(m.lead_id, t);
    }
    return mapa;
  } catch (err) {
    logger.error('ultimaSaidaPorLead exception:', err.message);
    throw err;
  }
}

async function selectResgateCandidates(nowIso, limit = 12) {
  try {
    const { RESGATE_MIN_MS, RESGATE_JANELA_MS } = require('./prospect-state');
    const nowMs = Date.parse(nowIso);
    const novoDemais = new Date(nowMs - RESGATE_MIN_MS).toISOString();
    const velhoDemais = new Date(nowMs - RESGATE_JANELA_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, whatsapp_phone, prospect_state, reply_apos, last_in_at, resgate_em')
      .in('prospect_state', ['aguardando', 'conversando', 'agendando'])
      .is('reply_apos', null)
      .gte('last_in_at', velhoDemais)
      .lte('last_in_at', novoDemais)
      .order('last_in_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectResgateCandidates failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectResgateCandidates exception:', err.message);
    return [];
  }
}

/**
 * Nudge candidates (coarse pass): active-conversation leads with no pending
 * deferral. Fine-grained eligibility (23h silence, last message is the agent's,
 * once per silence period, 24h free-text window) is decided per-lead by the
 * cron via elegivelParaNudge — message-level facts don't fit one PostgREST query.
 * @param {number} [limit=50]
 */
async function selectNudgeStates(limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .in('prospect_state', ['conversando', 'agendando'])
      .is('reply_apos', null)
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('selectNudgeStates failed:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    logger.error('selectNudgeStates exception:', err.message);
    return [];
  }
}

/**
 * Timeline event (F6): a 'sys' row rendered inline in the transcript — pause,
 * takeover, booking, snooze, auto-pause… The transcript doubles as audit log.
 * The responder filters sys rows out of the LLM history.
 */
async function recordEvent(leadId, texto, meta = null) {
  if (!leadId || !texto) return { stored: false };
  return storeMessage({ leadId, direcao: 'sys', tipo: 'evento', corpo: texto, raw: meta });
}

/** Private operator note (F6) — never sent to WhatsApp, never seen by the LLM. */
async function recordNote(leadId, texto, operator) {
  if (!leadId || !texto) return { stored: false };
  return storeMessage({ leadId, direcao: 'sys', tipo: 'nota', corpo: texto, raw: { operator } });
}

/** Stamp the AI intent label (F1) on the inbound message + denormalize on the lead. */
async function updateIntent(leadId, wamid, intent) {
  try {
    if (wamid && intent) {
      await supabaseAdmin.from('prospect_messages').update({ intent }).eq('wamid', wamid);
    }
    if (leadId && intent) {
      await supabaseAdmin.from('prospect_leads')
        .update({ last_intent: intent, last_intent_at: new Date().toISOString() })
        .eq('id', leadId);
    }
    return { ok: true };
  } catch (err) {
    logger.error('updateIntent exception:', err.message);
    return { ok: false };
  }
}

/** Registered Meta-approved template variants (F2), optionally for one touch. */
async function listTemplates(touchNumber = null) {
  try {
    let q = supabaseAdmin.from('prospect_templates').select('*')
      .order('touch_number', { ascending: true }).order('variant_label', { ascending: true });
    if (touchNumber != null) q = q.eq('touch_number', touchNumber);
    const { data, error } = await q;
    if (error) { logger.error('listTemplates failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('listTemplates exception:', err.message);
    return [];
  }
}

async function upsertTemplate(row) {
  try {
    const clean = {
      variant_label: String(row.variant_label || '').trim().toUpperCase(),
      // Touches 1-3 = cold sequence (intro/bump/breakup); 4 = the 'resgate'
      // re-engage slot used by dispatchReengages after the 24h window closes.
      touch_number: Math.min(Math.max(parseInt(row.touch_number, 10) || 1, 1), 4),
      meta_template_name: String(row.meta_template_name || '').trim(),
      template_lang: String(row.template_lang || 'pt_BR').trim(),
      body_preview: row.body_preview ? String(row.body_preview) : null,
      active: row.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (!clean.variant_label || !clean.meta_template_name) return { ok: false, error: 'variant_label and meta_template_name required' };
    if (row.id) {
      const { error } = await supabaseAdmin.from('prospect_templates').update(clean).eq('id', row.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabaseAdmin.from('prospect_templates')
        .upsert({ ...clean }, { onConflict: 'touch_number,variant_label' });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Canned responses (F8). */
async function listCanned() {
  try {
    const { data, error } = await supabaseAdmin.from('prospect_canned')
      .select('*').order('short_code', { ascending: true });
    if (error) { logger.error('listCanned failed:', error.message); return []; }
    return data || [];
  } catch { return []; }
}

async function upsertCanned({ id, short_code, body }) {
  try {
    const clean = {
      short_code: String(short_code || '').trim().toLowerCase().replace(/\s+/g, '-'),
      body: String(body || '').trim(),
      updated_at: new Date().toISOString(),
    };
    if (!clean.short_code || !clean.body) return { ok: false, error: 'short_code and body required' };
    const q = id
      ? supabaseAdmin.from('prospect_canned').update(clean).eq('id', id)
      : supabaseAdmin.from('prospect_canned').upsert(clean, { onConflict: 'short_code' });
    const { error } = await q;
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function deleteCanned(id) {
  try {
    const { error } = await supabaseAdmin.from('prospect_canned').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Multi-touch (F4): due follow-up candidates — intro delivered, NEVER replied
 * (last_in_at null), still in the cold bucket, under 3 touches, not suppressed.
 */
async function selectDueTouches(nowIso, limit = 10) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('next_touch_at', 'is', null)
      .lte('next_touch_at', nowIso)
      .is('last_in_at', null)
      .lt('touch_count', 3)
      .in('prospect_state', ['aguardando'])
      .order('next_touch_at', { ascending: true })
      .limit(limit);
    if (error) { logger.error('selectDueTouches failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectDueTouches exception:', err.message);
    return [];
  }
}

/**
 * Re-engagement candidates: leads that DID reply at some point but went silent
 * long enough for the 24h service window to close (default D+3 of silence),
 * still in an active conversation (not booked/paused/optout/snoozed).
 *
 * 'agendando' is included on purpose: a lead who went silent MID-SCHEDULING is
 * the hottest re-engage there is — the first live campaign lost its only two
 * scheduling-stage leads to a 'conversando'-only filter here.
 *
 * "Already re-engaged this silence" is enforced by the caller via the message
 * log (last outbound being a template = this silence was already touched) —
 * no schema change needed, and a new inbound naturally re-arms the cycle.
 */
const REENGAGE_STATES = ['conversando', 'agendando'];

async function selectDueReengages(nowIso, silenceMs, limit = 5) {
  try {
    const cutoff = new Date(new Date(nowIso).getTime() - silenceMs).toISOString();
    const { INTENCOES_DE_RECUSA, RESGATE_MAX_POR_LEAD } = require('./prospect-state');
    const recusas = [...INTENCOES_DE_RECUSA];
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('*')
      .not('last_in_at', 'is', null)
      .lte('last_in_at', cutoff)
      .in('prospect_state', REENGAGE_STATES)
      // Quem já disse não sai aqui, antes de gastar claim e template. O
      // predicado elegivelParaReengage barra de novo no chamador — duas
      // camadas de propósito: esta consulta é a barata, aquela é a que
      // enxerga o histórico. (Banzeiro levou 7 resgates por faltarem as duas.)
      .or(`last_intent.is.null,last_intent.not.in.(${recusas.join(',')})`)
      // Quem estourou o teto sai já na consulta. O predicado barra de novo no
      // chamador — 9 leads herdaram contador >= 3 do backfill de 02/08.
      .lt('resgates_enviados', RESGATE_MAX_POR_LEAD)
      .is('reuniao_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
      .order('last_in_at', { ascending: false })
      .limit(limit * 3); // caller filters by last-message shape; over-select to fill the batch
    if (error) { logger.error('selectDueReengages failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectDueReengages exception:', err.message);
    return [];
  }
}

/** Last message in either direction (drives re-engage eligibility). */
async function loadLastMessage(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_messages')
      .select('direcao, tipo, corpo, enviada_em')
      .eq('lead_id', leadId)
      .neq('tipo', 'sys')
      .order('enviada_em', { ascending: false })
      .limit(1);
    if (error) { logger.error('loadLastMessage failed:', error.message); return null; }
    return (Array.isArray(data) && data[0]) || null;
  } catch { return null; }
}

// ---- Style packs (Phase 10 gym) --------------------------------------------
// The ACTIVE pack is appended to the production system prompt on every LLM
// call — editing + activating a pack tunes the live brain without a deploy.
// Cached briefly so the per-inbound cost is one DB read every few minutes.
let _stylePackCache = { body: null, at: 0 };
const STYLE_PACK_TTL_MS = 3 * 60 * 1000;

async function getActiveStylePack() {
  if (Date.now() - _stylePackCache.at < STYLE_PACK_TTL_MS) return _stylePackCache.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_style_pack')
      .select('body, version')
      .eq('active', true)
      .maybeSingle();
    if (error) {
      logger.warn('getActiveStylePack failed (cached/none used):', error.message);
      return _stylePackCache.body;
    }
    _stylePackCache = { body: data ? data.body : null, at: Date.now() };
    return _stylePackCache.body;
  } catch (err) {
    logger.warn('getActiveStylePack exception:', err.message);
    return _stylePackCache.body;
  }
}

/** Invalidate the cache (called on activate so tuning applies immediately). */
function bustStylePackCache() {
  _stylePackCache = { body: null, at: 0 };
}

async function listStylePacks() {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_style_pack').select('*').order('version', { ascending: false });
    if (error) { logger.error('listStylePacks failed:', error.message); return []; }
    return data || [];
  } catch { return []; }
}

/** Save a NEW draft version (auto-increment; never overwrites history). */
async function saveStylePack({ body, label, notes }) {
  try {
    const texto = String(body || '').trim();
    if (!texto) return { ok: false, error: 'body required' };
    const { data: maxRow } = await supabaseAdmin
      .from('prospect_style_pack').select('version').order('version', { ascending: false }).limit(1);
    const version = (Array.isArray(maxRow) && maxRow[0] ? maxRow[0].version : 0) + 1;
    const { error } = await supabaseAdmin.from('prospect_style_pack').insert({
      version, body: texto,
      label: label ? String(label) : `v${version}`,
      notes: notes ? String(notes) : null,
      active: false,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Promote a version to production (single-active enforced by partial index). */
async function activateStylePack(version) {
  try {
    await supabaseAdmin.from('prospect_style_pack').update({ active: false }).eq('active', true);
    const { data, error } = await supabaseAdmin
      .from('prospect_style_pack').update({ active: true }).eq('version', version).select('version');
    if (error || !Array.isArray(data) || data.length === 0) {
      return { ok: false, error: (error && error.message) || 'version not found' };
    }
    bustStylePackCache();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Cockpit: list leads for the internal admin view (newest activity first).
 * Optional state filter. Returns the columns the cockpit list + status buckets need.
 * @param {{limit?: number, state?: string|null}} [opts]
 */
async function listProspectLeads({ limit = 100, state = null } = {}) {
  try {
    let q = supabaseAdmin
      .from('prospect_leads')
      .select('id, name, sector, city, whatsapp_phone, whatsapp_send_status, prospect_state, lead_score, owner_name, reuniao_at, reuniao_link, handoff_motivo, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (state) q = q.eq('prospect_state', state);
    const { data, error } = await q;
    if (error) { logger.error('listProspectLeads failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('listProspectLeads exception:', err.message);
    return [];
  }
}

/**
 * Cockpit: a lead's full row + chronological transcript (last `limit` messages).
 * @param {string} leadId
 * @param {number} [limit=200]
 * @returns {Promise<{lead: object, messages: Array}|null>}
 */
async function getProspectLeadWithMessages(leadId, limit = 200) {
  try {
    const { data: lead, error } = await supabaseAdmin
      .from('prospect_leads').select('*').eq('id', leadId).single();
    if (error || !lead) { logger.error('getProspectLeadWithMessages: lead not found', error && error.message); return null; }
    const { data: msgs } = await supabaseAdmin
      .from('prospect_messages')
      .select('direcao, corpo, tipo, enviada_em, status, status_at, error_detail, intent')
      .eq('lead_id', leadId)
      .order('enviada_em', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    return { lead, messages: Array.isArray(msgs) ? msgs.slice().reverse() : [] };
  } catch (err) {
    logger.error('getProspectLeadWithMessages exception:', err.message);
    return null;
  }
}

/** Outcomes captured at a terminal state that the daily cron hasn't scored yet. */
async function selectUnscoredOutcomes(limit = 25) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_outcomes')
      .select('id, lead_id, outcome')
      .is('quality_score', null)
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) { logger.error('selectUnscoredOutcomes failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectUnscoredOutcomes exception:', err.message);
    return [];
  }
}

/** Write the LLM quality_score (1–5) + theme_tags onto an outcome row. */
async function updateOutcomeScore(id, { quality_score, theme_tags }) {
  try {
    const { error } = await supabaseAdmin
      .from('prospect_outcomes')
      .update({ quality_score, theme_tags: (theme_tags && theme_tags.length) ? theme_tags : null })
      .eq('id', id);
    if (error) { logger.error('updateOutcomeScore failed:', error.message); return { ok: false }; }
    return { ok: true };
  } catch (err) {
    logger.error('updateOutcomeScore exception:', err.message);
    return { ok: false };
  }
}

// ---- Founder handoff digest + cold-handoff reclaim -------------------------
// Handoff drops a lead in the founder's court (SILENT_STATE). These selectors
// feed (1) the daily founder digest — the "close these" list — and (2) the
// reclaim sweep that re-warms handoffs the founder never chased.

/**
 * Leads waiting on the founder: handoff (asked for a human) + agendando (was
 * mid-scheduling). The founder digest's call-list. Newest activity first.
 * The founder's own TEST number is filtered by the caller (isFounderNumber),
 * not here, to keep the store free of persona imports.
 * @param {{maxAgeDays?: number|null, limit?: number}} [opts]
 */
async function selectFounderHandoffQueue({ maxAgeDays = null, limit = 50 } = {}) {
  try {
    let q = supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, whatsapp_phone, prospect_state, handoff_motivo, conversa_resumo, owner_name, last_in_at, updated_at, created_at')
      .in('prospect_state', ['handoff', 'agendando'])
      .not('whatsapp_phone', 'is', null);
    if (maxAgeDays && maxAgeDays > 0) {
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte('updated_at', cutoff);
    }
    const { data, error } = await q
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (error) { logger.error('selectFounderHandoffQueue failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectFounderHandoffQueue exception:', err.message);
    return [];
  }
}

/**
 * Fila da proposta por e-mail: leads em handoff COM endereço capturado e que
 * ainda NÃO receberam a proposta.
 *
 * Só 'handoff', deliberadamente. Um lead em 'conversando' está no meio de papo
 * com a Olímpia; mandar a proposta do fundador por fora atropelaria a conversa
 * dela e chegaria duplicado. O caminho certo é o e-mail entregue virar handoff
 * (regra 3c do prompt), e só então esta fila pegar.
 *
 * A idempotência é por marcador em prospect_messages, não por coluna nova: sem
 * migration, e o histórico do lead já é a fonte da verdade de tudo mais.
 */
async function selectFounderEmailQueue({ limit = 25 } = {}) {
  // require tardio: evita mexer no bloco de imports deste arquivo grande e não
  // há ciclo (founder-email só depende do claim-linter).
  const { PROPOSAL_MARKER } = require('./founder-email');
  try {
    const { data: leads, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, owner_name, prospect_email, prospect_state, whatsapp_phone, updated_at')
      .eq('prospect_state', 'handoff')
      .not('prospect_email', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) { logger.error('selectFounderEmailQueue failed:', error.message); return []; }
    if (!leads || leads.length === 0) return [];

    const ids = leads.map((l) => l.id);
    const { data: jaEnviados, error: errMsgs } = await supabaseAdmin
      .from('prospect_messages')
      .select('lead_id')
      .in('lead_id', ids)
      .like('corpo', `${PROPOSAL_MARKER}%`);
    if (errMsgs) {
      // Falha FECHADO: sem conseguir provar que ninguém já recebeu, não mande.
      // Reenviar proposta pro mesmo comprador é pior que atrasar um dia.
      logger.error('selectFounderEmailQueue: checagem de duplicata falhou:', errMsgs.message);
      return [];
    }

    const enviados = new Set((jaEnviados || []).map((m) => m.lead_id));
    return leads.filter((l) => !enviados.has(l.id));
  } catch (err) {
    logger.error('selectFounderEmailQueue exception:', err.message);
    return [];
  }
}

/**
 * Fila do WhatsApp do fundador: leads em handoff SEM e-mail capturado.
 *
 * A ausência de `prospect_email` no filtro é o que garante um canal por lead.
 * Quem deixou endereço é atendido pelo rail de e-mail, que leva a proposta
 * personalizada; sem isso os dois rails disputariam o mesmo lead e ele receberia
 * proposta e intro no mesmo dia.
 *
 * Intro ou follow-up é decisão pura (founder-whatsapp), tomada com o histórico
 * completo — por isso aqui só se estreita o universo.
 */
async function selectFounderWhatsappQueue({ limit = 25 } = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, owner_name, prospect_email, prospect_state, whatsapp_phone, last_in_at, updated_at')
      .eq('prospect_state', 'handoff')
      .is('prospect_email', null)
      .not('whatsapp_phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) { logger.error('selectFounderWhatsappQueue failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectFounderWhatsappQueue exception:', err.message);
    return [];
  }
}

/**
 * Candidatos a follow-up: leads que JÁ receberam a proposta e ainda NÃO
 * receberam follow-up. A decisão final (silêncio, espera cumprida) é pura e
 * mora em founder-email.followupDevido — aqui só se estreita o universo, porque
 * ela precisa do histórico completo e isso é uma consulta por lead.
 */
async function selectFounderFollowupCandidates({ limit = 25 } = {}) {
  const { PROPOSAL_MARKER, FOLLOWUP_MARKER } = require('./founder-email');
  try {
    const [{ data: comProposta, error: e1 }, { data: comFollowup, error: e2 }] = await Promise.all([
      supabaseAdmin.from('prospect_messages').select('lead_id').like('corpo', `${PROPOSAL_MARKER}%`),
      supabaseAdmin.from('prospect_messages').select('lead_id').like('corpo', `${FOLLOWUP_MARKER}%`),
    ]);
    if (e1 || e2) {
      // Falha FECHADO: sem saber quem já recebeu follow-up, não cobre ninguém.
      logger.error('selectFounderFollowupCandidates: consulta de marcadores falhou:', (e1 || e2).message);
      return [];
    }

    const jaFezFollowup = new Set((comFollowup || []).map((m) => m.lead_id));
    const ids = [...new Set((comProposta || []).map((m) => m.lead_id))].filter((id) => !jaFezFollowup.has(id));
    if (!ids.length) return [];

    const { data: leads, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, city, owner_name, prospect_email, prospect_state, whatsapp_phone, updated_at')
      .in('id', ids.slice(0, 200))
      .eq('prospect_state', 'handoff')
      .not('prospect_email', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) { logger.error('selectFounderFollowupCandidates failed:', error.message); return []; }
    return leads || [];
  } catch (err) {
    logger.error('selectFounderFollowupCandidates exception:', err.message);
    return [];
  }
}

/**
 * Handoff leads (coarse pass) for the reclaim sweep. No age filter in SQL: a
 * lead who came BACK and got muted can be recent, so the fine gate
 * (elegivelParaReclaim, needs the last-message shape) decides per-lead. Handoff
 * volume is low, so a small ordered batch is enough.
 * @param {number} [limit=20]
 */
async function selectHandoffLeads(limit = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, whatsapp_phone, prospect_state, last_in_at, updated_at')
      .eq('prospect_state', 'handoff')
      .not('whatsapp_phone', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) { logger.error('selectHandoffLeads failed:', error.message); return []; }
    return data || [];
  } catch (err) {
    logger.error('selectHandoffLeads exception:', err.message);
    return [];
  }
}

/**
 * Reclaim a cold handoff: flip handoff → conversando (un-mutes inbound + re-arms
 * the reengage/nudge rails). Guarded on the current state still being 'handoff'
 * so a concurrent transition (the lead opted out, the founder paused it) is
 * never clobbered. Returns { ok, reclaimed }.
 * @param {string} leadId
 */
async function reclaimHandoffToConversando(leadId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .update({ prospect_state: 'conversando' })
      .eq('id', leadId)
      .eq('prospect_state', 'handoff')
      .select('id');
    if (error) { logger.error('reclaimHandoffToConversando failed:', error.message); return { ok: false, reclaimed: false }; }
    return { ok: true, reclaimed: Array.isArray(data) && data.length === 1 };
  } catch (err) {
    logger.error('reclaimHandoffToConversando exception:', err.message);
    return { ok: false, reclaimed: false };
  }
}

// ---- Closed won ------------------------------------------------------------

/**
 * Mark a lead as CLOSED WON ('ganho' — terminal + silent).
 *
 * The founder usually closes offline (the digest's wa.me link), so nothing in
 * the pipeline knows. Left in 'handoff' the lead is both invisible (no selector
 * takes it) and at risk: the cold-handoff reclaim would flip it back to
 * 'conversando' and re-warm a paying customer with a sales template. This is the
 * one-tap that ends the conversation honestly — from the cockpit or the digest's
 * signed link.
 *
 * Pre-reads the current state so the caller can tell "already won" from a real
 * transition (the DB trigger only records an outcome on a CHANGE, so a repeat tap
 * must not log a duplicate event either). Refuses opt-out leads: LGPD wins, and
 * the optout-terminal trigger would revert the write anyway.
 *
 * Clears the proactive rails (next_touch_at / nudge_em / reply_apos) — belt and
 * braces, since every selector already whitelists active states.
 *
 * @param {string} leadId
 * @returns {Promise<{ok:boolean, updated:boolean, already:boolean, reason:string|null, lead:object|null}>}
 */
async function markLeadWon(leadId) {
  const fail = (reason, lead = null) => ({ ok: false, updated: false, already: false, reason, lead });
  try {
    const { data: before, error: readErr } = await supabaseAdmin
      .from('prospect_leads').select('id, name, prospect_state').eq('id', leadId).single();
    if (readErr || !before) return fail('nao_encontrado');
    if (before.prospect_state === 'optout') return fail('optout', before);
    if (before.prospect_state === WON_STATE) {
      return { ok: true, updated: false, already: true, reason: null, lead: before };
    }

    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .update({
        prospect_state: WON_STATE,
        status: 'cliente',
        next_touch_at: null,
        nudge_em: null,
        reply_apos: null,
      })
      .eq('id', leadId)
      .neq('prospect_state', 'optout') // concurrent LGPD stop wins the race
      .select('id, name, prospect_state');
    if (error) { logger.error('markLeadWon failed:', error.message); return fail('erro', before); }
    if (!Array.isArray(data) || data.length !== 1) return fail('conflito', before);
    return { ok: true, updated: true, already: false, reason: null, lead: data[0] };
  } catch (err) {
    logger.error('markLeadWon exception:', err.message);
    return fail('erro');
  }
}

module.exports = {
  isOptedOut,
  findLeadByPhone,
  selectFounderHandoffQueue,
  selectFounderEmailQueue,
  selectFounderFollowupCandidates,
  selectFounderWhatsappQueue,
  selectHandoffLeads,
  reclaimHandoffToConversando,
  markLeadWon,
  storeMessage,
  loadHistory,
  patchLead,
  recordOptout,
  phoneMatchCandidates,
  upsertDiscoveredLeads,
  selectIntroCandidates,
  createReferralLead,
  selectReferralIntroCandidates,
  claimIntro,
  markIntro,
  selectDueFlush,
  selectArquivaveis,
  ultimaSaidaPorLead,
  selectResgateCandidates,
  selectDueRetornos,
  selectNoshowDue,
  loadLastInbound,
  inboundFingerprint,
  claimInbound,
  releaseInbound,
  selectNudgeStates,
  recordEvent,
  recordNote,
  updateIntent,
  getActiveStylePack,
  bustStylePackCache,
  listStylePacks,
  saveStylePack,
  activateStylePack,
  listTemplates,
  upsertTemplate,
  listCanned,
  upsertCanned,
  deleteCanned,
  selectDueTouches,
  selectDueReengages,
  REENGAGE_STATES,
  loadLastMessage,
  listProspectLeads,
  getProspectLeadWithMessages,
  selectUnscoredOutcomes,
  updateOutcomeScore,
};
