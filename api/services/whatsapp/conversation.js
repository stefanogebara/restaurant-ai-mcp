// AI conversation handling for WhatsApp

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');
const { supabaseAdmin } = require('../../_lib/supabase');
const { buildPersonaPrompt } = require('../../_lib/persona-prompt-builder');
const { buildGuestContext } = require('../guestMemory');
const {
  getSessionByPhone,
} = require('../../_lib/whatsapp-sessions');
const { RESERVATION_TOOLS, executeTool, getCurrentDateTime } = require('./reservation-tools');

// AI provider: Anthropic Claude
let anthropicClient = null;
function getAnthropic() {
  if (!anthropicClient) {
    const AnthropicModule = require('@anthropic-ai/sdk');
    const Anthropic = AnthropicModule.default || AnthropicModule;
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';

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

  const response = await getAnthropic().messages.create({
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
 * Process a message with AI (OpenAI-compatible API)
 */
async function processWithAI(userMessage, session, conversationHistory = []) {
  const language = session?.restaurant?.language || 'en';
  const currentDateTime = getCurrentDateTime(language);

  // Language instruction — auto-detect from customer message, fall back to restaurant config
  let languageInstruction = '\nCRITICAL LANGUAGE RULE: Always match the language the customer writes in. ' +
    'If they write in Portuguese, respond in Portuguese. If in English, respond in English. ' +
    'If in Spanish, respond in Spanish. Auto-detect and mirror their language.\n';
  if (language === 'pt' || language === 'pt-BR') {
    languageInstruction += 'This restaurant is configured for Brazilian Portuguese — when in doubt or on first message, default to pt-BR. Use natural, friendly Brazilian Portuguese with "você" form.\n';
  } else if (language === 'es') {
    languageInstruction += 'This restaurant is configured for Spanish — when in doubt or on first message, default to Spanish. Use the formal "usted" form.\n';
  } else {
    languageInstruction += 'When in doubt or on first message, default to English.\n';
  }

  // Build system prompt -- use rich per-restaurant persona when available
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
        systemPrompt = buildPersonaPrompt(restaurantConfig, { language });
        systemPrompt += `\n\nCurrent date and time: ${currentDateTime.formatted}\nToday is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}\n`;
        systemPrompt += '\nWhatsApp-specific guidelines:\n';
        systemPrompt += '- Keep responses concise (under 500 characters when possible)\n';
        systemPrompt += '- Use plain conversational messages, no bullet points or formatted text\n';
        systemPrompt += `- When they mention "today", use ${currentDateTime.date}\n`;
        systemPrompt += '- When they mention "tomorrow", calculate the next day\n';
        systemPrompt += '- If they give a time like "7pm", convert to 24-hour format (19:00)\n';
        if (session?.sender_phone) {
          systemPrompt += `- The customer's WhatsApp phone number is ${session.sender_phone}. Use this as customer_phone when creating reservations — do NOT ask for their phone number.\n`;
          systemPrompt += '- Instead, ask for their name and optionally their email (for confirmation email). Only ask for email if they seem interested.\n';
        }
        if (languageInstruction) systemPrompt += languageInstruction;
      }
    } catch (configErr) {
      logger.warn('Failed to load restaurant config for prompt (non-fatal):', configErr.message);
    }
  }

  // Fallback to generic prompt
  if (!systemPrompt) {
    systemPrompt = `You are a friendly AI assistant helping customers make restaurant reservations via WhatsApp.
${languageInstruction}
Current date and time: ${currentDateTime.formatted}
Today is ${currentDateTime.dayOfWeek}, ${currentDateTime.date}

`;

    if (session?.restaurant) {
      systemPrompt += `
The customer is booking at: ${session.restaurant.restaurant_name}
Restaurant ID: ${session.restaurant.id}

You can now help them check availability and make reservations.
`;
    } else {
      systemPrompt += `
The customer has not yet specified a restaurant.
First, ask them which restaurant they'd like to book at, or use the identify_restaurant tool if they mention one.
`;
    }

    systemPrompt += `
Guidelines:
- Be conversational and helpful
- When they mention "today", use ${currentDateTime.date}
- When they mention "tomorrow", calculate the next day
- Always confirm details before creating a reservation
- Keep responses concise for WhatsApp (under 500 characters when possible)
- If they give a time like "7pm", convert to 24-hour format (19:00)
`;
    if (session?.sender_phone) {
      systemPrompt += `- The customer's WhatsApp phone number is ${session.sender_phone}. Use this as customer_phone when creating reservations — do NOT ask for their phone number.\n`;
      systemPrompt += '- Instead, ask for their name and optionally their email (for confirmation email). Only ask for email if they seem interested.\n';
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
    ...conversationHistory,
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
  AI_MODEL,
};
