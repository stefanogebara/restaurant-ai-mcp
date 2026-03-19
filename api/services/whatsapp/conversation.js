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
const { getAI, AI_MODEL } = require('../../_lib/ai-client');

/**
 * Call Anthropic Claude and return response in OpenAI-compatible format.
 * Converts OpenAI tool format -> Anthropic tool format, and response back.
 */
async function callChatCompletions(messages, tools) {
  logger.info(` AI call: model=${AI_MODEL}, provider=anthropic`);

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

  const response = await getAI().messages.create({
    model: AI_MODEL,
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
  }

  // Strategy doc
  if (restaurantConfig.ai_strategy_doc) {
    prompt += '\n[RESTAURANT STRATEGY]\n' + restaurantConfig.ai_strategy_doc + '\n';
  }

  prompt += '\n';

  // Communication style
  prompt += `HOW YOU COMMUNICATE:
- You're texting on WhatsApp \u{2014} keep it short, warm, natural
- Write like you're texting a friend, not drafting an email
- Use 1-3 sentences per message, never paragraphs
- Light emoji is fine (\u{1F60A} \u{1F44B} \u{2705}) but don't overdo it
- Answer ANY question about the restaurant naturally \u{2014} hours, location, menu, parking, dress code
- You have tools to check availability and make reservations, but only use them when the customer actually wants to book
- NEVER ignore a customer's question to push a booking. If they ask "qual restaurante?", answer it.
`;

  // Language
  prompt += `\nLANGUAGE:
- Match the language the customer writes in
- Default to Brazilian Portuguese (pt-BR) with "voc\u{00EA}" form
- Be natural \u{2014} "Oi!", "Claro!", "Perfeito!" \u{2014} not formal
`;

  // Capabilities
  prompt += `\nWHAT YOU CAN DO:
- Answer questions about the restaurant
- Check table availability
- Make, modify, or cancel reservations
- Look up existing reservations
`;

  // Boundaries
  prompt += `\nBOUNDARIES:
- Stay focused on the restaurant
- Don't share internal business details (revenue, staff schedules)
- If asked about unrelated topics, gently redirect
- If directly asked, say you're an AI assistant for the restaurant
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
  const language = session?.restaurant?.language || 'en';
  const currentDateTime = getCurrentDateTime(language);

  // Compress old history if it's getting long
  const compressedHistory = await compressOldHistory(conversationHistory);

  // Build system prompt -- use WhatsApp-specific prompt when restaurant config available
  let systemPrompt = null;

  if (session?.restaurant?.id) {
    try {
      const { data: restaurantConfig } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('*')
        .eq('id', session.restaurant.id)
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
    systemPrompt = 'You are a friendly restaurant assistant on WhatsApp. A customer has messaged but hasn\'t selected a restaurant yet. Be warm and helpful in Portuguese.\n';
    systemPrompt += `\nCurrent date/time: ${currentDateTime.formatted}\n`;
    systemPrompt += `Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;

    if (session?.restaurant) {
      systemPrompt += `\nThe customer is at: ${session.restaurant.restaurant_name}\n`;
    }
    if (session?.sender_phone) {
      systemPrompt += `Customer's WhatsApp: ${session.sender_phone} (use as phone for reservations \u{2014} don't ask for it)\n`;
    }
  }

  // Inject guest memory context if available
  if (session?.restaurant?.id && session?.sender_phone) {
    try {
      const guestContext = await buildGuestContext(
        session.restaurant.id,
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

  try {
    let data = await callChatCompletions(messages, RESERVATION_TOOLS);
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
      data = await callChatCompletions(messages, RESERVATION_TOOLS);
      choice = data.choices?.[0];
    }

    // Extract text response
    return choice?.message?.content || 'Desculpe, tive dificuldade em processar isso. Pode tentar novamente?';

  } catch (error) {
    logger.error(' AI error:', error);
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
