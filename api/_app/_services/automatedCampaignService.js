/**
 * Automated Campaign Service
 *
 * Processes trigger-based automated campaigns:
 * - post_visit_thank_you: fires after service completion
 * - birthday_reminder: fires 7 days before birthday
 * - anniversary_reminder: fires 7 days before anniversary
 * - lapsed_30d / lapsed_60d / lapsed_90d: fires for inactive customers
 * - review_request: fires 4h after service completion with Google Reviews link
 *
 * Dedup: unique per customer + trigger + period in automation_send_log
 * Rate limit: max 1 automated message per customer per week
 * Respects customer_consent opt-out
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { sendCampaignEmail } = require('./campaignEmailTemplates');

const logger = createSecureLogger('AutomatedCampaignService');

// Period key generators for dedup (one send per period)
function getCurrentWeek() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentDay() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if a customer was already sent this trigger in this period.
 */
async function wasSentInPeriod(restaurantId, customerId, triggerType, period) {
  const { data } = await supabaseAdmin
    .schema('restaurant')
    .from('automation_send_log')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('customer_id', customerId)
    .eq('trigger_type', triggerType)
    .eq('period', period)
    .maybeSingle();

  return !!data;
}

/**
 * Check global rate limit: max 1 automated campaign per customer per week.
 */
async function isRateLimited(restaurantId, customerId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .schema('restaurant')
    .from('automation_send_log')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('customer_id', customerId)
    .gte('sent_at', weekAgo);

  return (count || 0) >= 1;
}

/**
 * Record a send in the dedup log.
 */
async function recordSend(restaurantId, customerId, triggerType, period) {
  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('automation_send_log')
    .upsert({
      restaurant_id: restaurantId,
      customer_id: customerId,
      trigger_type: triggerType,
      period,
      sent_at: new Date().toISOString(),
    }, { onConflict: 'restaurant_id,customer_id,trigger_type,period' });

  if (error) {
    logger.warn('Failed to record automation send', { error: error.message });
  }
}

/**
 * Get opted-out customer phones for a restaurant.
 */
async function getOptedOutPhones(restaurantId) {
  const { data } = await supabaseAdmin
    .from('customer_consent')
    .select('customer_phone')
    .eq('restaurant_id', restaurantId)
    .eq('consent_type', 'marketing')
    .eq('opted_in', false);

  return new Set((data || []).map(c => c.customer_phone));
}

/**
 * Get restaurant config (name, language, etc.)
 */
async function getRestaurantConfig(restaurantId) {
  const { data } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, agent_language, slug')
    .eq('id', restaurantId)
    .single();

  return data || { restaurant_name: 'Our Restaurant', language: 'en' };
}

/**
 * Send an automated campaign message to a customer.
 * Returns true if sent, false if skipped.
 */
async function sendAutomatedMessage({
  restaurantId,
  customerId,
  customerEmail,
  customerName,
  triggerType,
  period,
  channel,
  templateData,
}) {
  // Check dedup
  const alreadySent = await wasSentInPeriod(restaurantId, customerId, triggerType, period);
  if (alreadySent) return false;

  // Check global rate limit
  const limited = await isRateLimited(restaurantId, customerId);
  if (limited) return false;

  // Send via email (WhatsApp can be added later)
  if (channel === 'email' && customerEmail) {
    const result = await sendCampaignEmail({
      triggerType,
      customerEmail,
      customerName: customerName || '',
      ...templateData,
    });

    if (result.sent) {
      await recordSend(restaurantId, customerId, triggerType, period);
      return true;
    }
    logger.warn('Automated email failed', { triggerType, reason: result.reason });
    return false;
  }

  // Channel not supported or no email — skip
  return false;
}

/**
 * O e-mail do cliente que acabou de jantar.
 *
 * `service_records` NAO tem `customer_email` — os dois selects deste arquivo
 * pediam essa coluna, e em PostgREST uma coluna inexistente derruba o select
 * inteiro. Com o `error` descartado (`const { data } = await ...`), `records`
 * vinha null, o laco rodava zero vezes e a funcao devolvia 0 enviados. Nem o
 * agradecimento pos-visita nem o pedido de avaliacao jamais sairam.
 *
 * O e-mail vive em `customer_ltv`, chaveado por restaurante + telefone. Uma
 * consulta em lote para todos os telefones da leva, em vez de uma por cliente.
 * Cobertura hoje: 453 de 648 visitas completas (70%) — quem nao tem e-mail
 * simplesmente nao recebe, como ja era a intencao.
 *
 * Nao da para usar embed do PostgREST aqui: `service_records` nao tem FK
 * nenhuma, entao a relacao nao existe para o PostgREST resolver.
 */
async function buscarEmailsPorTelefone(restaurantId, telefones) {
  const unicos = [...new Set((telefones || []).filter(Boolean))];
  if (!unicos.length) return new Map();

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_phone, customer_email')
    .eq('restaurant_id', restaurantId)
    .in('customer_phone', unicos);

  if (error) {
    logger.warn('Falha ao buscar e-mails no customer_ltv:', error.message);
    return new Map();
  }
  return new Map((data || [])
    .filter((c) => c.customer_email)
    .map((c) => [c.customer_phone, c.customer_email]));
}

/**
 * Process post-visit thank you.
 * Fires for service_records completed in the last 24h.
 */
async function processPostVisitThankYou(restaurantId, optedOutPhones, config) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: records, error } = await supabaseAdmin
    .from('service_records')
    .select('id, customer_phone, customer_name, actual_departure')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .gte('actual_departure', yesterday)
    .not('customer_phone', 'is', null)
    .limit(100);

  // Ler o error: era descarta-lo que deixava esta campanha morta
  // em silencio.
  if (error) {
    logger.error('post_visit_thank_you: falha ao ler service_records:', error.message);
    return 0;
  }

  const emails = await buscarEmailsPorTelefone(
    restaurantId,
    (records || []).map((r) => r.customer_phone),
  );

  let sentCount = 0;
  for (const record of records || []) {
    if (optedOutPhones.has(record.customer_phone)) continue;

    const sent = await sendAutomatedMessage({
      restaurantId,
      customerId: record.customer_phone,
      customerEmail: emails.get(record.customer_phone),
      customerName: record.customer_name,
      triggerType: 'post_visit_thank_you',
      period: getCurrentDay(),
      channel: 'email',
      templateData: {
        restaurantName: config.restaurant_name,
        unsubscribeUrl: buildUnsubscribeUrl(restaurantId, record.customer_phone),
      },
    });
    if (sent) sentCount++;
  }

  return sentCount;
}

/**
 * Process birthday reminders.
 * Fires 7 days before birthday from customer_ltv.special_occasions.
 */
async function processBirthdayReminder(restaurantId, optedOutPhones, config) {
  const { data: customers } = await supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_phone, customer_name, customer_email, special_occasions')
    .eq('restaurant_id', restaurantId)
    .not('customer_phone', 'is', null)
    .not('special_occasions', 'is', null)
    .limit(500);

  const now = new Date();
  const targetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();

  let sentCount = 0;
  for (const customer of customers || []) {
    if (optedOutPhones.has(customer.customer_phone)) continue;

    const occasions = customer.special_occasions;
    const birthday = occasions?.birthday || occasions?.Birthday;
    if (!birthday?.date) continue;

    const bday = new Date(birthday.date);
    if (bday.getMonth() + 1 !== targetMonth || bday.getDate() !== targetDay) continue;

    const sent = await sendAutomatedMessage({
      restaurantId,
      customerId: customer.customer_phone,
      customerEmail: customer.customer_email,
      customerName: customer.customer_name,
      triggerType: 'birthday_reminder',
      period: getCurrentMonth(),
      channel: 'email',
      templateData: {
        restaurantName: config.restaurant_name,
        unsubscribeUrl: buildUnsubscribeUrl(restaurantId, customer.customer_phone),
      },
    });
    if (sent) sentCount++;
  }

  return sentCount;
}

/**
 * Process lapsed customer campaigns.
 * Fires for customers who haven't visited in 30/60/90 days.
 */
async function processLapsedCustomer(restaurantId, optedOutPhones, config, daysThreshold) {
  const triggerType = `lapsed_${daysThreshold}d`;
  const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  // Only target customers whose last visit falls in the specific threshold window
  // e.g., for 30d: last visit between 30-31 days ago (to avoid re-triggering)
  const windowStart = new Date(Date.now() - (daysThreshold + 1) * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: customers } = await supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_phone, customer_name, customer_email, last_visit_date')
    .eq('restaurant_id', restaurantId)
    .not('customer_phone', 'is', null)
    .lte('last_visit_date', cutoffDate)
    .gte('last_visit_date', windowStart)
    .limit(200);

  let sentCount = 0;
  for (const customer of customers || []) {
    if (optedOutPhones.has(customer.customer_phone)) continue;

    const sent = await sendAutomatedMessage({
      restaurantId,
      customerId: customer.customer_phone,
      customerEmail: customer.customer_email,
      customerName: customer.customer_name,
      triggerType,
      period: getCurrentMonth(),
      channel: 'email',
      templateData: {
        restaurantName: config.restaurant_name,
        daysAway: daysThreshold,
        unsubscribeUrl: buildUnsubscribeUrl(restaurantId, customer.customer_phone),
      },
    });
    if (sent) sentCount++;
  }

  return sentCount;
}

/**
 * Process review request.
 * Fires 4h after service completion with Google Reviews link.
 */
async function processReviewRequest(restaurantId, optedOutPhones, config, automation) {
  if (!automation.google_review_url) return 0;

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

  const { data: records, error } = await supabaseAdmin
    .from('service_records')
    .select('id, customer_phone, customer_name, actual_departure')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .lte('actual_departure', fourHoursAgo)
    .gte('actual_departure', fiveHoursAgo)
    .not('customer_phone', 'is', null)
    .limit(100);

  // Ler o error: era descarta-lo que deixava esta campanha morta
  // em silencio.
  if (error) {
    logger.error('review_request: falha ao ler service_records:', error.message);
    return 0;
  }

  const emails = await buscarEmailsPorTelefone(
    restaurantId,
    (records || []).map((r) => r.customer_phone),
  );

  let sentCount = 0;
  for (const record of records || []) {
    if (optedOutPhones.has(record.customer_phone)) continue;

    const sent = await sendAutomatedMessage({
      restaurantId,
      customerId: record.customer_phone,
      customerEmail: emails.get(record.customer_phone),
      customerName: record.customer_name,
      triggerType: 'review_request',
      period: getCurrentDay(),
      channel: 'email',
      templateData: {
        restaurantName: config.restaurant_name,
        googleReviewUrl: automation.google_review_url,
        unsubscribeUrl: buildUnsubscribeUrl(restaurantId, record.customer_phone),
      },
    });
    if (sent) sentCount++;
  }

  return sentCount;
}

/**
 * Build an unsubscribe URL with signed token.
 */
function buildUnsubscribeUrl(restaurantId, customerPhone) {
  const crypto = require('crypto');
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not configured');
  const payload = `${restaurantId}:${customerPhone}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const baseUrl = process.env.CLIENT_URL || 'https://seatable.one';
  return `${baseUrl}/api/campaign-unsubscribe?rid=${restaurantId}&phone=${encodeURIComponent(customerPhone)}&sig=${signature}`;
}

/**
 * Process all enabled triggers for a restaurant.
 */
async function processAllTriggers(restaurantId) {
  // Fetch enabled automations
  const { data: automations, error } = await supabaseAdmin
    .schema('restaurant')
    .from('campaign_automations')
    .select('id, restaurant_id, trigger_type, enabled, channel, delay_minutes, google_review_url, template_name, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .eq('enabled', true);

  if (error || !automations?.length) return { total: 0 };

  const optedOutPhones = await getOptedOutPhones(restaurantId);
  const config = await getRestaurantConfig(restaurantId);

  const results = {};

  for (const automation of automations) {
    try {
      let count = 0;

      switch (automation.trigger_type) {
        case 'post_visit_thank_you':
          count = await processPostVisitThankYou(restaurantId, optedOutPhones, config);
          break;
        case 'birthday_reminder':
          count = await processBirthdayReminder(restaurantId, optedOutPhones, config);
          break;
        case 'lapsed_30d':
          count = await processLapsedCustomer(restaurantId, optedOutPhones, config, 30);
          break;
        case 'lapsed_60d':
          count = await processLapsedCustomer(restaurantId, optedOutPhones, config, 60);
          break;
        case 'lapsed_90d':
          count = await processLapsedCustomer(restaurantId, optedOutPhones, config, 90);
          break;
        case 'review_request':
          count = await processReviewRequest(restaurantId, optedOutPhones, config, automation);
          break;
        case 'anniversary_reminder':
          // Similar to birthday but using anniversary date — skip for now
          break;
        default:
          break;
      }

      results[automation.trigger_type] = count;
    } catch (err) {
      logger.error('Trigger processing failed', {
        trigger: automation.trigger_type,
        restaurantId,
        error: err.message,
      });
      results[automation.trigger_type] = 0;
    }
  }

  const total = Object.values(results).reduce((sum, n) => sum + n, 0);
  return { total, ...results };
}

module.exports = {
  processAllTriggers,
  buildUnsubscribeUrl,
  // Exportado para teste: e a peca que religa o e-mail das campanhas
  // pos-visita, e ela consulta OUTRA tabela que a do laco. Testa-la via
  // processAllTriggers exigiria montar restaurante, config e automacoes.
  buscarEmailsPorTelefone,
};
