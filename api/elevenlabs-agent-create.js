/**
 * ElevenLabs Agent Creation Endpoint
 *
 * Creates a unique conversational AI agent for each restaurant with:
 * - Custom system prompt with restaurant details
 * - Selected voice from onboarding
 * - Language configuration
 * - Conversation tools (create_reservation, check_availability)
 *
 * Related: MVP_PLAN_SIMPLIFICATION.md Phase 2
 */

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      restaurant_id,
      restaurant_name,
      voice_id,
      language = 'en',
      business_hours = {},
      custom_greeting,
      phone,
      address,
      multi_tenant_mode = false  // New parameter for multi-tenant agent
    } = req.body;

    // Build base URL for webhooks
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://restaurant-ai-mcp.vercel.app';

    let systemPrompt, firstMessage, tools, agentName;

    // Multi-tenant mode: Create a platform-wide agent for all restaurants
    if (multi_tenant_mode) {
      // Use default voice for multi-tenant (Rachel - professional voice)
      const defaultVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM';

      systemPrompt = buildMultiTenantSystemPrompt({ language });
      firstMessage = buildMultiTenantFirstMessage({ language });
      tools = buildAgentTools(baseUrl, null, true);  // null restaurant_id, multiTenantMode=true
      agentName = 'Seatable Multi-Restaurant AI';

      // Create multi-tenant agent
      const agentResponse = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: agentName,
          conversation_config: {
            agent: {
              prompt: {
                prompt: systemPrompt,
                llm: 'gemini-2.5-flash'
              },
              first_message: firstMessage,
              language: language,
              tools: tools
            },
            tts: {
              voice_id: defaultVoiceId,
              model_id: 'eleven_turbo_v2_5'
            }
          },
          platform_settings: {
            widget_config: {
              avatar_url: 'https://restaurant-ai-mcp.vercel.app/logo.png',
              title: agentName
            }
          }
        })
      });

      if (!agentResponse.ok) {
        const errorText = await agentResponse.text();
        console.error('ElevenLabs API Error:', errorText);
        return res.status(500).json({
          success: false,
          error: 'Failed to create multi-tenant agent',
          details: errorText
        });
      }

      const agentData = await agentResponse.json();
      return res.status(200).json({
        success: true,
        agent_id: agentData.agent_id,
        agent_url: `https://elevenlabs.io/app/conversational-ai/${agentData.agent_id}`,
        mode: 'multi_tenant',
        language: language,
        message: 'Multi-tenant agent created successfully. Configure this agent ID in your WhatsApp/phone integration.'
      });
    }

    // Single-tenant mode: Validate required fields
    if (!restaurant_id || !restaurant_name || !voice_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: restaurant_id, restaurant_name, voice_id'
      });
    }

    // Build custom system prompt for single restaurant
    systemPrompt = buildSystemPrompt({
      restaurant_name,
      language,
      business_hours,
      custom_greeting,
      phone,
      address
    });

    // Build first message
    firstMessage = buildFirstMessage({
      restaurant_name,
      language,
      custom_greeting
    });

    tools = buildAgentTools(baseUrl, restaurant_id, false);

    // Create agent via ElevenLabs API
    const agentResponse = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `${restaurant_name} AI Receptionist`,  // Custom agent name
        conversation_config: {
          agent: {
            prompt: {
              prompt: systemPrompt,
              llm: 'gemini-2.5-flash'  // Supports multilingual agents
            },
            first_message: firstMessage,
            language: language,
            tools: tools  // Add tools to agent
          },
          tts: {
            voice_id: voice_id,
            model_id: 'eleven_turbo_v2_5'  // Required for non-English TTS
          }
        },
        platform_settings: {
          widget_config: {
            avatar_url: 'https://restaurant-ai-mcp.vercel.app/logo.png',
            title: `${restaurant_name} AI Receptionist`
          }
        }
      })
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('ElevenLabs API Error:', errorText);
      return res.status(500).json({
        success: false,
        error: 'Failed to create agent',
        details: errorText
      });
    }

    const agentData = await agentResponse.json();
    const agent_id = agentData.agent_id;

    // Return agent details
    return res.status(200).json({
      success: true,
      agent_id: agent_id,
      agent_url: `https://elevenlabs.io/app/conversational-ai/${agent_id}`,
      voice_id: voice_id,
      language: language
    });

  } catch (error) {
    console.error('Error creating ElevenLabs agent:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
};

/**
 * Build custom system prompt with restaurant details
 */
function buildSystemPrompt({ restaurant_name, language, business_hours, phone, address }) {
  const languageGreetings = {
    en: {
      role: 'AI receptionist',
      greeting: 'Thank you for calling',
      help: 'How may I help you today?'
    },
    es: {
      role: 'recepcionista de IA',
      greeting: 'Gracias por llamar a',
      help: '¿En qué puedo ayudarle hoy?'
    },
    fr: {
      role: 'réceptionniste IA',
      greeting: 'Merci d\'avoir appelé',
      help: 'Comment puis-je vous aider aujourd\'hui?'
    },
    it: {
      role: 'receptionist IA',
      greeting: 'Grazie per aver chiamato',
      help: 'Come posso aiutarla oggi?'
    },
    pt: {
      role: 'recepcionista de IA',
      greeting: 'Obrigado por ligar para',
      help: 'Como posso ajudá-lo hoje?'
    }
  };

  const lang = languageGreetings[language] || languageGreetings.en;

  let prompt = `You are the ${lang.role} for ${restaurant_name}.\n\n`;

  prompt += `Your role is to help customers make reservations in a friendly, professional manner.\n\n`;

  if (phone) {
    prompt += `Restaurant Phone: ${phone}\n`;
  }

  if (address) {
    prompt += `Restaurant Address: ${address}\n`;
  }

  if (business_hours && Object.keys(business_hours).length > 0) {
    prompt += `\nBusiness Hours:\n`;
    Object.entries(business_hours).forEach(([day, hours]) => {
      if (hours.isOpen) {
        prompt += `- ${day}: ${hours.open} - ${hours.close}\n`;
      } else {
        prompt += `- ${day}: Closed\n`;
      }
    });
  }

  prompt += `\n**Your capabilities:**\n`;
  prompt += `- Take reservation requests (party size, date, time)\n`;
  prompt += `- Check if we can accommodate parties of various sizes\n`;
  prompt += `- Confirm reservations with customer details\n`;
  prompt += `- Handle special requests and dietary restrictions\n`;
  prompt += `- Provide information about the restaurant\n\n`;

  prompt += `**Important guidelines:**\n`;
  prompt += `- Always be warm, professional, and helpful\n`;
  prompt += `- Confirm all details before creating a reservation\n`;
  prompt += `- Ask for name, phone number, and email when making reservations\n`;
  prompt += `- If a customer requests a time outside business hours, politely suggest alternative times\n`;
  prompt += `- Use the create_reservation tool only after confirming all details with the customer\n`;
  prompt += `- IMPORTANT: Never mention specific table numbers, table combinations, or internal seating arrangements to customers\n`;
  prompt += `- When asked about availability, simply say "Yes, we can accommodate X guests" or "I'm sorry, we're fully booked at that time"\n`;
  prompt += `- The host will handle actual table assignments when the customer arrives\n`;

  return prompt;
}

/**
 * Build first message based on language and custom greeting
 */
function buildFirstMessage({ restaurant_name, language, custom_greeting }) {
  if (custom_greeting) {
    return custom_greeting;
  }

  const defaultGreetings = {
    en: `Thank you for calling ${restaurant_name}. How may I help you today?`,
    es: `Gracias por llamar a ${restaurant_name}. ¿En qué puedo ayudarle hoy?`,
    fr: `Merci d'avoir appelé ${restaurant_name}. Comment puis-je vous aider aujourd'hui?`,
    it: `Grazie per aver chiamato ${restaurant_name}. Come posso aiutarla oggi?`,
    pt: `Obrigado por ligar para ${restaurant_name}. Como posso ajudá-lo hoje?`
  };

  return defaultGreetings[language] || defaultGreetings.en;
}

/**
 * Build agent tools configuration
 * These webhook-based tools allow the agent to interact with our reservation system
 * @param {string} baseUrl - The base URL for webhook endpoints
 * @param {string} restaurant_id - The restaurant ID (null for multi-tenant mode)
 * @param {boolean} multiTenantMode - Whether to include restaurant identification tools
 */
function buildAgentTools(baseUrl, restaurant_id, multiTenantMode = false) {
  const tools = [];

  // Add identify_restaurant tool for multi-tenant mode (MUST be first)
  if (multiTenantMode) {
    tools.push({
      type: 'webhook',
      name: 'identify_restaurant',
      description: 'Identify which restaurant the customer wants to book at. Call this FIRST when a customer mentions a restaurant name or at the start of any conversation. This must be called before any reservation actions like check_availability or create_reservation.',
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=identify_restaurant`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          restaurant_name: {
            type: 'string',
            description: 'The name of the restaurant the customer mentioned or wants to book at'
          },
          sender_phone: {
            type: 'string',
            description: 'The phone number of the customer (from conversation context)'
          },
          conversation_id: {
            type: 'string',
            description: 'The current conversation ID'
          }
        },
        required: ['restaurant_name']
      }
    });
  }

  // Build restaurant_id query param only if provided (single-tenant mode)
  const restaurantParam = restaurant_id ? `&restaurant_id=${restaurant_id}` : '';

  // Standard tools that work in both single and multi-tenant mode
  tools.push(
    {
      type: 'webhook',
      name: 'get_current_datetime',
      description: 'Get the current date and time. Use this at the start of conversations to know what "today" and "tomorrow" mean. Returns current date, time, day of week, and relative dates.',
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=get_current_datetime`,
        method: 'GET'
      },
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      type: 'webhook',
      name: 'check_availability',
      description: 'Check table availability for a specific date, time, and party size. Use this before creating a reservation to verify availability.' + (multiTenantMode ? ' NOTE: In multi-restaurant mode, call identify_restaurant FIRST to select the restaurant.' : ''),
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=check_availability${restaurantParam}`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date for the reservation in YYYY-MM-DD format (e.g., 2025-11-26)'
          },
          time: {
            type: 'string',
            description: 'The time for the reservation in HH:MM format (e.g., 19:00)'
          },
          party_size: {
            type: 'number',
            description: 'Number of people dining (e.g., 2, 4, 6). This must be a NUMBER, not a date.'
          },
          sender_phone: {
            type: 'string',
            description: 'The phone number of the customer (required in multi-restaurant mode)'
          }
        },
        required: ['date', 'time', 'party_size']
      }
    },
    {
      type: 'webhook',
      name: 'create_reservation',
      description: 'Create a new reservation after confirming all details with the customer. Only use after checking availability and getting customer name, phone, and email.' + (multiTenantMode ? ' NOTE: In multi-restaurant mode, call identify_restaurant FIRST.' : ''),
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=create_reservation${restaurantParam}`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          customer_name: {
            type: 'string',
            description: 'Full name of the customer making the reservation'
          },
          customer_phone: {
            type: 'string',
            description: 'Phone number of the customer'
          },
          customer_email: {
            type: 'string',
            description: 'Email address of the customer (optional)'
          },
          date: {
            type: 'string',
            description: 'The date for the reservation in YYYY-MM-DD format'
          },
          time: {
            type: 'string',
            description: 'The time for the reservation in HH:MM format'
          },
          party_size: {
            type: 'number',
            description: 'Number of people dining. This must be a NUMBER, not a date.'
          },
          special_requests: {
            type: 'string',
            description: 'Any special requests or dietary requirements (optional)'
          },
          sender_phone: {
            type: 'string',
            description: 'The phone number of the customer (required in multi-restaurant mode)'
          }
        },
        required: ['customer_name', 'customer_phone', 'date', 'time', 'party_size']
      }
    },
    {
      type: 'webhook',
      name: 'lookup_reservation',
      description: 'Find an existing reservation by customer phone number or name. Use this to help customers find their reservation details or before modifying/canceling.',
      webhook: {
        url: `${baseUrl}/api/reservations?action=lookup${restaurantParam}`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          customer_phone: {
            type: 'string',
            description: 'Phone number used for the reservation'
          },
          customer_name: {
            type: 'string',
            description: 'Name used for the reservation (optional if phone provided)'
          }
        },
        required: []
      }
    },
    {
      type: 'webhook',
      name: 'cancel_reservation',
      description: 'Cancel an existing reservation. First use lookup_reservation to get the Reservation ID, then call this tool to cancel it.',
      webhook: {
        url: `${baseUrl}/api/reservations?action=cancel${restaurantParam}`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The unique reservation ID to cancel'
          }
        },
        required: ['reservation_id']
      }
    },
    {
      type: 'webhook',
      name: 'modify_reservation',
      description: 'Change the date, time, or party size of an existing reservation. First use lookup_reservation to get the Reservation ID.',
      webhook: {
        url: `${baseUrl}/api/reservations?action=modify${restaurantParam}`,
        method: 'POST'
      },
      parameters: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'The unique reservation ID to modify'
          },
          new_date: {
            type: 'string',
            description: 'New date in YYYY-MM-DD format (optional)'
          },
          new_time: {
            type: 'string',
            description: 'New time in HH:MM format (optional)'
          },
          new_party_size: {
            type: 'number',
            description: 'New party size (optional)'
          }
        },
        required: ['reservation_id']
      }
    },
    {
      type: 'webhook',
      name: 'get_wait_time',
      description: 'Get the current estimated wait time for walk-in customers. Use when someone asks about wait times or walk-in availability today.',
      webhook: {
        url: `${baseUrl}/api/get-wait-time?${restaurant_id ? `restaurant_id=${restaurant_id}` : ''}`,
        method: 'GET'
      },
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  );

  return tools;
}

/**
 * Build system prompt for multi-tenant mode (Seatable platform)
 * This prompt handles multiple restaurants and guides the agent to identify the restaurant first
 */
function buildMultiTenantSystemPrompt({ language = 'en' }) {
  const languagePrompts = {
    en: {
      role: 'AI reservation assistant',
      platform: 'Seatable restaurant reservation platform',
      intro: 'You help customers make reservations at any of our partner restaurants.',
      workflow: `CRITICAL WORKFLOW - FOLLOW THIS ORDER:
1. FIRST: Ask which restaurant they want to book at (if not mentioned)
2. SECOND: Use identify_restaurant tool with the restaurant name they provide
3. THIRD: Once restaurant is confirmed, proceed with availability and reservations
4. All subsequent actions will automatically route to the correct restaurant`,
      guidelines: `IMPORTANT GUIDELINES:
- Always be warm, professional, and helpful
- If the customer mentions a restaurant name, immediately use identify_restaurant
- If identify_restaurant returns multiple matches, present the options clearly
- Once restaurant is confirmed, the session remembers it - no need to ask again
- Confirm all reservation details before creating
- Never mention internal table numbers or seating arrangements`
    },
    es: {
      role: 'asistente de reservas de IA',
      platform: 'plataforma de reservas de restaurantes Seatable',
      intro: 'Ayudo a los clientes a hacer reservas en cualquiera de nuestros restaurantes asociados.',
      workflow: `FLUJO DE TRABAJO CRÍTICO - SIGUE ESTE ORDEN:
1. PRIMERO: Pregunta en qué restaurante quieren reservar (si no lo mencionan)
2. SEGUNDO: Usa la herramienta identify_restaurant con el nombre del restaurante
3. TERCERO: Una vez confirmado el restaurante, procede con disponibilidad y reservas
4. Todas las acciones posteriores se enrutarán automáticamente al restaurante correcto`,
      guidelines: `DIRECTRICES IMPORTANTES:
- Siempre sé amable, profesional y servicial
- Si el cliente menciona un nombre de restaurante, usa identify_restaurant inmediatamente
- Si identify_restaurant devuelve múltiples coincidencias, presenta las opciones claramente
- Una vez confirmado el restaurante, la sesión lo recuerda - no preguntes de nuevo
- Confirma todos los detalles de la reserva antes de crearla
- Nunca menciones números de mesa internos o disposiciones de asientos`
    }
  };

  const lang = languagePrompts[language] || languagePrompts.en;

  return `You are the ${lang.role} for the ${lang.platform}. ${lang.intro}

${lang.workflow}

${lang.guidelines}`;
}

/**
 * Build first message for multi-tenant mode
 */
function buildMultiTenantFirstMessage({ language = 'en' }) {
  const messages = {
    en: "Hello! I'm the Seatable AI assistant. I can help you make reservations at any of our partner restaurants. Which restaurant would you like to book at today?",
    es: "¡Hola! Soy el asistente de IA de Seatable. Puedo ayudarte a hacer reservas en cualquiera de nuestros restaurantes asociados. ¿En qué restaurante te gustaría reservar hoy?",
    fr: "Bonjour! Je suis l'assistant IA de Seatable. Je peux vous aider à faire des réservations dans n'importe lequel de nos restaurants partenaires. Dans quel restaurant souhaitez-vous réserver aujourd'hui?",
    it: "Ciao! Sono l'assistente IA di Seatable. Posso aiutarti a fare prenotazioni in uno qualsiasi dei nostri ristoranti partner. In quale ristorante vorresti prenotare oggi?",
    pt: "Olá! Sou o assistente de IA da Seatable. Posso ajudá-lo a fazer reservas em qualquer um dos nossos restaurantes parceiros. Em qual restaurante você gostaria de reservar hoje?"
  };

  return messages[language] || messages.en;
}
