/**
 * Cron Job: Proactive Guest Communications (C6)
 *
 * Identifies re-engagement opportunities, generates AI-drafted personalised
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
const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronProactiveComms');

const QUEUE_TTL_DAYS = 14;             // pending opportunities expire after 14 days
const MIN_DAYS_BEFORE_OCCASION = 3;    // queue an occasion 14 → 3 days out
const MAX_DAYS_BEFORE_OCCASION = 14;
const MIN_CHURN_RISK = 70;
const MIN_VISITS_FOR_CHURN = 3;
const MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN = 25;

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
  };

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

    // 3. For each restaurant, find opportunities and queue them
    for (const restaurant of restaurants || []) {
      try {
        const occasions = await findUpcomingOccasionsForRestaurant(restaurant.id);
        const atRisk = await findAtRiskCustomersForRestaurant(restaurant.id);

        const opportunities = [
          ...occasions.map(o => ({ ...o, type: 'occasion' })),
          ...atRisk.map(c => ({ ...c, type: 'churn_risk' })),
        ].slice(0, MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN);

        for (const opp of opportunities) {
          const result = await queueOpportunity(restaurant, opp);
          if (result.queued) {
            if (opp.type === 'occasion') stats.occasions_queued++;
            else stats.churn_queued++;
          } else if (result.duplicate) {
            stats.skipped_duplicate++;
          }
        }

        stats.restaurants_processed++;
      } catch (err) {
        logger.error('Error processing restaurant', { restaurantId: restaurant.id, error: err.message });
        stats.errors++;
      }
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

/** Birthdays / anniversaries stored on customer_ltv.special_occasions JSONB */
async function findUpcomingOccasionsForRestaurant(restaurantId) {
  try {
    const { data: customers, error } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('customer_id, customer_phone, customer_name, customer_tier, special_occasions, total_visits')
      .eq('restaurant_id', restaurantId)
      .not('special_occasions', 'is', null)
      .not('customer_phone', 'is', null);

    if (error || !customers) return [];

    const now = new Date();
    const minDate = addDays(now, MIN_DAYS_BEFORE_OCCASION);
    const maxDate = addDays(now, MAX_DAYS_BEFORE_OCCASION);
    const thisYear = now.getFullYear();

    const upcoming = [];
    for (const c of customers) {
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
    return upcoming;
  } catch (error) {
    logger.error('findUpcomingOccasionsForRestaurant error', { error: error.message });
    return [];
  }
}

/** High-churn-risk customers from customer_ltv */
async function findAtRiskCustomersForRestaurant(restaurantId) {
  try {
    const { data: atRisk, error } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('customer_id, customer_phone, customer_name, customer_tier, churn_risk_score, last_visit_date, total_visits, avg_revenue_per_visit')
      .eq('restaurant_id', restaurantId)
      .gte('churn_risk_score', MIN_CHURN_RISK)
      .gte('total_visits', MIN_VISITS_FOR_CHURN)
      .not('customer_phone', 'is', null)
      .order('churn_risk_score', { ascending: false })
      .limit(MAX_OPPORTUNITIES_PER_RESTAURANT_PER_RUN);

    if (error || !atRisk) return [];

    return atRisk.map(c => ({
      customer_id: c.customer_id,
      customer_phone: c.customer_phone,
      customer_name: c.customer_name,
      customer_tier: c.customer_tier,
      total_visits: c.total_visits,
      avg_revenue_per_visit: c.avg_revenue_per_visit,
      churn_risk: c.churn_risk_score,
      last_visit: c.last_visit_date,
      suggested_action: `${c.customer_tier || 'regular'} guest at ${c.churn_risk_score}% churn risk — ${c.total_visits} visits, last seen ${c.last_visit_date || 'unknown'}`,
    }));
  } catch (error) {
    logger.error('findAtRiskCustomersForRestaurant error', { error: error.message });
    return [];
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

  // Generate AI message draft (Haiku — cheap)
  let draftMessage = null;
  try {
    draftMessage = await generateDraftMessage(restaurant, opp, lang);
  } catch (err) {
    logger.warn('Draft message generation failed (will queue without draft)', {
      restaurantId: restaurant.id,
      type: opp.type,
      error: err.message,
    });
  }

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
// AI DRAFT GENERATION
// ────────────────────────────────────────────────────────────────────────────

/** Generate a personalised WhatsApp-friendly draft (PT/ES/EN) using Haiku. */
async function generateDraftMessage(restaurant, opp, lang) {
  const ai = getAI();
  if (!ai) return null;

  const customerName = opp.customer_name || (lang === 'pt-BR' ? 'cliente' : lang === 'es' ? 'cliente' : 'guest');

  const systemPrompt = lang === 'pt-BR'
    ? 'Você escreve mensagens curtas de WhatsApp para clientes de um restaurante. 2-3 frases, calorosas, personalizadas, sem emojis exagerados (máximo 1). Em português brasileiro.'
    : lang === 'es'
      ? 'Escribes mensajes cortos de WhatsApp para clientes de un restaurante. 2-3 frases, cálidas, personalizadas, sin emojis excesivos (máximo 1). En español.'
      : 'You write short WhatsApp messages to a restaurant\'s customers. 2-3 sentences, warm, personalised, max 1 emoji. In English.';

  let userPrompt;
  if (opp.type === 'occasion') {
    userPrompt = lang === 'pt-BR'
      ? `Restaurante: "${restaurant.restaurant_name}". Cliente: ${customerName}. Ocasião: ${opp.occasion_label} em ${opp.occasion_date}. Já veio ${opp.total_visits || 0}x. Escreva uma mensagem convidando para celebrar conosco.`
      : lang === 'es'
        ? `Restaurante: "${restaurant.restaurant_name}". Cliente: ${customerName}. Ocasión: ${opp.occasion_label} el ${opp.occasion_date}. Ha venido ${opp.total_visits || 0} veces. Escribe un mensaje invitándole a celebrar con nosotros.`
        : `Restaurant: "${restaurant.restaurant_name}". Guest: ${customerName}. Occasion: ${opp.occasion_label} on ${opp.occasion_date}. Visited ${opp.total_visits || 0}x. Write a message inviting them to celebrate with us.`;
  } else {
    // churn_risk
    userPrompt = lang === 'pt-BR'
      ? `Restaurante: "${restaurant.restaurant_name}". Cliente regular: ${customerName} (${opp.total_visits} visitas). Não vem desde ${opp.last_visit || 'há tempo'}. Escreva uma mensagem genuína convidando para voltar — sem soar como spam.`
      : lang === 'es'
        ? `Restaurante: "${restaurant.restaurant_name}". Cliente habitual: ${customerName} (${opp.total_visits} visitas). No viene desde ${opp.last_visit || 'hace tiempo'}. Escribe un mensaje genuino invitándole a volver — sin sonar a spam.`
        : `Restaurant: "${restaurant.restaurant_name}". Regular guest: ${customerName} (${opp.total_visits} visits). Hasn't visited since ${opp.last_visit || 'a while'}. Write a genuine welcome-back message — not spammy.`;
  }

  const response = await ai.messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.7,
  });

  const text = (response.content || []).map(b => b.text || '').join('').trim();
  return text || null;
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

  // churn_risk
  const lastSeen = opp.last_visit || (lang === 'pt-BR' ? 'desconhecido' : lang === 'es' ? 'desconocido' : 'unknown');
  if (lang === 'pt-BR') {
    return `${tierLabel} com ${opp.churn_risk}% de risco de churn — ${opp.total_visits} visitas, última em ${lastSeen}`;
  }
  if (lang === 'es') {
    return `${tierLabel} con ${opp.churn_risk}% de riesgo de fuga — ${opp.total_visits} visitas, última el ${lastSeen}`;
  }
  return `${tierLabel} at ${opp.churn_risk}% churn risk — ${opp.total_visits} visits, last seen ${lastSeen}`;
}

// Exported for testing
module.exports.findUpcomingOccasionsForRestaurant = findUpcomingOccasionsForRestaurant;
module.exports.findAtRiskCustomersForRestaurant = findAtRiskCustomersForRestaurant;
module.exports.parseOccasionDate = parseOccasionDate;
module.exports.normaliseLang = normaliseLang;
module.exports.formatSuggestedAction = formatSuggestedAction;
