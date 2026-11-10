// AI conversation handling for WhatsApp

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { supabaseAdmin } = require('../../_lib/supabase');
const { buildGuestContext } = require('../guestMemory');
const {
  getSessionByPhone,
} = require('../../_lib/whatsapp-sessions');
const { RESERVATION_TOOLS, executeTool, getCurrentDateTime } = require('./reservation-tools');
const { HANDOFF_TOOL, isHandoffEnabled } = require('./handoff');

// AI provider: OpenRouter (or direct Anthropic fallback)
const { getAI, AI_MODEL, AI_MODEL_FAST } = require('../../_lib/ai-client');

const MAX_TOOL_ROUNDS = 6;
const BOOKING_MUTATIONS = new Set(['create_reservation', 'modify_reservation', 'cancel_reservation']);
const MUTATION_TOOLS = new Set([...BOOKING_MUTATIONS, 'join_waitlist', 'handoff_to_human', 'identify_restaurant']);
const MUTATION_POLICY = `
EXISTING RESERVATION CHANGES AND RESULT HONESTY:
- Before discussing an existing reservation, request the complete confirmation code and use lookup_reservation. Never discover a code by phone or name. The tools verify ownership against the authenticated sender; model-supplied phone or name is not proof.
- Before modify_reservation or cancel_reservation, read back the complete latest guest name, restaurant, date, time and party size, plus the proposed change or cancellation. Ask whether to apply it. STOP and wait for a subsequent user turn with an explicit yes before calling the mutation tool.
- An earlier booking/lookup confirmation is not mutation consent. A correction, unclear reply or no requires a fresh full readback and a new subsequent yes. Never create a replacement booking to reschedule.
- Exception: an authenticated [BUTTON_ACTION: cancel_reservation id=<id>] carries explicit cancellation consent for that exact id. Execute that cancellation directly; tools must still verify ownership. A button without an id is not this exception.
- Report success only from a tool result with success=true. With changed=false, explain that no additional change was made; do not claim a new mutation or repeat it.
- A missing result, timeout or mutation_unavailable can mean a change committed without a confirmed response. Never claim the original booking is unchanged, and never blindly retry a mutation. Obtain a fresh verified lookup and report its current state, or explain uncertainty and refer to restaurant staff if verification is unavailable.
- Do not claim an email or WhatsApp was sent or delivered unless the tool explicitly proves that outcome.
`;

// Used when no reliable final model reply is available. A confirmed write stays
// confirmed; an ambiguous write must not become an invitation to repeat it.
function mutationFallback(language, mutation) {
  const lang = language?.startsWith('es') ? 'es' : language?.startsWith('en') ? 'en' : 'pt';
  if (!mutation) return {
    en: 'I could not complete this request. Please contact the restaurant team to check its result before trying again.',
    es: 'No pude completar esta solicitud. Contacta al restaurante para comprobar el resultado antes de intentarlo de nuevo.',
    pt: 'Não consegui concluir este pedido. Fale com a equipe do restaurante para conferir o resultado antes de tentar novamente.',
  }[lang];
  if (mutation?.result?.success === true && BOOKING_MUTATIONS.has(mutation.name)) {
    const confirmations = {
      en: { create_reservation: 'Your reservation is confirmed.', modify_reservation: 'The requested change was applied.', cancel_reservation: 'Your reservation was cancelled.' },
      es: { create_reservation: 'Tu reserva está confirmada.', modify_reservation: 'Se aplicó el cambio solicitado.', cancel_reservation: 'Tu reserva fue cancelada.' },
      pt: { create_reservation: 'Sua reserva está confirmada.', modify_reservation: 'A alteração solicitada foi aplicada.', cancel_reservation: 'Sua reserva foi cancelada.' },
    };
    if (mutation.result.changed === false) return {
      en: 'No additional change was made. Please ask me to verify your reservation if you need its current details.',
      es: 'No se realizó ningún cambio adicional. Pídeme verificar tu reserva si necesitas sus datos actuales.',
      pt: 'Nenhuma alteração adicional foi feita. Peça para verificar sua reserva se precisar dos dados atuais.',
    }[lang];
    return confirmations[lang][mutation.name];
  }
  return {
    en: 'I cannot confirm the result of your request. Please ask me to verify the current reservation with your complete confirmation code before another change, or contact the restaurant for help.',
    es: 'No puedo confirmar el resultado de tu solicitud. Pídeme verificar la reserva actual con tu código de confirmación completo antes de otro cambio, o contacta al restaurante.',
    pt: 'Não consigo confirmar o resultado do seu pedido. Peça para verificar a reserva atual com seu código de confirmação completo antes de outra alteração, ou entre em contato com o restaurante.',
  }[lang];
}

/**
 * Call Anthropic Claude and return response in OpenAI-compatible format.
 * Converts OpenAI tool format -> Anthropic tool format, and response back.
 */
async function callChatCompletions(messages, tools) {
  logger.info(` AI call: model=${AI_MODEL_FAST}, provider=openrouter`);

  // Separate system message from conversation messages
  const systemContent = messages.find(m => m.role === 'system')?.content || '';
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Convert OpenAI messages -> Anthropic messages format
  const anthropicMessages = [];
  for (const msg of conversationMessages) {
    if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      // May contain tool_calls from previous round
      if (msg.tool_calls) {
        const content = [];
        if (msg.content) content.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
        anthropicMessages.push({ role: 'assistant', content });
      } else {
        anthropicMessages.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }],
      });
    }
  }

  // Convert OpenAI tools -> Anthropic tools format
  const anthropicTools = (tools || []).map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Use fast model for WhatsApp (Haiku: 12x cheaper than Sonnet)
  // temperature: 0.3 — Haiku wanders on simple factual questions ("qual o horário?") and
  //                    falsely says "não consegui acessar" even when the prompt has hours.
  //                    Low temp anchors it to the prompt facts without making it robotic.
  // 1024 max_tokens — tool call + confirmation message after successful reservation needs headroom
  const response = await getAI().messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 1024,
    temperature: 0.3,
    system: systemContent,
    messages: anthropicMessages,
    tools: anthropicTools.length > 0 ? anthropicTools : undefined,
  });

  // Convert Anthropic response -> OpenAI format
  const textBlocks = response.content.filter(b => b.type === 'text');
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

  const result = {
    choices: [{
      message: {
        role: 'assistant',
        content: textBlocks.map(b => b.text).join('') || null,
      },
      finish_reason: toolUseBlocks.length > 0 ? 'tool_calls' : 'stop',
    }],
  };

  if (toolUseBlocks.length > 0) {
    result.choices[0].message.tool_calls = toolUseBlocks.map(b => ({
      id: b.id,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));
  }

  return result;
}

/**
 * Build a WhatsApp-specific system prompt for a restaurant with full config.
 * This is separate from persona-prompt-builder.js which is voice-oriented.
 */
function buildWhatsAppPrompt(restaurantConfig, session, currentDateTime, timezone) {
  const agentName = restaurantConfig.agent_name || 'the host';
  const restaurantName = restaurantConfig.restaurant_name || restaurantConfig.name || 'the restaurant';

  let prompt = `You are ${agentName} at ${restaurantName}. You love this restaurant and genuinely enjoy helping guests.\n\n`;

  // Restaurant details
  prompt += `ABOUT ${restaurantName}:\n`;
  if (restaurantConfig.restaurant_type) {
    prompt += `- Cuisine: ${restaurantConfig.restaurant_type}\n`;
  }
  if (restaurantConfig.address) {
    prompt += `- Address: ${restaurantConfig.address}\n`;
  }
  if (restaurantConfig.city) {
    prompt += `- City: ${restaurantConfig.city}\n`;
  }
  if (restaurantConfig.phone) {
    prompt += `- Phone: ${restaurantConfig.phone}\n`;
  }

  // Business hours
  const hours = restaurantConfig.business_hours;
  if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
    prompt += '\nBusiness Hours:\n';
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const dayHours = hours[day];
      if (!dayHours) continue;
      const isOpen = dayHours.is_open !== undefined ? dayHours.is_open : dayHours.isOpen;
      if (isOpen === false) {
        prompt += `- ${day.charAt(0).toUpperCase() + day.slice(1)}: Closed\n`;
      } else {
        const openTime = dayHours.open_time || dayHours.open || '?';
        const closeTime = dayHours.close_time || dayHours.close || '?';
        prompt += `- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${openTime} - ${closeTime}\n`;
      }
    }

    // Explicit enforcement: never book outside hours
    prompt += `\nBOOKING HOURS ENFORCEMENT:
- Before accepting ANY booking time, verify it falls within the Business Hours listed above.
- If a customer requests a time OUTSIDE our hours (before opening, after closing, or on a closed day), immediately explain: "Infelizmente não atendemos nesse horário. Nosso horário nesse dia é [hours]. Gostaria de reservar para outro horário?"
- Do NOT silently ignore an out-of-hours request and re-ask for time without explaining why.
- Do NOT call check_availability for a time that is clearly outside business hours.\n`;
  }

  // Table capacity (real numbers from DB — inject so the LLM doesn't make up "14 max")
  if (Array.isArray(restaurantConfig._tables) && restaurantConfig._tables.length > 0) {
    const tables = restaurantConfig._tables.filter(t => t.is_active !== false);
    const totalSeats = tables.reduce((s, t) => s + (t.capacity || 0), 0);
    const maxTable = tables.reduce((m, t) => Math.max(m, t.capacity || 0), 0);
    prompt += `\nTABLE CAPACITY (authoritative — use these numbers, do NOT invent):\n`;
    prompt += `- Total tables: ${tables.length}\n`;
    prompt += `- Total seats across all tables: ${totalSeats}\n`;
    prompt += `- Largest single table: ${maxTable} seats\n`;
    prompt += `- For a group larger than ${maxTable}, check if multiple tables combined can accommodate (max combined = ${totalSeats}).\n`;
    prompt += `- For groups bigger than ${totalSeats}, politely decline and suggest splitting the reservation or contacting the events team.\n`;
  }

  // Menu items (real names from DB — inject so LLM doesn't invent dish names)
  if (Array.isArray(restaurantConfig._menu) && restaurantConfig._menu.length > 0) {
    prompt += `\nMENU (authoritative — only mention these specific dishes):\n`;
    for (const m of restaurantConfig._menu.slice(0, 40)) {
      const line = [m.name, m.category ? `(${m.category})` : '', m.price ? `${m.price}` : '']
        .filter(Boolean).join(' ');
      prompt += `- ${line}\n`;
    }
  } else {
    prompt += `\nMENU: No menu data loaded. If asked about menu, say "Posso pedir para a equipe te enviar o cardápio completo — tem alguma preferência ou restrição alimentar?" DO NOT invent dish names.\n`;
  }

  // Strategy doc
  if (restaurantConfig.ai_strategy_doc) {
    prompt += '\n[RESTAURANT STRATEGY]\n' + restaurantConfig.ai_strategy_doc + '\n';
  }

  prompt += '\n';

  // AI Personality
  const aiPersonality = restaurantConfig.ai_personality;
  if (aiPersonality && typeof aiPersonality === 'object') {
    prompt += '[PERSONALITY]\n';

    if (aiPersonality.humor_type && aiPersonality.humor_type !== 'none') {
      const humorDesc = {
        light: 'Use light, gentle humor when appropriate',
        witty: 'Be witty and clever with occasional wordplay',
        warm: 'Use warm, feel-good humor that makes people smile',
        playful: 'Be playful and fun, use casual jokes and lighthearted banter',
      };
      prompt += `- Humor: ${humorDesc[aiPersonality.humor_type] || aiPersonality.humor_type}\n`;
    }

    if (Array.isArray(aiPersonality.personality_traits) && aiPersonality.personality_traits.length > 0) {
      prompt += `- Personality traits: ${aiPersonality.personality_traits.join(', ')}\n`;
    }

    if (aiPersonality.communication_style) {
      const styleDesc = {
        formal: 'Use formal, polished language. Address customers with respect and courtesy',
        casual: 'Be casual and relaxed, like texting a friend',
        friendly_professional: 'Be warm and approachable while maintaining professionalism',
      };
      prompt += `- Style: ${styleDesc[aiPersonality.communication_style] || aiPersonality.communication_style}\n`;
    }

    if (aiPersonality.language_tone) {
      const toneDesc = {
        enthusiastic: 'Be enthusiastic and energetic in your responses',
        calm: 'Keep a calm, composed, and reassuring tone',
        neutral: 'Maintain a balanced, neutral tone',
        warm: 'Be warm, caring, and inviting in every message',
      };
      prompt += `- Tone: ${toneDesc[aiPersonality.language_tone] || aiPersonality.language_tone}\n`;
    }

    if (aiPersonality.verbal_quirks) {
      prompt += `- Verbal quirks: ${aiPersonality.verbal_quirks}\n`;
    }

    prompt += '\n';
  }

  // Communication style
  prompt += `HOW YOU COMMUNICATE:
- You're texting on WhatsApp \u{2014} keep it short, warm, natural
- Write like you're texting a friend, not drafting an email
- Use 1-3 sentences per message, never paragraphs
- Light emoji is fine (\u{1F60A} \u{1F44B} \u{2705}) but don't overdo it
- Answer ANY question about the restaurant naturally \u{2014} hours, location, menu, parking, dress code
- NEVER say you cannot access restaurant information. You ARE the restaurant — all the info you need is in your context above
- When the customer asks about availability for a specific date/time/party_size, ALWAYS call the check_availability tool immediately
- A positive check_availability result is only an estimate. Never tell the guest the table is held or the booking confirmed until create_reservation succeeds.
- When the customer asks if you're open at a time (e.g. "is it open at 4pm?"), call check_availability with that time, tomorrow's or today's date, and their party size
- Use create_reservation only once the customer has confirmed they want to book
- NEVER ignore a customer's question to push a booking. If they ask "qual restaurante?", answer it.

ANTI-HALLUCINATION (CRITICAL):
- NEVER invent specific menu items, dish names, prices, chef names, or capacity numbers. If you don't have it in your context, say "Posso verificar isso e te respondo" or offer to connect with the team.
- For menu questions: if no menu data is injected above, say "Temos opções variadas — posso pedir para a equipe enviar o cardápio completo?" — DO NOT list made-up dishes like "Ravioli de ricota" unless they're in your context.
- For capacity questions: only quote numbers from the TABLE CAPACITY block above. If unsure, say "para grupos maiores, posso verificar se conseguimos acomodar" and call check_availability.
- For prices: never quote a price unless explicitly listed. Say "o valor varia, posso confirmar com a equipe".
- Invented details break trust. Better to say "I don't have that info right now" than to make something up.
`;

  // Language — respect restaurant config, fall back to PT-BR
  const lang = restaurantConfig.agent_language || restaurantConfig.language || 'pt';
  if (lang === 'es') {
    prompt += `\nLANGUAGE:
- Respond in Spanish (español) — this restaurant serves Spanish-speaking customers
- Always write in Spanish regardless of what language the customer writes in
- Be natural: "¡Hola!", "¡Claro!", "¡Perfecto!", "¡Hasta pronto!"
`;
  } else if (lang === 'en') {
    prompt += `\nLANGUAGE:
- Respond in English — this restaurant serves English-speaking customers
- Always write in English regardless of what language the customer writes in
- Be natural and warm: "Hi!", "Sure!", "Perfect!"
`;
  } else {
    prompt += `\nLANGUAGE:
- CRITICAL: Always respond in the SAME LANGUAGE the customer writes in. If they write in English, respond in English. If they write in Portuguese, respond in Portuguese. Never switch languages.
- If the customer's language is unclear, default to Brazilian Portuguese (pt-BR) with "você" form
- Be natural \u{2014} "Oi!", "Claro!", "Perfeito!" (PT) or "Sure!", "Great!" (EN) \u{2014} not formal
`;
  }

  // Capabilities
  prompt += `\nWHAT YOU CAN DO:
- Answer questions about the restaurant
- Check table availability
- Make, modify, or cancel reservations
- Look up existing reservations
- Add customers to the walk-in queue/waitlist (fila)
- Check queue position for customers already waiting
`;

  // Button actions
  prompt += `\nBUTTON ACTIONS:
- [BUTTON_ACTION: confirm_reservation id=<id>] → Customer confirmed their reservation. Reply warmly that you're looking forward to seeing them. No tool call needed.
- [BUTTON_ACTION: cancel_reservation id=<id>] → Call cancel_reservation with that reservation id immediately. No confirmation needed.
- [BUTTON_ACTION: cancel_reservation] (no id) → Ask for the complete confirmation code, verify the reservation, then follow the full readback and subsequent-yes rule.
- [BUTTON_ACTION: make_reservation] → Customer wants to make a new reservation. Start the booking flow: ask for date, time, party size.
- [BUTTON_ACTION: change_reservation] → Ask for the complete confirmation code and verify the reservation, then ask what they'd like to change. Require full readback and a subsequent yes before mutation.
- For all BUTTON_ACTION messages, act directly without asking the customer to rephrase — they already chose the action by tapping.
`;

  // Boundaries
  prompt += `\nBOUNDARIES:
- Stay focused on the restaurant
- Don't share internal business details (revenue, staff schedules)
- If asked about unrelated topics, gently redirect
- If directly asked, say you're an AI assistant for the restaurant
`;

  // Queue/waitlist behavior
  prompt += `\nQUEUE / WAITLIST BEHAVIOR:
- If someone says 'fila', 'queue', 'lista de espera', 'entrar na fila' — they want to JOIN THE WAITLIST, not make a reservation. Use the join_waitlist tool.
- If someone says 'minha posição', 'posicao', 'quanto falta', 'my position' — they want to CHECK THEIR QUEUE POSITION. Use the check_queue_position tool.
- The queue is for walk-in customers wanting a table NOW, not for future date reservations.
`;

  // Graceful failure handling
  prompt += `\nWHEN THINGS GO WRONG:
- If a tool call fails (reservation not found, system error), apologize briefly and suggest an alternative
- If you can't help after 2 read-only attempts, offer to connect with the restaurant. Never retry an uncertain mutation.
- Never leave the customer hanging — always close with a helpful next step or offer to try again later
- CRITICAL: If a reservation was successfully created or cancelled (tool returned success), your response MUST be a positive confirmation. NEVER say you had difficulties when the action succeeded.
`;

  // Date/time context
  if (timezone) {
    prompt += `\nCurrent date/time (${timezone}): ${currentDateTime.formatted}\n`;
    prompt += `Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;
  } else {
    prompt += '\nRestaurant timezone unavailable. Do not infer dates from "today" or "tomorrow"; ask for an explicit date.\n';
  }

  // Customer phone
  if (session?.sender_phone) {
    prompt += `Customer's WhatsApp: ${session.sender_phone} (use as phone for reservations \u{2014} don't ask for it)\n`;
  }

  return prompt;
}

/**
 * Clean conversation history for storage.
 * Removes tool-role messages and assistant messages with tool_calls,
 * keeping only clean user/assistant text pairs.
 *
 * @param {Array} messages - Full messages array
 * @returns {Array} Cleaned array with only user/assistant text messages
 */
function cleanHistoryForStorage(messages) {
  return messages.filter(msg => {
    // Keep user messages
    if (msg.role === 'user') return true;
    // Keep assistant messages that have text content and no tool_calls
    if (msg.role === 'assistant' && msg.content && !msg.tool_calls) return true;
    // Filter out tool messages and assistant tool_calls messages
    return false;
  });
}

/**
 * Compress old conversation history by summarizing oldest messages.
 * If history has more than 15 messages, summarize the oldest 10 into a
 * single system message and keep the remaining recent messages.
 *
 * @param {Array} history - Conversation history array
 * @returns {Promise<Array>} Compressed history
 */
async function compressOldHistory(history) {
  if (!history || history.length <= 15) {
    return history;
  }

  const oldMessages = history.slice(0, history.length - 5);
  const recentMessages = history.slice(history.length - 5);

  try {
    const summaryPrompt = oldMessages.map(m =>
      `${m.role}: ${m.content}`
    ).join('\n');

    const summaryResult = await callChatCompletions([
      {
        role: 'system',
        content: 'Summarize this WhatsApp conversation in 1-2 sentences in the same language. Focus on: what the customer wanted, what was done, any reservations made.'
      },
      { role: 'user', content: summaryPrompt }
    ], []);

    const summary = summaryResult.choices?.[0]?.message?.content;
    if (summary) {
      return [
        { role: 'system', content: `[Previous conversation] ${summary}` },
        ...recentMessages
      ];
    }
  } catch (err) {
    logger.warn('History compression failed (non-fatal):', err.message);
  }

  // If compression fails, just return the most recent messages
  return history.slice(-15);
}

/**
 * Process a message with AI (OpenAI-compatible API)
 */
async function processWithAI(userMessage, session, conversationHistory = [], inboundContext = {}) {
  const language = session?.restaurant?.agent_language || session?.restaurant?.language || session?.language || 'pt';

  // Compress old history if it's getting long
  const rawCompressed = await compressOldHistory(conversationHistory);
  // compressOldHistory may prepend a {role:'system'} summary — extract it so it's
  // not silently discarded by callChatCompletions (which strips all system messages).
  let historySummary = '';
  const compressedHistory = rawCompressed.filter(msg => {
    if (msg.role === 'system') { historySummary = msg.content; return false; }
    return true;
  });

  // Build system prompt -- use WhatsApp-specific prompt when restaurant config available
  let systemPrompt = null;

  // Use restaurant.id from JOIN, or restaurant_id FK column as fallback (JOIN may be null if FK not indexed)
  const restaurantId = session?.restaurant?.id || session?.restaurant_id;

  // Fetch restaurant config, guest context, tables, and menu in parallel to reduce latency.
  // Tables + menu are injected into the prompt so the LLM doesn't hallucinate capacity/dishes.
  const [configResult, guestCtxResult, tablesResult, menuResult] = await Promise.allSettled([
    restaurantId
      ? supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('id, restaurant_name, restaurant_type, phone, email, city, country, business_hours, average_dining_duration_minutes, timezone, agent_language, agent_name, agent_greeting, ai_config, ai_strategy_doc, ai_personality, persona_prompt_override')
          .eq('id', restaurantId)
          .single()
      : Promise.resolve({ data: null }),
    restaurantId && session?.sender_phone
      ? buildGuestContext(restaurantId, session.sender_phone, userMessage)
      : Promise.resolve(null),
    restaurantId
      ? supabaseAdmin.from('tables').select('table_number, capacity, is_active').eq('restaurant_id', restaurantId)
      : Promise.resolve({ data: null }),
    restaurantId
      ? supabaseAdmin.from('pos_menu_items').select('name, category, price, description').eq('restaurant_id', restaurantId).limit(40)
      : Promise.resolve({ data: null }),
  ]);

  const restaurantConfig = configResult.status === 'fulfilled' ? configResult.value?.data : null;
  let timezone = restaurantConfig?.timezone || session?.restaurant?.timezone;
  let currentDateTime;
  try {
    currentDateTime = getCurrentDateTime(language, timezone || 'UTC');
  } catch (error) {
    logger.warn(`Invalid restaurant timezone; requesting an explicit booking date (${error.message})`);
    timezone = null;
    currentDateTime = getCurrentDateTime(language, 'UTC');
  }
  if (configResult.status === 'rejected') {
    logger.warn('Failed to load restaurant config for prompt (non-fatal):', configResult.reason?.message);
  }
  // Attach tables + menu onto the config so buildWhatsAppPrompt can inject them.
  if (restaurantConfig) {
    restaurantConfig._tables = tablesResult.status === 'fulfilled' ? (tablesResult.value?.data || []) : [];
    restaurantConfig._menu = menuResult.status === 'fulfilled' ? (menuResult.value?.data || []) : [];
  }

  logger.info(`processWithAI: restaurantId=${restaurantId || 'none'} configFound=${!!restaurantConfig} configName=${restaurantConfig?.restaurant_name || 'N/A'}`);

  if (restaurantConfig) {
    systemPrompt = buildWhatsAppPrompt(restaurantConfig, session, currentDateTime, timezone);
  }

  // Fallback to generic prompt
  if (!systemPrompt) {
    const fallbackRestaurantName = session?.restaurant?.restaurant_name || 'the restaurant';
    const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : 'Portuguese (pt-BR)';
    systemPrompt = `You are a friendly assistant for ${fallbackRestaurantName} on WhatsApp. Help the customer warmly in ${langLabel}.\n`;
    if (timezone) {
      systemPrompt += `\nCurrent date/time (${timezone}): ${currentDateTime.formatted}\n`;
      systemPrompt += `Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;
    } else {
      systemPrompt += '\nRestaurant timezone unavailable. Do not infer dates from "today" or "tomorrow"; ask for an explicit date.\n';
    }
    systemPrompt += `\nRestaurant: ${fallbackRestaurantName}\n`;
    if (session?.sender_phone) {
      systemPrompt += `Customer's WhatsApp: ${session.sender_phone} (use as phone for reservations — don't ask for it)\n`;
    }
    systemPrompt += '\nCRITICAL: You are already serving the customer of this restaurant. NEVER ask for the restaurant name — it is already set.\n';
    systemPrompt += 'If the customer is providing their name, date, time, or party size, continue the reservation flow naturally.\n';
    systemPrompt += 'IMPORTANT: Do NOT confuse a customer\'s name (e.g. "João Silva") with a restaurant name. Never ask the customer to confirm the restaurant name.\n';
  }

  // Inject conversation summary from compression (avoids losing context across long sessions)
  if (historySummary) {
    systemPrompt += '\n\n' + historySummary;
  }

  // Inject guest memory context (fetched in parallel above)
  if (guestCtxResult.status === 'fulfilled' && guestCtxResult.value) {
    systemPrompt += guestCtxResult.value;
  } else if (guestCtxResult.status === 'rejected') {
    logger.warn('Guest context injection failed (non-fatal):', guestCtxResult.reason?.message);
  }

  // Apply to both configured and fallback prompts, after optional memory text.
  systemPrompt += MUTATION_POLICY;

  logger.info(`processWithAI: systemPrompt starts with: "${systemPrompt.substring(0, 80).replace(/\n/g, ' ')}"`);

  // Build messages array with system prompt as first message
  const messages = [
    { role: 'system', content: systemPrompt },
    ...compressedHistory,
    { role: 'user', content: userMessage }
  ];

  // Exclude identify_restaurant when the session already has a restaurant assigned.
  // Check both session.restaurant.id (JOIN present) and session.restaurant_id (JOIN missing but FK set).
  // The message-processor handles routing before reaching here, so asking the
  // customer "which restaurant?" is always wrong at this point.
  const hasRestaurantAssigned = !!(session?.restaurant?.id || session?.restaurant_id);
  const baseTools = hasRestaurantAssigned
    ? RESERVATION_TOOLS.filter(t => t.function.name !== 'identify_restaurant')
    : RESERVATION_TOOLS;

  // Transbordo humano entra só para quem ligou. O critério de parada do spike
  // que criou isto é "qualquer falso-positivo, pare": transbordo que dispara
  // demais vira plantão humano e vale menos que a esquiva atual. Sem calibração
  // contra conversa real, ninguém recebe. Ver a decisão 2 em
  // supabase/migrations/20260901_whatsapp_handoff.sql.
  const tools = isHandoffEnabled(session) ? [...baseTools, HANDOFF_TOOL] : baseTools;

  // Freeze the base messages so each retry attempt starts from a clean slate,
  // not accumulating stale tool-call messages from a failed previous attempt.
  const baseMessages = [...messages];

  let lastError = null;
  let toolRounds = 0;
  let mutationAttempted = false;
  let lastMutation = null;
  let bookingMutationAttempted = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msgs = [...baseMessages];
      let data = await callChatCompletions(msgs, tools);
      let choice = data.choices?.[0];

      // Handle tool use loop
      while (choice?.finish_reason === 'tool_calls') {
        if (toolRounds >= MAX_TOOL_ROUNDS) return mutationFallback(language, lastMutation);
        const toolCalls = choice.message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) break;
        toolRounds++;

        msgs.push(choice.message);

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolInput = JSON.parse(toolCall.function.arguments);
          // One booking mutation per inbound turn. Any correction or new
          // proposal needs another user turn, never an automatic tool replay.
          if (BOOKING_MUTATIONS.has(toolName) && bookingMutationAttempted) {
            return mutationFallback(language, lastMutation);
          }
          if (MUTATION_TOOLS.has(toolName)) {
            mutationAttempted = true;
            if (BOOKING_MUTATIONS.has(toolName)) {
              lastMutation = { name: toolName, result: null };
              bookingMutationAttempted = true;
            }
          }
          const toolResult = await executeTool(toolName, toolInput, session, {
            ...inboundContext, timezone, language,
            averageDiningDurationMinutes: restaurantConfig?.average_dining_duration_minutes,
          });
          if (BOOKING_MUTATIONS.has(toolName)) {
            lastMutation.result = toolResult;
            if (typeof toolResult?.success !== 'boolean' || toolResult?.error?.code === 'mutation_unavailable' ||
                toolResult?.error === 'mutation_unavailable') {
              return mutationFallback(language, lastMutation);
            }
          }

          if (toolName === 'identify_restaurant' && toolResult.found && toolResult.restaurant) {
            session = await getSessionByPhone(session?.sender_phone,
              session?.inbound_provider && session?.inbound_receiver
                ? { provider: session.inbound_provider, receiver: session.inbound_receiver }
                : null);
          }

          msgs.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        data = await callChatCompletions(msgs, tools);
        choice = data.choices?.[0];
      }

      return choice?.message?.content || (mutationAttempted ? mutationFallback(language, lastMutation)
        : 'Desculpe, tive dificuldade em processar isso. Pode tentar novamente?');

    } catch (error) {
      lastError = error;
      const errMsg = error?.message || String(error);
      const statusMatch = errMsg.match(/API error (\d+)/);
      logger.error(`AI error attempt=${attempt + 1} status=${statusMatch?.[1] || 'N/A'} model=${AI_MODEL_FAST}`);
      logger.error(`AI error detail: ${errMsg.substring(0, 150)}`);
      if (mutationAttempted) return mutationFallback(language, lastMutation);
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    return `[DEBUG] AI error: ${lastError?.message || 'unknown'}`;
  }
  return 'Desculpe, algo deu errado. Por favor, tente novamente ou entre em contato diretamente com o restaurante.';
}

module.exports = {
  processWithAI,
  callChatCompletions,
  cleanHistoryForStorage,
  compressOldHistory,
  AI_MODEL,
};
