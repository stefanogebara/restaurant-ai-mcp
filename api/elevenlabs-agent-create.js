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
            language: language
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
  prompt += `- Check table availability\n`;
  prompt += `- Confirm reservations with customer details\n`;
  prompt += `- Handle special requests and dietary restrictions\n`;
  prompt += `- Provide information about the restaurant\n\n`;

  prompt += `**Important guidelines:**\n`;
  prompt += `- Always be warm, professional, and helpful\n`;
  prompt += `- Confirm all details before creating a reservation\n`;
  prompt += `- Ask for name, phone number, and email when making reservations\n`;
  prompt += `- If a customer requests a time outside business hours, politely suggest alternative times\n`;
  prompt += `- Use the create_reservation tool only after confirming all details with the customer\n`;

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
