const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('PersonaPromptBuilder');

const LANGUAGE_CONFIG = {
  en: {
    role: 'host',
    greeting: 'Hi there! Thanks for calling',
    help: 'What can I do for you?',
    capabilities: 'I can help with reservations, check availability, look up bookings, or answer any questions about the restaurant.'
  },
  es: {
    role: 'anfitrion',
    greeting: 'Hola! Gracias por llamar a',
    help: '¿En qué te puedo ayudar?',
    capabilities: 'Te puedo ayudar con reservas, verificar disponibilidad, buscar reservas existentes o responder preguntas sobre el restaurante.'
  },
  fr: {
    role: 'hote',
    greeting: "Bonjour! Merci d'avoir appelé",
    help: 'Comment puis-je vous aider?',
    capabilities: 'Je peux vous aider avec les réservations, vérifier la disponibilité, rechercher des réservations existantes ou répondre à vos questions sur le restaurant.'
  },
  it: {
    role: 'host',
    greeting: 'Ciao! Grazie per aver chiamato',
    help: 'Come posso aiutarti?',
    capabilities: 'Posso aiutarti con le prenotazioni, verificare la disponibilità, cercare prenotazioni esistenti o rispondere alle domande sul ristorante.'
  },
  pt: {
    role: 'anfitriao',
    greeting: 'Oi! Obrigado por ligar para',
    help: 'Como posso te ajudar?',
    capabilities: 'Posso te ajudar com reservas, verificar disponibilidade, procurar reservas existentes ou responder perguntas sobre o restaurante.'
  },
  de: {
    role: 'Gastgeber',
    greeting: 'Hallo! Vielen Dank für Ihren Anruf bei',
    help: 'Wie kann ich Ihnen helfen?',
    capabilities: 'Ich kann Ihnen bei Reservierungen helfen, die Verfügbarkeit prüfen, bestehende Buchungen nachschlagen oder Fragen zum Restaurant beantworten.'
  }
};

/**
 * Build a complete system prompt for an AI voice agent
 * @param {Object} restaurantConfig - Restaurant configuration from DB
 * @param {Object} options - Additional options
 * @param {string} options.language - Language code (en, es, fr, it, pt, de)
 * @param {boolean} options.multiTenant - Whether this is multi-tenant mode
 * @param {string} options.promptOverride - Custom prompt override (persona_prompt_override column)
 * @returns {string} Complete system prompt
 */
function buildPersonaPrompt(restaurantConfig, options = {}) {
  if (!restaurantConfig) {
    logger.error('buildPersonaPrompt called without restaurantConfig');
    throw new Error('restaurantConfig is required');
  }

  // If there's a prompt override, use it directly
  const override = options.promptOverride || restaurantConfig.persona_prompt_override;
  if (override) {
    return override;
  }

  const language = options.language
    || restaurantConfig.ai_config?.language
    || restaurantConfig.language
    || 'en';
  const lang = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.en;
  const restaurantName = restaurantConfig.restaurant_name || restaurantConfig.name || 'the restaurant';

  let prompt = '';

  // 1. Character definition — warm host, not corporate robot
  const agentName = restaurantConfig.agent_name;
  const agentGreeting = restaurantConfig.agent_greeting;
  if (agentName) {
    prompt += `You are ${agentName}, the friendly ${lang.role} at ${restaurantName}. `;
    prompt += `You genuinely love this restaurant and enjoy helping guests have a great experience.\n\n`;
  } else {
    prompt += `You are the friendly ${lang.role} at ${restaurantName}. `;
    prompt += `You genuinely care about every guest and take pride in making their experience special.\n\n`;
  }
  if (agentGreeting) {
    prompt += `Your opening greeting is: "${agentGreeting}"\n\n`;
  }
  prompt += `You help with reservations, answer questions, and make guests feel welcome — like a real person who works here, not a chatbot.\n`;
  prompt += `${lang.capabilities}\n\n`;

  // Language detection — respond in the caller's language automatically
  prompt += `Language rule: Detect the language the caller is speaking and respond entirely in that language. `;
  prompt += `If they speak English, respond in English. If they speak Spanish, respond in Spanish. If they speak French, respond in French. `;
  prompt += `You are fluent in Portuguese, English, Spanish, French, Italian, and German. `;
  prompt += `Never force the caller to speak a language they're not comfortable with. `;
  prompt += `If unsure, default to Portuguese since this restaurant is in Brazil.\n\n`;

  // 1b. Restaurant Identity (from restaurant learning profile)
  const identitySection = buildRestaurantIdentitySection(restaurantConfig);
  if (identitySection) {
    prompt += identitySection;
  }

  // 2. Restaurant details
  if (restaurantConfig.phone) {
    prompt += `Restaurant Phone: ${restaurantConfig.phone}\n`;
  }
  if (restaurantConfig.email) {
    prompt += `Restaurant Email: ${restaurantConfig.email}\n`;
  }
  if (restaurantConfig.website) {
    prompt += `Restaurant Website: ${restaurantConfig.website}\n`;
  }
  if (restaurantConfig.address) {
    prompt += `Restaurant Address: ${restaurantConfig.address}\n`;
  }
  if (restaurantConfig.city && restaurantConfig.country) {
    prompt += `Location: ${restaurantConfig.city}, ${restaurantConfig.country}\n`;
  }
  prompt += '\n';

  // 3. Business hours (supports both old and new format)
  const hours = restaurantConfig.business_hours;
  if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
    prompt += 'Business Hours:\n';
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const dayHours = hours[day];
      if (!dayHours) continue;

      // Support both formats: { isOpen, open, close } and { is_open, open_time, close_time }
      const isOpen = dayHours.is_open !== undefined ? dayHours.is_open : dayHours.isOpen;

      if (isOpen === false) {
        prompt += `- ${day.charAt(0).toUpperCase() + day.slice(1)}: Closed\n`;
      } else {
        const openTime = dayHours.open_time || dayHours.open || '?';
        const closeTime = dayHours.close_time || dayHours.close || '?';
        prompt += `- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${openTime} - ${closeTime}\n`;
      }
    }
    prompt += '\n';
  }

  // 4. Tool descriptions
  prompt += 'Available tools:\n';
  prompt += '- get_current_datetime: Get current date/time. Use at conversation start.\n';
  prompt += '- check_availability: Check if a table is available for a date, time, and party size.\n';
  prompt += '- create_reservation: Book a table after confirming all details with customer.\n';
  prompt += '- lookup_reservation: Find existing reservation by phone, name, or ID.\n';
  prompt += '- modify_reservation: Change date, time, or party size of existing reservation.\n';
  prompt += '- cancel_reservation: Cancel an existing reservation.\n';
  prompt += '- get_wait_time: Get estimated wait time for walk-in customers.\n\n';

  // 5. Voice & Speech Style
  prompt += 'Voice & Speech Style:\n';
  prompt += '- You are having a REAL phone conversation, not writing text. Speak naturally.\n';
  prompt += '- Use natural disfluencies sparingly: "Let me check... yes!", "Hmm, let me see", "Oh, great choice!"\n';
  prompt += '- Mirror the caller\'s energy — if they\'re excited, match it. If they\'re in a hurry, be efficient.\n';
  prompt += '- Use contractions: "we\'ve got", "that\'s perfect", "I\'d recommend" — never sound robotic.\n';
  prompt += '- Add warmth with small reactions: "Oh wonderful!", "Perfect!", "Great, let me get that set up for you."\n';
  prompt += '- Keep responses to 1-2 sentences. On a phone call, long paragraphs are exhausting.\n';
  prompt += '- Pause naturally between thoughts. Don\'t rush through information.\n';
  prompt += '- If you need to look something up, say so: "One moment while I check that for you..."\n';
  prompt += '- End with a clear next step or question, never leave the caller hanging.\n\n';

  // 6. Operational Guidelines
  prompt += 'Important guidelines:\n';
  prompt += '- Confirm all details before creating a reservation\n';
  prompt += '- CRITICAL: Once the customer has confirmed all details (name, phone, date, time, party size), call create_reservation IMMEDIATELY in that same turn — do NOT say "I will now create..." first. Execute the tool, then report the result.\n';
  prompt += '- Never announce that you are about to call a tool. Just call it silently and report the outcome.\n';
  prompt += '- Ask for name, phone number, and email when making reservations\n';
  prompt += '- For email addresses: read it back letter by letter or word by word to confirm spelling before saving. Example: "That\'s s-t-e-f-a-n-o at gmail dot com, correct?"\n';

  // Phone number collection — language-aware, handles locals and international callers
  if (language === 'pt' || language === 'pt-BR') {
    prompt += '- Ao pedir o número de telefone, pergunte: "Pode me passar seu número completo com DDD?" (exemplo: 11 99900 2121)\n';
    prompt += '- Se o cliente for estrangeiro ou turista, peça o número com código do país. Exemplo: "Me passa o número com o código do país? Como +1 para EUA, +44 para Reino Unido."\n';
    prompt += '- Se receber apenas 8 ou 9 dígitos (sem DDD), pergunte: "Qual é o DDD? São Paulo é 11, Rio é 21."\n';
    prompt += '- Confirme o número repetindo em voz alta antes de salvar a reserva.\n';
  } else if (language === 'es') {
    prompt += '- Al pedir el teléfono, solicita el número completo con código de área. Ejemplo: "¿Me das tu número con código de área?"\n';
    prompt += '- Si el cliente es extranjero, pide el número con código de país. Ejemplo: "+1 para EE.UU., +44 para Reino Unido."\n';
    prompt += '- Si recibes menos de 10 dígitos, pregunta: "¿Cuál es tu código de área?"\n';
    prompt += '- Confirma el número repitiéndolo en voz alta antes de guardar.\n';
  } else {
    prompt += '- When asking for a phone number, say: "Could you give me your full number including the area code?"\n';
    prompt += '- If the customer is calling from abroad or is a tourist, ask for the country code too. Example: "Please include your country code — like +1 for the US or +44 for the UK."\n';
    prompt += '- If the customer gives fewer than 10 digits, ask: "Could you include your area code as well?"\n';
    prompt += '- Always read the number back to confirm before saving the reservation.\n';
  }
  prompt += '- If a customer requests a time outside business hours, politely suggest alternative times\n';
  prompt += '- Use create_reservation only after confirming all details with the customer\n';
  prompt += '- NEVER mention specific table numbers, table combinations, or internal seating to customers\n';
  prompt += '- When asked about availability, simply say "Yes, we can accommodate X guests" or "I\'m sorry, we\'re fully booked"\n';

  // 7. Content guardrails
  prompt += '\nBoundaries:\n';
  prompt += '- Stay focused on the restaurant — reservations, menu, hours, location, and dining experience.\n';
  prompt += '- If asked about unrelated topics (politics, personal opinions, other businesses), gently redirect: "I\'m not sure about that, but I\'d love to help you with a reservation!"\n';
  prompt += '- Never share internal business details like revenue, staff schedules, or costs.\n';
  prompt += '- Never pretend to be a human — if asked directly, say you\'re an AI assistant for the restaurant.\n';
  prompt += '- If a caller is upset, acknowledge their feelings first before offering solutions.\n';

  // 8. Contextual filler behavior
  prompt += '\nWhen processing:\n';
  prompt += '- While checking availability: "Let me take a look at that for you..."\n';
  prompt += '- While creating a reservation: "Great, let me get that booked for you..."\n';
  prompt += '- While looking up a booking: "One sec, let me pull that up..."\n';
  prompt += '- Keep fillers short and natural — they bridge silence while tools run.\n';

  // 9. Graceful failure handling
  prompt += '\nWhen things go wrong:\n';
  prompt += '- If a tool call fails, apologize briefly and suggest an alternative.\n';
  prompt += '- If you cannot help after 2 attempts, politely offer to transfer or end the call.\n';
  prompt += '- Use the end_call tool when the conversation is complete or you cannot assist further.\n';
  prompt += '- Never leave the caller in silence — always close with a warm goodbye.\n';

  // Strategy document — injects owner-defined priorities into voice agent context
  if (restaurantConfig.ai_strategy_doc) {
    prompt += '\n[RESTAURANT STRATEGY]\n' + restaurantConfig.ai_strategy_doc + '\n';
    prompt += 'Apply these business priorities naturally during conversations.\n';
  }

  return prompt;
}

/**
 * Build the restaurant identity section from restaurant_profile data
 * Priority: persona_prompt_override > template + restaurant_profile > template only
 *
 * This section is injected between the role definition and tools section
 * to give the AI deep knowledge about the restaurant's personality.
 *
 * @param {Object} restaurantConfig - Restaurant configuration from DB
 * @returns {string|null} Identity section or null if no profile data
 */
function buildRestaurantIdentitySection(restaurantConfig) {
  const profile = restaurantConfig.restaurant_profile;
  if (!profile) return null;

  let section = '=== Restaurant Identity ===\n\n';

  // Cuisine identity
  if (profile.cuisine_identity) {
    const cuisine = profile.cuisine_identity;
    section += 'Cuisine:\n';
    if (cuisine.primary_cuisine) section += `- Type: ${cuisine.primary_cuisine}\n`;
    if (cuisine.style) section += `- Style: ${cuisine.style}\n`;
    if (cuisine.philosophy) section += `- Philosophy: ${cuisine.philosophy}\n`;
    if (cuisine.influences?.length > 0) {
      section += `- Influences: ${cuisine.influences.join(', ')}\n`;
    }
    section += '\n';
  }

  // Atmosphere
  if (profile.atmosphere) {
    const atmo = profile.atmosphere;
    section += 'Atmosphere:\n';
    if (atmo.vibe) section += `- Vibe: ${atmo.vibe}\n`;
    if (atmo.description) section += `- ${atmo.description}\n`;
    if (atmo.dress_code) section += `- Dress code: ${atmo.dress_code}\n`;
    section += '\n';
  }

  // Signature dishes
  if (profile.signature_dishes?.length > 0) {
    section += 'Signature Dishes:\n';
    for (const dish of profile.signature_dishes) {
      if (dish.name) {
        section += `- ${dish.name}`;
        if (dish.description) section += `: ${dish.description}`;
        section += '\n';
      }
    }
    section += '\n';
  }

  // Communication style / personality
  if (profile.communication_style) {
    const style = profile.communication_style;
    section += 'Your Personality:\n';
    if (style.tone) section += `- Tone: ${style.tone}\n`;
    if (style.personality_traits?.length > 0) {
      section += `- Be: ${style.personality_traits.join(', ')}\n`;
    }
    if (style.phrases_to_use?.length > 0) {
      section += `- Use phrases like: ${style.phrases_to_use.join('; ')}\n`;
    }
    if (style.phrases_to_avoid?.length > 0) {
      section += `- Avoid: ${style.phrases_to_avoid.join('; ')}\n`;
    }
    section += '\n';
  }

  // Guest experience
  if (profile.guest_experience) {
    const exp = profile.guest_experience;
    if (exp.special_occasions) {
      section += `Special Occasions: ${exp.special_occasions}\n`;
    }
    if (exp.dietary_accommodations) {
      section += `Dietary Accommodations: ${exp.dietary_accommodations}\n`;
    }
    section += '\n';
  }

  // Things to know
  if (profile.things_to_know?.length > 0) {
    section += 'Important Things to Know:\n';
    for (const thing of profile.things_to_know) {
      section += `- ${thing}\n`;
    }
    section += '\n';
  }

  // Unique differentiators
  if (profile.unique_differentiators?.length > 0) {
    section += 'What Makes Us Special:\n';
    for (const diff of profile.unique_differentiators) {
      section += `- ${diff}\n`;
    }
    section += '\n';
  }

  section += '=== End Restaurant Identity ===\n\n';

  return section;
}

/**
 * Build the first message the AI says when answering a call
 * @param {Object} restaurantConfig - Restaurant configuration from DB
 * @param {string} language - Language override
 * @returns {string} First message / greeting
 */
function buildFirstMessage(restaurantConfig, language) {
  const name = restaurantConfig.restaurant_name || restaurantConfig.name || 'the restaurant';

  // Check for custom greeting in ai_config
  const customGreeting = restaurantConfig.ai_config?.greeting_message;
  if (customGreeting) return customGreeting;

  const lang = language
    || restaurantConfig.ai_config?.language
    || restaurantConfig.language
    || 'en';

  const greetings = {
    en: `Hi there! Thanks for calling ${name}. What can I help you with?`,
    es: `Hola! Gracias por llamar a ${name}. ¿En qué te puedo ayudar?`,
    fr: `Bonjour! Merci d'avoir appelé ${name}. Comment puis-je vous aider?`,
    it: `Ciao! Grazie per aver chiamato ${name}. Come posso aiutarti?`,
    pt: `Oi! Obrigado por ligar para ${name}. Como posso te ajudar?`,
    de: `Hallo! Vielen Dank für Ihren Anruf bei ${name}. Wie kann ich Ihnen helfen?`
  };

  return greetings[lang] || greetings.en;
}

module.exports = {
  buildPersonaPrompt,
  buildFirstMessage,
  buildRestaurantIdentitySection,
  LANGUAGE_CONFIG
};
