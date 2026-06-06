/**
 * Manager Agent Handler
 *
 * Shared handler for both in-app chat and WhatsApp channels.
 * Routes all messages through the same memory + snapshot + conversation logic.
 */

const { getAI, AI_MODEL } = require('./ai-client');
const { retrieveRelevantMemories, writeMemory } = require('../services/managerMemory');
const { getRestaurantSnapshot } = require('../services/restaurantSnapshot');
const { buildRestaurantIdentitySection } = require('./persona-prompt-builder');
const { getWikiPages } = require('../services/wikiCompiler');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const { getPlanLimits } = require('../services/subscription-limits');
const { trackUsage } = require('./usage-tracking');
const { comparePeriods } = require('./periodCompare');
const { getLocalDate, getLocalTime } = require('./timezone');

const logger = createSecureLogger('manager-agent');

class ManagerQuotaError extends Error {
  constructor(type, data = {}) {
    super(type);
    this.name = 'ManagerQuotaError';
    this.type = type;           // 'upgrade_required' | 'quota_exceeded'
    this.used = data.used;
    this.limit = data.limit;
    this.plan = data.plan;
  }
}

const HISTORY_LIMIT = 20;

const VALID_PERIODS = [
  'last_7_days', 'last_30_days',
  'this_week', 'last_week',
  'this_month', 'last_month',
];

const MANAGER_TOOLS = [
  {
    name: 'compare_periods',
    description:
      'Compare reservation and cover metrics between two time periods for this restaurant. ' +
      'Use this when the manager asks how this week/month compares to last week/month, or asks about trends.',
    input_schema: {
      type: 'object',
      properties: {
        period_a: {
          type: 'string',
          enum: VALID_PERIODS,
          description: 'The baseline period (e.g. last_week)',
        },
        period_b: {
          type: 'string',
          enum: VALID_PERIODS,
          description: 'The comparison period (e.g. this_week)',
        },
      },
      required: ['period_a', 'period_b'],
    },
  },
];

// Fact patterns that trigger background memory extraction
const FACT_PATTERNS = [
  /we (open|close|serve|offer|have|use)/i,
  /our (menu|policy|staff|hours|special)/i,
];

async function getRestaurantPlan(restaurantId) {
  try {
    // Same dup-row hazard as manager-usage: Brazil onboarding inserts a
    // 'Free' status='active' row, and the Stripe webhook later inserts the
    // paid status='active' row without canceling the first. Order by
    // created_at DESC so the paid row wins after upgrade.
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_name, status')
      .eq('restaurant_id', restaurantId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      logger.error('getRestaurantPlan failed', { restaurantId, error: error.message });
      return 'free';
    }
    return (data?.[0]?.plan_name || 'free').toLowerCase();
  } catch (err) {
    logger.error('getRestaurantPlan unexpected error', { restaurantId, error: err.message });
    return 'free';
  }
}

async function getManagerAIUsageThisMonth(restaurantId) {
  try {
    const now = new Date();
    const firstDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const { data, error } = await supabaseAdmin
      .from('usage_tracking')
      .select('count')
      .eq('restaurant_id', restaurantId)
      .eq('metric_type', 'manager_ai_call')
      .gte('period', firstDay);
    if (error) {
      logger.error('getManagerAIUsageThisMonth failed', { restaurantId, error: error.message });
      return 0;
    }
    return (data || []).reduce((sum, row) => sum + (row.count || 0), 0);
  } catch (err) {
    logger.error('getManagerAIUsageThisMonth unexpected error', { restaurantId, error: err.message });
    return 0;
  }
}

async function getConversationHistory(restaurantId) {
  const { data, error } = await supabaseAdmin
    .from('manager_conversations')
    .select('role, content')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) {
    logger.error('getConversationHistory failed', { restaurantId, error: error.message });
  }
  return (data || []).reverse();
}

// When the target chat language doesn't match what the prior assistant turns
// were written in, the LLM tends to mirror the previous output language
// regardless of the system prompt. Detect a language mismatch and drop the
// stale history so the system prompt's language directive can win.
//
// We score the last assistant turn for PT/ES/EN markers and compare against
// the target language. Cheap heuristic — false positives just mean we drop
// history that would have stayed; false negatives leave the bug in place.
function shouldResetHistoryForLanguage(history, targetLanguage) {
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.content) return false;
  const txt = lastAssistant.content.toLowerCase();
  // Cheap language signature — common words that only appear in one language.
  const isEN = /\b(quiet|reservations|tonight|currently|tomorrow|please|the\b)/i.test(txt);
  const isPT = /\b(reservas|hoje|amanhã|noite|todo|tudo|você)/i.test(txt);
  const isES = /\b(reservas|hoy|mañana|noche|usted|por favor)/i.test(txt) && !isPT;
  if ((targetLanguage === 'pt' || targetLanguage === 'pt-BR') && isEN && !isPT) return true;
  if (targetLanguage === 'es' && isEN && !isES) return true;
  if (targetLanguage === 'en' && (isPT || isES)) return true;
  return false;
}

async function saveTurn(restaurantId, role, content, channel) {
  const { error } = await supabaseAdmin.from('manager_conversations').insert({
    restaurant_id: restaurantId,
    role,
    content,
    channel,
  });
  if (error) {
    logger.error('saveTurn failed', { restaurantId, role, error: error.message });
  }
}

function getCurrencyLocale(country) {
  const map = {
    BR: { currency: 'BRL', locale: 'pt-BR' },
    ES: { currency: 'EUR', locale: 'es-ES' },
    PT: { currency: 'EUR', locale: 'pt-PT' },
    JP: { currency: 'JPY', locale: 'ja-JP' },
    US: { currency: 'USD', locale: 'en-US' },
    GB: { currency: 'GBP', locale: 'en-GB' },
    FR: { currency: 'EUR', locale: 'fr-FR' },
    IT: { currency: 'EUR', locale: 'it-IT' },
    DE: { currency: 'EUR', locale: 'de-DE' },
    MX: { currency: 'MXN', locale: 'es-MX' },
    AR: { currency: 'ARS', locale: 'es-AR' },
  };
  return map[(country || '').toUpperCase()] || { currency: 'EUR', locale: 'en-US' };
}

// Derive a default chat language from the restaurant's country when the owner
// hasn't explicitly set agent_language. Falling back to 'en' for a Brazilian
// restaurant was a CX bug — owners ask "Como estão as reservas?" and got
// English back. This mirrors getCurrencyLocale()'s country mapping.
function languageFromCountry(country) {
  const map = {
    BR: 'pt-BR',
    PT: 'pt-BR',
    ES: 'es',
    MX: 'es',
    AR: 'es',
    FR: 'fr',
    IT: 'it',
    DE: 'en', // German not yet supported in the prompt switch — fall through to English
  };
  return map[(country || '').toUpperCase()] || 'en';
}

function buildSystemPrompt(memories, snapshot, config, wikiPages = [], dateInfo = {}) {
  const restaurantName = config?.restaurant_name || config?.name || 'this restaurant';
  const language =
    config?.agent_language ||
    config?.language ||
    languageFromCountry(config?.country);

  const memoryBlock =
    memories.length > 0
      ? memories
          .map((m) => '[' + m.type.toUpperCase() + '/' + m.category + '] ' + m.content)
          .join('\n')
      : 'No memories stored yet.';

  const upcomingLines = snapshot.upcoming_reservations
    .slice(0, 20)
    .map((r) => {
      const vipTag = r.customer_tier === 'vip'
        ? ' ★VIP'
        : r.customer_tier === 'regular'
          ? ' ★regular'
          : '';
      const visitInfo = r.visit_count ? ` (${r.visit_count} visits)` : '';
      const dietaryInfo = r.dietary_preferences?.length ? ` [DIETARY: ${r.dietary_preferences.join(', ')}]` : '';
      const occasionInfo = r.special_occasions
        ? Object.entries(r.special_occasions)
          .filter(([k]) => !k.startsWith('_'))
          .map(([type]) => type)
          .join(', ')
        : '';
      const seatingInfo = r.special_occasions?._seating_preference ? ` [SEATING: ${r.special_occasions._seating_preference}]` : '';
      const crmTags = [dietaryInfo, occasionInfo ? ` [${occasionInfo}]` : '', seatingInfo].filter(Boolean).join('');
      // Format time from separate date+time columns (no reservation_time exists).
      const timeLabel = r.time
        ? r.time.slice(0, 5)  // 'HH:MM' from 'HH:MM:SS'
        : '';
      return (
        '  - ' +
        (r.customer_name || 'Guest') +
        vipTag +
        visitInfo +
        crmTags +
        ', party of ' +
        r.party_size +
        (timeLabel ? ' at ' + timeLabel : '')
      );
    })
    .join('\n');

  const staffingLines = (snapshot.staffing_forecast || [])
    .map(f => f.day + ' ' + f.date + ': ' + f.expected_covers + ' covers → ' +
      f.roles.map(r => r.name + ': ' + r.recommended).join(', '))
    .join('\n');

  // Date/time context
  const timezone = config?.timezone || 'UTC';
  const localDate = dateInfo.localDate || getLocalDate(timezone);
  const localTime = dateInfo.localTime || getLocalTime(timezone);

  // Build identity section
  const identitySection = buildRestaurantIdentitySection(config || {});

  const toneDirective = '';

  const langLabel =
    language === 'pt' || language === 'pt-BR' ? 'Brazilian Portuguese (PT-BR)' :
    language === 'es' ? 'Spanish' :
    language === 'fr' ? 'French' :
    language === 'it' ? 'Italian' :
    'English';

  let systemPrompt =
    language === 'pt' || language === 'pt-BR'
      ? `Voce e o gerente IA do ${restaurantName}. Voce conhece este restaurante profundamente e ajuda o gerente a administrar o negocio.\n\nCRITICAL: Responda SEMPRE em Portugues Brasileiro. NUNCA responda em ingles ou outro idioma.\n\n`
      : language === 'es'
        ? `Eres el gerente IA de ${restaurantName}. Conoces este restaurante profundamente y ayudas al gerente a administrar el negocio.\n\nCRITICAL: Responde SIEMPRE en Espanol. NUNCA respondas en ingles u otro idioma.\n\n`
        : `You are the AI manager for ${restaurantName}. You know this restaurant deeply and help the manager run their business.\n\n`;

  // Inject restaurant soul between role and operational data
  if (identitySection) {
    systemPrompt += identitySection;
  }

  if (toneDirective) {
    systemPrompt += toneDirective + '\n\n';
  }

  const isPT = language === 'pt' || language === 'pt-BR';
  const isES = language === 'es';

  systemPrompt +=
    (isPT ? '## O que voce sabe sobre este restaurante\n' : isES ? '## Lo que sabes sobre este restaurante\n' : '## What You Know About This Restaurant\n') +
    memoryBlock +
    (isPT ? '\n\n## Status atual ao vivo\n' : isES ? '\n\n## Estado actual en vivo\n' : '\n\n## Current Live Status\n') +
    (isPT ? 'Reservas futuras: ' : isES ? 'Reservas futuras: ' : 'Upcoming reservations: ') + snapshot.upcoming_reservations.length + '\n' +
    upcomingLines + '\n' +
    (isPT ? 'Mesas ocupadas: ' : isES ? 'Mesas ocupadas: ' : 'Active parties: ') + snapshot.active_parties.length + '\n' +
    (isPT ? 'Lista de espera: ' : isES ? 'Lista de espera: ' : 'Waitlist: ') + snapshot.waitlist_count;

  if (staffingLines) {
    const staffingHeader = isPT
      ? '\n\n[PREVISÃO DE EQUIPE — PRÓXIMOS 3 DIAS]\n'
      : isES
        ? '\n\n[PREVISIÓN DE PERSONAL — PRÓXIMOS 3 DÍAS]\n'
        : '\n\n[STAFFING FORECAST - NEXT 3 DAYS]\n';
    systemPrompt += staffingHeader + staffingLines;
  }

  // M10: seating capacity — answers "are we full tonight?" with real data
  if (snapshot.capacity_summary && snapshot.capacity_summary.total_capacity > 0) {
    const cs = snapshot.capacity_summary;
    if (isPT) {
      systemPrompt += `\n\n[CAPACIDADE]\nLugares totais: ${cs.total_capacity}. Reservados hoje: ${cs.tonight_covers}${cs.occupancy_pct != null ? ` (${cs.occupancy_pct}% ocupado)` : ''}.`;
    } else if (isES) {
      systemPrompt += `\n\n[CAPACIDAD]\nPlazas totales: ${cs.total_capacity}. Reservadas hoy: ${cs.tonight_covers}${cs.occupancy_pct != null ? ` (${cs.occupancy_pct}% ocupado)` : ''}.`;
    } else {
      systemPrompt += `\n\n[CAPACITY]\nTotal seats: ${cs.total_capacity}. Booked tonight: ${cs.tonight_covers}${cs.occupancy_pct != null ? ` (${cs.occupancy_pct}% occupied)` : ''}.`;
    }
  }

  if (snapshot.deposit_summary && snapshot.deposit_summary.count > 0) {
    const { count, total_amount } = snapshot.deposit_summary;
    const { currency, locale } = getCurrencyLocale(config?.country);
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0 }).format(total_amount);
    if (isPT) {
      systemPrompt += `\n\n[DEPÓSITOS RETIDOS HOJE]\n${count} reserva${count !== 1 ? 's' : ''} com depósito retido — total de ${formatted} sob risco de captura por no-show.`;
    } else if (isES) {
      systemPrompt += `\n\n[DEPÓSITOS RETENIDOS HOY]\n${count} reserva${count !== 1 ? 's' : ''} con depósito retenido — total de ${formatted} en riesgo de captura por no-show.`;
    } else {
      systemPrompt += `\n\n[DEPOSITS HELD TONIGHT]\n${count} reservation${count !== 1 ? 's' : ''} with deposits held — total ${formatted} at risk of no-show capture.`;
    }
  }

  if (snapshot.feedback_summary && snapshot.feedback_summary.total > 0) {
    const fb = snapshot.feedback_summary;
    let feedbackBlock = isPT
      ? `\n\n[FEEDBACK RECENTE DOS CLIENTES — ÚLTIMOS 7 DIAS]`
      : isES
        ? `\n\n[FEEDBACK RECIENTE DE CLIENTES — ÚLTIMOS 7 DÍAS]`
        : `\n\n[RECENT GUEST FEEDBACK — LAST 7 DAYS]`;
    if (fb.avg_rating != null) {
      if (isPT) {
        feedbackBlock += `\nNota média: ${fb.avg_rating}/5 (${fb.answered_count} respostas, ${fb.response_rate}% de taxa de resposta)`;
      } else if (isES) {
        feedbackBlock += `\nValoración media: ${fb.avg_rating}/5 (${fb.answered_count} respuestas, ${fb.response_rate}% de tasa de respuesta)`;
      } else {
        feedbackBlock += `\nAvg rating: ${fb.avg_rating}/5 (${fb.answered_count} responses, ${fb.response_rate}% response rate)`;
      }
    }
    if (fb.recent?.length > 0) {
      const latest = fb.recent[0];
      const noComment = isPT ? 'Sem comentário' : isES ? 'Sin comentario' : 'No comment';
      const anonymous = isPT ? 'Anônimo' : isES ? 'Anónimo' : 'Anonymous';
      const latestLabel = isPT ? 'Mais recente' : isES ? 'Más reciente' : 'Latest';
      feedbackBlock += `\n${latestLabel}: "${latest.comment || noComment}" (${latest.rating}★) — ${latest.customer_name || anonymous}`;
    }
    systemPrompt += feedbackBlock;
  }

  // Date/time context — always inject so AI knows "today" and "now"
  systemPrompt += `\n\n[DATE & TIME]\nToday: ${localDate}\nCurrent time: ${localTime} (${timezone})`;

  // Wiki knowledge — compiled daily from raw data (Karpathy wiki pattern)
  if (wikiPages.length > 0) {
    systemPrompt += '\n\n[RESTAURANT KNOWLEDGE BASE — compiled from operational data]';
    for (const page of wikiPages) {
      systemPrompt += `\n\n### ${page.title}\n${page.content}`;
    }
  }

  // Response style rules — written in the target language for maximum compliance
  if (isPT) {
    systemPrompt +=
      '\n\n## Regras de resposta\n' +
      '- Seja CONCISO. Padrao de 3-5 frases. So de briefings completos quando pedido.\n' +
      '- Para perguntas especificas ("quantas reservas?"), de a resposta PRIMEIRO em uma linha.\n' +
      '- NAO use cabecalhos, bullets ou formatacao estruturada, a menos que o usuario peca um "briefing" ou "relatorio".\n' +
      '- NAO use emojis. Nunca. Sem excecoes.\n' +
      '- NAO repita informacoes ja ditas em mensagens anteriores.\n' +
      '- Se o restaurante tem zero dados (0 reservas por varios dias), NAO entre em panico. Diga algo como "Tudo tranquilo por aqui" e sugira verificar quando houver mais atividade.\n' +
      '- Resposta curta para pergunta curta.\n' +
      '- RESPONDA SEMPRE EM PORTUGUES BRASILEIRO. Nunca em ingles.\n';
  } else if (isES) {
    systemPrompt +=
      '\n\n## Reglas de respuesta\n' +
      '- Se CONCISO. 3-5 frases por defecto. Solo briefings completos cuando se pidan.\n' +
      '- Para preguntas especificas, da la respuesta PRIMERO en una linea.\n' +
      '- NO uses encabezados, bullets o formato estructurado a menos que pidan "briefing".\n' +
      '- NO uses emojis. Nunca.\n' +
      '- NO repitas informacion de mensajes anteriores.\n' +
      '- Si el restaurante tiene cero datos, NO entres en panico. Di "Todo tranquilo" y sugiere revisar cuando haya mas actividad.\n' +
      '- RESPONDE SIEMPRE EN ESPANOL. Nunca en ingles.\n';
  } else {
    systemPrompt +=
      '\n\n## Response Style Rules\n' +
      '- Be CONCISE. Default to 3-5 sentences. Only give full briefings when explicitly asked.\n' +
      '- For specific questions, give the answer FIRST in one line, then optional context.\n' +
      '- Do NOT use headers, bullet points, or structured formatting unless asked for a "briefing".\n' +
      '- Do NOT use emojis. Ever.\n' +
      '- Do NOT repeat information from previous messages.\n' +
      '- If the restaurant has zero data, do NOT panic. Say "All quiet" and suggest checking back later.\n' +
      '- Match response length to question length.\n';
  }

  return systemPrompt;
}

async function extractFactsFromConversation(restaurantId, userMessage) {
  if (!FACT_PATTERNS.some((p) => p.test(userMessage))) return;
  await writeMemory(
    restaurantId,
    'fact',
    'general',
    userMessage.slice(0, 500),
    'conversation',
    4
  );
}

async function runManagerAgent(restaurantId, userMessage, channel, options = {}) {
  // ── Quota gate ──────────────────────────────────────────────
  // M16: cron-driven calls (briefings, alerts) skip both the gate AND the
  // counter — auto-briefings would burn ~60 of a 100/mo Starter quota by
  // themselves, leaving the manager almost no budget for real questions.
  // Pass { skipQuota: true } from cron callers.
  const skipQuota = options.skipQuota === true;

  if (!skipQuota) {
    const plan = await getRestaurantPlan(restaurantId);
    const planLimits = getPlanLimits(plan);
    const monthlyLimit = planLimits?.managerAICallsMonthly ?? 0;

    if (monthlyLimit === 0) {
      throw new ManagerQuotaError('upgrade_required', { plan });
    }

    if (monthlyLimit !== -1) {
      const used = await getManagerAIUsageThisMonth(restaurantId);
      if (used >= monthlyLimit) {
        throw new ManagerQuotaError('quota_exceeded', { used, limit: monthlyLimit });
      }
    }
  }
  // ─────────────────────────────────────────────────────────────

  const [memories, snapshot, history, configResult, wikiPages] = await Promise.all([
    retrieveRelevantMemories(restaurantId, userMessage),
    getRestaurantSnapshot(restaurantId),
    getConversationHistory(restaurantId),
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, name, agent_language, restaurant_profile, timezone, agent_name, agent_greeting, country')
      .eq('id', restaurantId)
      .maybeSingle(),
    getWikiPages(restaurantId),
  ]);

  const config = configResult?.data || {};
  const systemPrompt = buildSystemPrompt(memories, snapshot, config, wikiPages);
  const targetLang =
    config?.agent_language ||
    config?.language ||
    languageFromCountry(config?.country);
  const usableHistory = shouldResetHistoryForLanguage(history, targetLang) ? [] : history;
  const messages = [
    ...usableHistory.map((h) => ({
      role: h.role === 'manager' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const response = await getAI().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
    tools: MANAGER_TOOLS,
  });

  let assistantText;

  if (response.stop_reason === 'tool_use') {
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolBlock?.name === 'compare_periods') {
      const { period_a, period_b } = toolBlock.input;
      const compResult = await comparePeriods(restaurantId, period_a, period_b);

      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(compResult),
            },
          ],
        },
      ];

      const finalResponse = await getAI().messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: followUpMessages,
        tools: MANAGER_TOOLS,
      });

      const textBlock = finalResponse.content?.find((b) => b.type === 'text');
      assistantText = textBlock?.text;
    }
  }

  if (!assistantText) {
    const textBlock = response.content?.find((b) => b.type === 'text');
    if (!textBlock) {
      throw new Error('Unexpected Claude response structure');
    }
    assistantText = textBlock.text;
  }

  await Promise.all([
    saveTurn(restaurantId, 'manager', userMessage, channel),
    saveTurn(restaurantId, 'assistant', assistantText, channel),
  ]);

  // Bundle background work and bound the wait. Without this, fact
  // extraction and metered-billing increments lose the race against
  // Lambda shutdown the moment the caller returns the response —
  // memory enrichment is silently dropped and the customer doesn't
  // get billed for the AI call.
  await Promise.race([
    Promise.allSettled([
      extractFactsFromConversation(restaurantId, userMessage).catch((err) => {
        logger.error('extractFactsFromConversation failed', { error: err.message });
      }),
      // M16: skip metered billing increment for cron-driven calls
      skipQuota ? Promise.resolve() : trackUsage(restaurantId, 'manager_ai_call'),
    ]),
    new Promise(resolve => setTimeout(resolve, 6000)),
  ]);

  return assistantText;
}

/**
 * Streaming variant of runManagerAgent.
 * Calls onToken(text) for each text delta, returns full assistantText.
 */
async function runManagerAgentStream(restaurantId, userMessage, channel, onToken) {
  const plan = await getRestaurantPlan(restaurantId);
  const planLimits = getPlanLimits(plan);
  const monthlyLimit = planLimits?.managerAICallsMonthly ?? 0;

  if (monthlyLimit === 0) {
    throw new ManagerQuotaError('upgrade_required', { plan });
  }
  if (monthlyLimit !== -1) {
    const used = await getManagerAIUsageThisMonth(restaurantId);
    if (used >= monthlyLimit) {
      throw new ManagerQuotaError('quota_exceeded', { used, limit: monthlyLimit });
    }
  }

  const [memories, snapshot, history, configResult, wikiPages] = await Promise.all([
    retrieveRelevantMemories(restaurantId, userMessage),
    getRestaurantSnapshot(restaurantId),
    getConversationHistory(restaurantId),
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name, name, agent_language, restaurant_profile, timezone, agent_name, agent_greeting, country')
      .eq('id', restaurantId)
      .maybeSingle(),
    getWikiPages(restaurantId),
  ]);

  const config = configResult?.data || {};
  const systemPrompt = buildSystemPrompt(memories, snapshot, config, wikiPages);
  const targetLang =
    config?.agent_language ||
    config?.language ||
    languageFromCountry(config?.country);
  const usableHistory = shouldResetHistoryForLanguage(history, targetLang) ? [] : history;
  const messages = [
    ...usableHistory.map((h) => ({
      role: h.role === 'manager' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let assistantText = '';

  async function streamCall(msgs) {
    const stream = getAI().messages.stream({
      model: AI_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: msgs,
      tools: MANAGER_TOOLS,
    });

    stream.on('text', (text) => {
      assistantText += text;
      onToken(text);
    });

    return stream.finalMessage();
  }

  const response = await streamCall(messages);

  if (response.stop_reason === 'tool_use') {
    assistantText = '';
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (toolBlock?.name === 'compare_periods') {
      const { period_a, period_b } = toolBlock.input;
      const compResult = await comparePeriods(restaurantId, period_a, period_b);

      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(compResult),
            },
          ],
        },
      ];

      await streamCall(followUpMessages);
    }
  }

  if (!assistantText) {
    throw new Error('Unexpected Claude response structure');
  }

  await Promise.all([
    saveTurn(restaurantId, 'manager', userMessage, channel),
    saveTurn(restaurantId, 'assistant', assistantText, channel),
  ]);

  // Same Lambda-shutdown safeguard as runManagerAgent above.
  await Promise.race([
    Promise.allSettled([
      extractFactsFromConversation(restaurantId, userMessage).catch((err) => {
        logger.error('extractFactsFromConversation failed', { error: err.message });
      }),
      trackUsage(restaurantId, 'manager_ai_call'),
    ]),
    new Promise(resolve => setTimeout(resolve, 6000)),
  ]);

  return assistantText;
}

module.exports = { runManagerAgent, runManagerAgentStream, ManagerQuotaError };
