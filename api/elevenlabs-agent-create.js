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
      address
    } = req.body;

    // Validate required fields
    if (!restaurant_id || !restaurant_name || !voice_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: restaurant_id, restaurant_name, voice_id'
      });
    }

    // Build custom system prompt
    const systemPrompt = buildSystemPrompt({
      restaurant_name,
      language,
      business_hours,
      custom_greeting,
      phone,
      address
    });

    // Build first message
    const firstMessage = buildFirstMessage({
      restaurant_name,
      language,
      custom_greeting
    });

    // Build tools configuration for the agent
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://restaurant-ai-mcp.vercel.app';

    const tools = buildAgentTools(baseUrl, restaurant_id);

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
 */
function buildAgentTools(baseUrl, restaurant_id) {
  return [
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
      description: 'Check table availability for a specific date, time, and party size. Use this before creating a reservation to verify availability.',
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=check_availability&restaurant_id=${restaurant_id}`,
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
          }
        },
        required: ['date', 'time', 'party_size']
      }
    },
    {
      type: 'webhook',
      name: 'create_reservation',
      description: 'Create a new reservation after confirming all details with the customer. Only use after checking availability and getting customer name, phone, and email.',
      webhook: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=create_reservation&restaurant_id=${restaurant_id}`,
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
        url: `${baseUrl}/api/reservations?action=lookup&restaurant_id=${restaurant_id}`,
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
        url: `${baseUrl}/api/reservations?action=cancel&restaurant_id=${restaurant_id}`,
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
        url: `${baseUrl}/api/reservations?action=modify&restaurant_id=${restaurant_id}`,
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
        url: `${baseUrl}/api/get-wait-time?restaurant_id=${restaurant_id}`,
        method: 'GET'
      },
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ];
}
