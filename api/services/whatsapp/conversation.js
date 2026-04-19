// AI conversation handling for WhatsApp

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { supabaseAdmin } = require('../../_lib/supabase');
const { buildGuestContext } = require('../guestMemory');
const {
  getSessionByPhone,
} = require('../../_lib/whatsapp-sessions');
const { RESERVATION_TOOLS, executeTool, getCurrentDateTime } = require('./reservation-tools');

// AI provider: OpenRouter (or direct Anthropic fallback)
const { getAI, AI_MODEL, AI_MODEL_FAST } = require('../../_lib/ai-client');

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
  // 1024 max_tokens — tool call + confirmation message after successful reservation needs headroom
  const response = await getAI().messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 1024,
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
function buildWhatsAppPrompt(restaurantConfig, session, currentDateTime) {
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
- When the customer asks if you're open at a time (e.g. "is it open at 4pm?"), call check_availability with that time, tomorrow's or today's date, and their party size
- Use create_reservation only once the customer has confirmed they want to book
- NEVER ignore a customer's question to push a booking. If they ask "qual restaurante?", answer it.
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
- [BUTTON_ACTION: cancel_reservation] (no id) → Customer wants to cancel but you don't know which reservation. Ask for their name to look it up, then cancel.
- [BUTTON_ACTION: make_reservation] → Customer wants to make a new reservation. Start the booking flow: ask for date, time, party size.
- [BUTTON_ACTION: change_reservation] → Customer wants to modify an existing reservation. Ask for their name to find it, then ask what they'd like to change.
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
- If you can't help after 2 attempts, say something like "Desculpe, não consegui completar isso agora. Posso ajudar com outra coisa?"
- Never leave the customer hanging — always close with a helpful next step or offer to try again later
- CRITICAL: If a reservation was successfully created or cancelled (tool returned success), your response MUST be a positive confirmation. NEVER say you had difficulties when the action succeeded.
`;

  // Date/time context
  prompt += `\nCurrent date/time: ${currentDateTime.formatted}\n`;
  prompt += `Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;

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
async function processWithAI(userMessage, session, conversationHistory = []) {
  const language = session?.restaurant?.agent_language || session?.restaurant?.language || session?.language || 'pt';
  const currentDateTime = getCurrentDateTime(language);

  // Compress old history if it's getting long
  const compressedHistory = await compressOldHistory(conversationHistory);

  // Build system prompt -- use WhatsApp-specific prompt when restaurant config available
  let systemPrompt = null;

  // Use restaurant.id from JOIN, or restaurant_id FK column as fallback (JOIN may be null if FK not indexed)
  const restaurantId = session?.restaurant?.id || session?.restaurant_id;

  if (restaurantId) {
    try {
      const { data: restaurantConfig } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, restaurant_type, phone, email, city, country, business_hours, average_dining_duration_minutes, timezone, agent_language, agent_name, agent_greeting, ai_config, ai_strategy_doc, ai_personality, persona_prompt_override')
        .eq('id', restaurantId)
        .single();

      if (restaurantConfig) {
        systemPrompt = buildWhatsAppPrompt(restaurantConfig, session, currentDateTime);
      }
    } catch (configErr) {
      logger.warn('Failed to load restaurant config for prompt (non-fatal):', configErr.message);
    }
  }

  // Fallback to generic prompt
  if (!systemPrompt) {
    // Determine restaurant name from any available source
    const fallbackRestaurantName = session?.restaurant?.restaurant_name || 'the restaurant';
    const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : 'Portuguese (pt-BR)';
    systemPrompt = `You are a friendly assistant for ${fallbackRestaurantName} on WhatsApp. Help the customer warmly in ${langLabel}.\n`;
    systemPrompt += `\nCurrent date/time: ${currentDateTime.formatted}\n`;
    systemPrompt += `Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;
    systemPrompt += `\nRestaurant: ${fallbackRestaurantName}\n`;
    if (session?.sender_phone) {
      systemPrompt += `Customer's WhatsApp: ${session.sender_phone} (use as phone for reservations — don't ask for it)\n`;
    }
    // Prevent confusing "what restaurant?" messages when context is missing
    systemPrompt += '\nCRITICAL: You are already serving the customer of this restaurant. NEVER ask for the restaurant name — it is already set.\n';
    systemPrompt += 'If the customer is providing their name, date, time, or party size, continue the reservation flow naturally.\n';
    systemPrompt += 'IMPORTANT: Do NOT confuse a customer\'s name (e.g. "João Silva") with a restaurant name. Never ask the customer to confirm the restaurant name.\n';
  }

  // Inject guest memory context if available
  if ((session?.restaurant?.id || session?.restaurant_id) && session?.sender_phone) {
    try {
      const guestContext = await buildGuestContext(
        session.restaurant?.id || session.restaurant_id,
        session.sender_phone,
        userMessage
      );
      if (guestContext) {
        systemPrompt += guestContext;
      }
    } catch (ctxErr) {
      logger.warn('Guest context injection failed (non-fatal):', ctxErr.message);
    }
  }

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
  const tools = hasRestaurantAssigned
    ? RESERVATION_TOOLS.filter(t => t.function.name !== 'identify_restaurant')
    : RESERVATION_TOOLS;

  try {
    let data = await callChatCompletions(messages, tools);
    let choice = data.choices?.[0];

    // Handle tool use loop
    while (choice?.finish_reason === 'tool_calls') {
      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      // Append the assistant message (contains tool_calls)
      messages.push(choice.message);

      // Execute each tool and append results
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);
        const toolResult = await executeTool(toolName, toolInput, session);

        // If restaurant was identified, update session reference
        if (toolName === 'identify_restaurant' && toolResult.found && toolResult.restaurant) {
          session = await getSessionByPhone(session?.sender_phone);
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Continue conversation
      data = await callChatCompletions(messages, tools);
      choice = data.choices?.[0];
    }

    // Extract text response
    return choice?.message?.content || 'Desculpe, tive dificuldade em processar isso. Pode tentar novamente?';

  } catch (error) {
    logger.error(' AI error:', error?.message || error, { stack: error?.stack?.substring(0, 300) });
    // In development, include error detail for debugging
    if (process.env.NODE_ENV !== 'production') {
      return `[DEBUG] AI error: ${error?.message || 'unknown'}`;
    }
    return 'Desculpe, algo deu errado. Por favor, tente novamente ou entre em contato diretamente com o restaurante.';
  }
}

module.exports = {
  processWithAI,
  callChatCompletions,
  cleanHistoryForStorage,
  compressOldHistory,
  AI_MODEL,
};
