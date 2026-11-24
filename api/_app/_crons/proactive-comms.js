/**
 * Cron Job: Proactive Guest Communications (C6)
 *
 * Identifies re-engagement opportunities, generates grounded personalised
 * messages, and queues them in `restaurant.proactive_comms_queue` for manager
 * review. Managers approve/edit drafts in the dashboard, then the API sends
 * the message via WhatsApp.
 *
 * Triggers (per restaurant):
 *   1. Upcoming birthdays/anniversaries from customer_ltv.special_occasions (next 14 days)
 *   2. At-risk churning customers (churn_risk_score >= 70, total_visits >= 3)
 *
 * Lifecycle of a queued opportunity:
 *   pending -> approved (manager) -> sent (POST /api/proactive-comms?action=send)
 *           -> dismissed (manager declined)
 *           -> expired (no manager action within 14 days)
 *
 * Schedule: weekly Sundays at 10 AM UTC (cron: "0 10 * * 0").
 *
 * Defensive: gracefully no-ops if the proactive_comms_queue table doesn't
 * exist yet (deploy may land before the migration is applied via Studio).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronProactiveComms');

const QUEUE_TTL_DAYS = 14;             // pending opportunities expire after 14 days
const MIN_DAYS_BEFORE_OCCASION = 3;    // queue an occasion 14 → 3 days out
const MAX_DAYS_BEFORE_OCCASION = 14;
const MIN_CHURN_RISK = 70;
const MIN_VISITS_FOR_CHURN = 3;
const MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN = 25;

// O CONSERTO DE 25/08/2026 — por que este cron parou de terminar.
//
// Ele NÃO estava parado: rodou nos domingos 16/08 e 23/08 e gravou linhas na
// proactive_comms_queue às 10:0x. O que sumiu foi o registro em cron_runs, que
// é a ÚLTIMA linha do handler — ou seja, ele começava, trabalhava e morria no
// meio. `cron_runs` é o registro de rodada COMPLETA, não de rodada INVOCADA;
// ler a ausência de linha como "o cron não roda" é concluir sobre uma camada
// medindo outra.
//
// Por que morria: o custo por rodada crescia sozinho.
//   - 2 consultas POR RESTAURANTE (46 restaurantes = 92 idas ao banco);
//   - 1 chamada de LLM POR OPORTUNIDADE, feita ANTES do INSERT — inclusive para
//     as que o índice único ia rejeitar como duplicadas. Com 36 linhas já
//     pendentes na fila, eram 36 chamadas de Haiku por rodada cujo único
//     destino era o erro 23505.
// Em 09/08 eram ~16 oportunidades e a rodada terminou em ~115s do disparo.
// Depois disso a população em risco subiu para ~56 e a rodada passou do teto
// de 60s do vercel.json. Não havia recuperação possível: cada semana ficava
// mais lenta que a anterior.
//
// O conserto tem três partes, e a terceira é a que importa mais:
//   1. as consultas de candidatos viraram 3 no total, não 2 por restaurante;
//   2. a deduplicação acontece ANTES da geração do rascunho, não depois;
//   3. orçamento de tempo conferido DENTRO do laço de oportunidades. A lição do
//      update-churn-scores (24/08) foi exatamente esta: orçamento conferido só
//      ENTRE restaurantes não protege de nada, porque um restaurante grande
//      atravessa o limite inteiro sem ninguém olhar. Agora a rodada sempre
//      alcança o logCronRun e diz honestamente o que deixou para a semana
//      seguinte, em vez de morrer em silêncio.
// Em 12/10/2026 o rascunho passou a ser determinístico: o LLM inventava
// pratos favoritos e vantagens que não constavam nos dados do cliente.
const TIME_BUDGET_MS = 45_000;
// Teto de leitura dos candidatos. Alto de propósito: limitar a LEITURA é o que
// cria fome de fila (ver MAX_ARQUIVO_CANDIDATOS em prospect-score-outcomes.js).
// Quem limita o trabalho aqui é o orçamento de tempo, não o tamanho da leitura.
const MAX_CANDIDATOS_LIDOS = 5000;

module.exports = async (req, res) => {
  // Verify cron auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — ops can disable via cron_config table.
  if (!(await isCronEnabled('proactive-comms'))) {
    logger.warn('proactive-comms cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  const stats = {
    restaurants_processed: 0,
    occasions_queued: 0,
    churn_queued: 0,
    skipped_duplicate: 0,
    expired: 0,
    errors: 0,
    // Quantos restaurantes ficaram para a semana que vem por falta de tempo.
    // Existe para que "acabou o orçamento" seja um número visível em cron_runs
    // e não um silêncio, que é como este cron se machucou.
    restaurants_deferred: 0,
  };
  const prazoFinal = Date.now() + TIME_BUDGET_MS;

  try {
    logger.info('Starting weekly proactive comms scan...');

    // 1. Expire stale pending items first (cleans up after manager inactivity)
    stats.expired = await expireStalePendingItems();

    // 2. List all active restaurants
    const { data: restaurants, error: restErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, agent_language, country');

    if (restErr) {
      logger.error('Failed to load restaurants', { error: restErr.message });
      return res.status(500).json({ success: false, error: 'restaurant_load_failed' });
    }

    const ids = (restaurants || []).map(r => r.id);

    // 3. Candidatos e fila pendente: TRÊS consultas no total, não duas por
    // restaurante. Com 46 restaurantes isso derruba 92 idas ao banco para 3.
    const [ocasioesPorRest, riscoPorRest, jaPendentes] = await Promise.all([
      findUpcomingOccasions(ids),
      findAtRiskCustomers(ids),
      loadPendingKeys(ids),
    ]);

    // 4. Para cada restaurante, monta a lista e enfileira
    for (const restaurant of restaurants || []) {
      // Orçamento conferido ANTES de pegar o próximo restaurante — e de novo
      // dentro do laço de oportunidades, logo abaixo.
      if (Date.now() >= prazoFinal) {
        stats.restaurants_deferred = ids.length - stats.restaurants_processed;
        break;
      }
      try {
        const occasions = ocasioesPorRest.get(restaurant.id) || [];
        const atRisk = riscoPorRest.get(restaurant.id) || [];

        const opportunities = [
          ...occasions.map(o => ({ ...o, type: 'occasion' })),
          ...atRisk.map(c => ({ ...c, type: 'churn_risk' })),
        ].slice(0, MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN);

        for (const opp of opportunities) {
          // Deduplicar antes de montar o rascunho e tentar o INSERT.
          if (jaPendentes.has(chaveFila(restaurant.id, opp.type, opp.customer_phone))) {
            stats.skipped_duplicate++;
            continue;
          }
          if (Date.now() >= prazoFinal) {
            stats.restaurants_deferred = ids.length - stats.restaurants_processed;
            break;
          }

          const result = await queueOpportunity(restaurant, opp);
          if (result.queued) {
            if (opp.type === 'occasion') stats.occasions_queued++;
            else stats.churn_queued++;
          } else if (result.duplicate) {
            // Backstop: o índice único continua sendo a verdade. Se cair aqui
            // é porque o conjunto acima estava velho (corrida com o painel).
            stats.skipped_duplicate++;
          }
        }

        stats.restaurants_processed++;
      } catch (err) {
        logger.error('Error processing restaurant', { restaurantId: restaurant.id, error: err.message });
        stats.errors++;
      }
    }

    if (stats.restaurants_deferred > 0) {
      logger.warn('orçamento de tempo esgotado; restaurantes adiados para a próxima rodada', {
        deferred: stats.restaurants_deferred,
        processed: stats.restaurants_processed,
      });
    }

    logger.info('Proactive comms scan complete', stats);

    await logCronRun('proactive-comms', stats);

    return res.status(200).json({ success: true, ...stats });
  } catch (error) {
    logger.error('Proactive comms cron error:', error.message);
    await logCronRun('proactive-comms', { ...stats, fatal_error: error.message });
    return res.status(500).json({ success: false, error: 'Proactive comms processing failed' });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY DETECTION
// ────────────────────────────────────────────────────────────────────────────

/** Chave do índice único parcial `idx_pcq_active_dedup`: uma linha PENDENTE por
 *  (restaurante, tipo, telefone). Usada para deduplicar antes do INSERT. */
function chaveFila(restaurantId, type, phone) {
  return `${restaurantId}|${type}|${phone}`;
}

/** Tudo que já está pendente na fila, numa consulta só. */
async function loadPendingKeys(restaurantIds) {
  const chaves = new Set();
  if (!restaurantIds.length) return chaves;
  try {
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('proactive_comms_queue')
      .select('restaurant_id, type, customer_phone')
      .eq('status', 'pending')
      .in('restaurant_id', restaurantIds)
      .limit(MAX_CANDIDATOS_LIDOS);

    // Tabela ausente (migração não aplicada) já é tratada no INSERT; aqui um
    // conjunto vazio só faz cair no backstop do 23505, que é o comportamento
    // antigo. Nunca derruba a rodada.
    if (error || !data) return chaves;
    for (const r of data) chaves.add(chaveFila(r.restaurant_id, r.type, r.customer_phone));
  } catch (err) {
    logger.warn('loadPendingKeys falhou; seguindo sem dedupe prévio', { error: err.message });
  }
  return chaves;
}

/** Birthdays / anniversaries stored on customer_ltv.special_occasions JSONB.
 *  Uma consulta para TODOS os restaurantes → Map<restaurant_id, oportunidade[]>. */
async function findUpcomingOccasions(restaurantIds) {
  const porRestaurante = new Map();
  if (!restaurantIds.length) return porRestaurante;
  try {
    const { data: customers, error } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('restaurant_id, customer_id, customer_phone, customer_name, customer_tier, special_occasions, total_visits')
      .in('restaurant_id', restaurantIds)
      .not('special_occasions', 'is', null)
      .not('customer_phone', 'is', null)
      .limit(MAX_CANDIDATOS_LIDOS);

    if (error || !customers) return porRestaurante;

    const now = new Date();
    const minDate = addDays(now, MIN_DAYS_BEFORE_OCCASION);
    const maxDate = addDays(now, MAX_DAYS_BEFORE_OCCASION);
    const thisYear = now.getFullYear();

    for (const c of customers) {
      if (!porRestaurante.has(c.restaurant_id)) porRestaurante.set(c.restaurant_id, []);
      const upcoming = porRestaurante.get(c.restaurant_id);
      const occasions = c.special_occasions || {};
      // special_occasions schema is flexible: { birthday: '06-15', anniversary: '12-20', ... }
      // We accept MM-DD or YYYY-MM-DD strings
      for (const [label, dateStr] of Object.entries(occasions)) {
        if (typeof dateStr !== 'string') continue;
        const occDate = parseOccasionDate(dateStr, thisYear);
        if (!occDate) continue;
        if (occDate >= minDate && occDate <= maxDate) {
          upcoming.push({
            customer_id: c.customer_id,
            customer_phone: c.customer_phone,
            customer_name: c.customer_name,
            customer_tier: c.customer_tier,
            total_visits: c.total_visits,
            occasion_label: label,
            occasion_date: occDate.toISOString().split('T')[0],
            suggested_action: `${label} on ${occDate.toISOString().split('T')[0]} — invite ${c.customer_name || c.customer_phone}`,
          });
        }
      }
    }
    return porRestaurante;
  } catch (error) {
    logger.error('findUpcomingOccasions error', { error: error.message });
    return porRestaurante;
  }
}

/** High-churn-risk customers from customer_ltv.
 *  Uma consulta para TODOS os restaurantes → Map<restaurant_id, oportunidade[]>.
 *  O teto por restaurante, que antes era um .limit() por consulta, vira um corte
 *  em memória — mesmo resultado, uma ida ao banco em vez de 46. */
async function findAtRiskCustomers(restaurantIds) {
  const porRestaurante = new Map();
  if (!restaurantIds.length) return porRestaurante;
  try {
    const { data: atRisk, error } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('restaurant_id, customer_id, customer_phone, customer_name, customer_tier, churn_risk_score, last_visit_date, total_visits, avg_revenue_per_visit')
      .in('restaurant_id', restaurantIds)
      .gte('churn_risk_score', MIN_CHURN_RISK)
      .gte('total_visits', MIN_VISITS_FOR_CHURN)
      .not('customer_phone', 'is', null)
      .order('churn_risk_score', { ascending: false })
      .limit(MAX_CANDIDATOS_LIDOS);

    if (error || !atRisk) return porRestaurante;

    for (const c of atRisk) {
      if (!porRestaurante.has(c.restaurant_id)) porRestaurante.set(c.restaurant_id, []);
      const lista = porRestaurante.get(c.restaurant_id);
      // Ordenado por risco desc na consulta, então o corte mantém os piores.
      if (lista.length >= MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN) continue;
      lista.push({
        customer_id: c.customer_id,
        customer_phone: c.customer_phone,
        customer_name: c.customer_name,
        customer_tier: c.customer_tier,
        total_visits: c.total_visits,
        avg_revenue_per_visit: c.avg_revenue_per_visit,
        churn_risk: c.churn_risk_score,
        last_visit: c.last_visit_date,
        suggested_action: `Score ${c.churn_risk_score}/100 — ${c.total_visits} visits, last seen ${c.last_visit_date || 'unknown'}`,
      });
    }
    return porRestaurante;
  } catch (error) {
    logger.error('findAtRiskCustomers error', { error: error.message });
    return porRestaurante;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// QUEUE WRITES
// ────────────────────────────────────────────────────────────────────────────

/** Try to queue one opportunity. Returns { queued, duplicate, error }.
 *  The partial unique index `idx_pcq_active_dedup` blocks duplicate PENDING
 *  rows for the same (restaurant, type, phone) so we just ignore the conflict. */
async function queueOpportunity(restaurant, opp) {
  const expiresAt = addDays(new Date(), QUEUE_TTL_DAYS).toISOString();
  const lang = normaliseLang(restaurant.agent_language);

  // Build a grounded draft from facts we actually have. A previous LLM draft
  // claimed guests had a favourite dish without any menu/preference evidence.
  const draftMessage = generateDraftMessage(restaurant, opp, lang);

  const triggerData = opp.type === 'occasion'
    ? { occasion_label: opp.occasion_label, occasion_date: opp.occasion_date, total_visits: opp.total_visits }
    : { churn_risk: opp.churn_risk, customer_tier: opp.customer_tier, total_visits: opp.total_visits, last_visit: opp.last_visit, avg_spend: opp.avg_revenue_per_visit };

  // H3: render suggested_action in the restaurant's language so Brazilian
  // managers don't see "at_risk guest at 75% churn risk — 4 visits, last
  // seen 2026-04-17" on their PT-BR dashboard.
  const localizedAction = formatSuggestedAction(opp, lang);

  const row = {
    restaurant_id: restaurant.id,
    type: opp.type,
    customer_phone: opp.customer_phone,
    customer_name: opp.customer_name || null,
    customer_id: opp.customer_id || null,
    trigger_data: triggerData,
    draft_message: draftMessage,
    suggested_action: localizedAction,
    status: 'pending',
    expires_at: expiresAt,
  };

  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('proactive_comms_queue')
    .insert(row);

  if (error) {
    // 23505 = unique_violation — partial index already has a pending row. Expected.
    if (error.code === '23505') return { queued: false, duplicate: true };
    // 42P01 (postgres) / PGRST205 (PostgREST cache miss) — migration not yet
    // applied. Skip silently so the cron doesn't fail loudly until ready.
    if (error.code === '42P01' || error.code === 'PGRST205') {
      logger.warn('proactive_comms_queue table missing — apply migration 20260430_proactive_comms_queue.sql', { restaurantId: restaurant.id });
      return { queued: false, error: 'table_missing' };
    }
    logger.error('Failed to queue opportunity', { restaurantId: restaurant.id, type: opp.type, error: error.message });
    return { queued: false, error: error.message };
  }

  return { queued: true };
}

/** Expire pending items past their TTL. Returns count expired. */
async function expireStalePendingItems() {
  try {
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('proactive_comms_queue')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      // 42P01 (postgres) / PGRST205 (PostgREST) — migration not applied yet
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        logger.warn('expireStalePendingItems failed', { error: error.message });
      }
      return 0;
    }
    return (data || []).length;
  } catch (err) {
    return 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GROUNDED DRAFT GENERATION
// ────────────────────────────────────────────────────────────────────────────

/** Short WhatsApp draft using only known facts; a manager still approves it. */
function generateDraftMessage(restaurant, opp, lang) {
  const restaurantName = String(restaurant.restaurant_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!restaurantName) return null;

  const customerName = String(opp.customer_name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const language = normaliseLang(lang);
  const greeting = customerName
    ? language === 'pt-BR' ? `Oi, ${customerName}!` : language === 'es' ? `¡Hola, ${customerName}!` : `Hi, ${customerName}!`
    : language === 'pt-BR' ? 'Olá!' : language === 'es' ? '¡Hola!' : 'Hello!';

  if (opp.type === 'occasion') {
    const key = String(opp.occasion_label || '').trim().toLowerCase();
    const occasion = {
      birthday: { 'pt-BR': 'seu aniversário', es: 'tu cumpleaños', en: 'your birthday' },
      anniversary: { 'pt-BR': 'essa data especial', es: 'esa fecha especial', en: 'that special occasion' },
    }[key]?.[language] || { 'pt-BR': 'essa ocasião', es: 'esa ocasión', en: 'that occasion' }[language];

    if (language === 'pt-BR') return `${greeting} Aqui é da ${restaurantName}. Se quiser celebrar ${occasion} conosco, podemos ajudar com uma reserva.`;
    if (language === 'es') return `${greeting} Te escribimos desde ${restaurantName}. Si quieres celebrar ${occasion} con nosotros, podemos ayudarte con una reserva.`;
    return `${greeting} This is ${restaurantName}. If you would like to celebrate ${occasion} with us, we can help with a reservation.`;
  }

  if (opp.type !== 'churn_risk') return null;

  if (language === 'pt-BR') return `${greeting} Aqui é da ${restaurantName}. Será um prazer receber você novamente quando quiser. Podemos ajudar com uma reserva?`;
  if (language === 'es') return `${greeting} Te escribimos desde ${restaurantName}. Nos encantará recibirte de nuevo cuando quieras. ¿Te ayudamos con una reserva?`;
  return `${greeting} This is ${restaurantName}. We'd love to welcome you back whenever you'd like. Can we help with a reservation?`;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Accept "MM-DD", "YYYY-MM-DD", or month-name strings. Returns Date for THIS year. */
function parseOccasionDate(dateStr, thisYear) {
  const trimmed = String(dateStr).trim();

  // YYYY-MM-DD or MM-DD
  let m = trimmed.match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const d = new Date(thisYear, month, day);
    // If the date already passed this year, use next year
    if (d < new Date()) d.setFullYear(thisYear + 1);
    return d;
  }

  // Month name + day: "March 15", "Mar 15"
  m = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})$/i);
  if (m) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    const d = new Date(thisYear, month, day);
    if (d < new Date()) d.setFullYear(thisYear + 1);
    return d;
  }
  return null;
}

function normaliseLang(lng) {
  if (!lng) return 'pt-BR';
  if (lng === 'pt' || lng.startsWith('pt-')) return 'pt-BR';
  if (lng.startsWith('es')) return 'es';
  if (lng.startsWith('en')) return 'en';
  return 'pt-BR';
}

/** Format the dashboard subtitle for a queued opportunity in the restaurant's
 *  language. This text shows up on each card in the Re-engagement
 *  Opportunities panel — Brazilian managers should see PT, not English. */
function formatSuggestedAction(opp, lang) {
  const TIER_LABELS = {
    'pt-BR': { vip: 'VIP', regular: 'cliente regular', occasional: 'cliente ocasional', at_risk: 'cliente em risco', new: 'novo cliente' },
    es: { vip: 'VIP', regular: 'cliente habitual', occasional: 'cliente ocasional', at_risk: 'cliente en riesgo', new: 'cliente nuevo' },
    en: { vip: 'VIP', regular: 'regular guest', occasional: 'occasional guest', at_risk: 'at-risk guest', new: 'new guest' },
  };
  const tierLabel = (TIER_LABELS[lang] || TIER_LABELS['pt-BR'])[opp.customer_tier] || 'cliente';

  if (opp.type === 'occasion') {
    const guestName = opp.customer_name || opp.customer_phone;
    if (lang === 'pt-BR') return `${opp.occasion_label} em ${opp.occasion_date} — convidar ${guestName}`;
    if (lang === 'es') return `${opp.occasion_label} el ${opp.occasion_date} — invitar a ${guestName}`;
    return `${opp.occasion_label} on ${opp.occasion_date} — invite ${guestName}`;
  }

  // churn_risk: this is a heuristic score, not a calibrated probability.
  const lastSeen = opp.last_visit || (lang === 'pt-BR' ? 'desconhecido' : lang === 'es' ? 'desconocido' : 'unknown');
  if (lang === 'pt-BR') {
    return `${tierLabel} com pontuação de afastamento ${opp.churn_risk}/100 — ${opp.total_visits} visitas, última em ${lastSeen}`;
  }
  if (lang === 'es') {
    return `${tierLabel} con puntuación de abandono ${opp.churn_risk}/100 — ${opp.total_visits} visitas, última el ${lastSeen}`;
  }
  return `${tierLabel} with drift score ${opp.churn_risk}/100 — ${opp.total_visits} visits, last seen ${lastSeen}`;
}

// Exported for testing
module.exports.findUpcomingOccasions = findUpcomingOccasions;
module.exports.findAtRiskCustomers = findAtRiskCustomers;
module.exports.chaveFila = chaveFila;
module.exports.loadPendingKeys = loadPendingKeys;
module.exports.parseOccasionDate = parseOccasionDate;
module.exports.normaliseLang = normaliseLang;
module.exports.formatSuggestedAction = formatSuggestedAction;
module.exports.generateDraftMessage = generateDraftMessage;
