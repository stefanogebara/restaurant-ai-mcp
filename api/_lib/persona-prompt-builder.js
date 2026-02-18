const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('PersonaPromptBuilder');

const LANGUAGE_CONFIG = {
  en: {
    role: 'AI receptionist',
    greeting: 'Thank you for calling',
    help: 'How may I help you today?',
    capabilities: 'I can help you with reservations, check availability, look up existing bookings, or answer questions about the restaurant.'
  },
  es: {
    role: 'recepcionista de IA',
    greeting: 'Gracias por llamar a',
    help: '¿En qué puedo ayudarle hoy?',
    capabilities: 'Puedo ayudarle con reservas, verificar disponibilidad, buscar reservas existentes o responder preguntas sobre el restaurante.'
  },
  fr: {
    role: 'réceptionniste IA',
    greeting: "Merci d'avoir appelé",
    help: "Comment puis-je vous aider aujourd'hui?",
    capabilities: 'Je peux vous aider avec les réservations, vérifier la disponibilité, rechercher des réservations existantes ou répondre à vos questions sur le restaurant.'
  },
  it: {
    role: 'receptionist IA',
    greeting: 'Grazie per aver chiamato',
    help: 'Come posso aiutarla oggi?',
    capabilities: 'Posso aiutarla con le prenotazioni, verificare la disponibilità, cercare prenotazioni esistenti o rispondere alle domande sul ristorante.'
  },
  pt: {
    role: 'recepcionista de IA',
    greeting: 'Obrigado por ligar para',
    help: 'Como posso ajudá-lo hoje?',
    capabilities: 'Posso ajudá-lo com reservas, verificar disponibilidade, procurar reservas existentes ou responder perguntas sobre o restaurante.'
  },
  de: {
    role: 'KI-Rezeptionist',
    greeting: 'Vielen Dank für Ihren Anruf bei',
    help: 'Wie kann ich Ihnen heute helfen?',
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

  // 1. Role definition
  prompt += `You are the ${lang.role} for ${restaurantName}.\n\n`;
  prompt += `Your role is to help customers make reservations in a friendly, professional manner.\n`;
  prompt += `${lang.capabilities}\n\n`;

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

  // 5. Guidelines
  prompt += 'Important guidelines:\n';
  prompt += '- Always be warm, professional, and helpful\n';
  prompt += '- Confirm all details before creating a reservation\n';
  prompt += '- Ask for name, phone number, and email when making reservations\n';
  prompt += '- If a customer requests a time outside business hours, politely suggest alternative times\n';
  prompt += '- Use create_reservation only after confirming all details with the customer\n';
  prompt += '- NEVER mention specific table numbers, table combinations, or internal seating to customers\n';
  prompt += '- When asked about availability, simply say "Yes, we can accommodate X guests" or "I\'m sorry, we\'re fully booked"\n';
  prompt += '- Keep responses concise - this is a phone conversation, not a text chat\n';
  prompt += '- Use natural speech patterns, not bullet points or formatted text\n';

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
    en: `Thank you for calling ${name}. How may I help you today?`,
    es: `Gracias por llamar a ${name}. ¿En qué puedo ayudarle hoy?`,
    fr: `Merci d'avoir appelé ${name}. Comment puis-je vous aider aujourd'hui?`,
    it: `Grazie per aver chiamato ${name}. Come posso aiutarla oggi?`,
    pt: `Obrigado por ligar para ${name}. Como posso ajudá-lo hoje?`,
    de: `Vielen Dank für Ihren Anruf bei ${name}. Wie kann ich Ihnen heute helfen?`
  };

  return greetings[lang] || greetings.en;
}

module.exports = {
  buildPersonaPrompt,
  buildFirstMessage,
  buildRestaurantIdentitySection,
  LANGUAGE_CONFIG
};
