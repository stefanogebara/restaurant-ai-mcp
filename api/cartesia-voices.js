/**
 * Cartesia Voices API - Vercel Serverless Function
 * GET /api/cartesia-voices
 * Fetches available voices from Cartesia, filtered by language based on country
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('CartesiaVoices');

// Language mapping for countries
const COUNTRY_LANGUAGE_MAP = {
  // Spanish-speaking countries
  'Spain': 'es', 'España': 'es',
  'Mexico': 'es', 'México': 'es',
  'Argentina': 'es', 'Colombia': 'es',
  'Chile': 'es', 'Peru': 'es', 'Perú': 'es',
  'Venezuela': 'es', 'Ecuador': 'es',
  'Guatemala': 'es', 'Cuba': 'es',
  'Bolivia': 'es', 'Dominican Republic': 'es',
  'Honduras': 'es', 'Paraguay': 'es',
  'El Salvador': 'es', 'Nicaragua': 'es',
  'Costa Rica': 'es', 'Panama': 'es', 'Panamá': 'es',
  'Uruguay': 'es', 'Puerto Rico': 'es',

  // English-speaking countries
  'United Kingdom': 'en', 'UK': 'en', 'England': 'en',
  'United States': 'en', 'USA': 'en', 'US': 'en',
  'Canada': 'en', 'Australia': 'en',
  'Ireland': 'en', 'New Zealand': 'en',
  'South Africa': 'en',

  // French-speaking countries
  'France': 'fr', 'Belgium': 'fr',
  'Switzerland': 'fr', 'Monaco': 'fr',
  'Luxembourg': 'fr',

  // German-speaking countries
  'Germany': 'de', 'Austria': 'de',

  // Italian-speaking countries
  'Italy': 'it',

  // Portuguese-speaking countries
  'Portugal': 'pt', 'Brazil': 'pt',

  // Other languages
  'China': 'zh', 'Japan': 'ja',
  'Korea': 'ko', 'South Korea': 'ko',
  'Netherlands': 'nl', 'Poland': 'pl',
  'Russia': 'ru', 'Sweden': 'sv',
  'Turkey': 'tr', 'India': 'hi'
};

// Sample phrases for voice preview (language-specific)
const PREVIEW_PHRASES = {
  'en': "Welcome to our restaurant! I'd be happy to help you make a reservation today.",
  'es': "¡Bienvenido a nuestro restaurante! Estaré encantado de ayudarle a hacer una reserva hoy.",
  'fr': "Bienvenue dans notre restaurant! Je serais ravi de vous aider à réserver aujourd'hui.",
  'de': "Willkommen in unserem Restaurant! Ich helfe Ihnen gerne, heute einen Tisch zu reservieren.",
  'it': "Benvenuto nel nostro ristorante! Sarò felice di aiutarti a prenotare oggi.",
  'pt': "Bem-vindo ao nosso restaurante! Terei prazer em ajudá-lo a fazer uma reserva hoje.",
  'zh': "欢迎光临我们的餐厅！我很乐意帮您预订今天的座位。",
  'ja': "当レストランへようこそ！本日のご予約をお手伝いさせていただきます。",
  'hi': "हमारे रेस्तरां में आपका स्वागत है! मैं आज आपको आरक्षण करने में मदद करने में खुश हूं।",
  'ko': "저희 레스토랑에 오신 것을 환영합니다! 오늘 예약을 도와드리겠습니다.",
  'nl': "Welkom bij ons restaurant! Ik help u graag vandaag nog een reservering te maken.",
  'pl': "Witamy w naszej restauracji! Chętnie pomogę Ci dokonać rezerwacji dzisiaj.",
  'ru': "Добро пожаловать в наш ресторан! Я буду рад помочь вам сделать бронирование сегодня.",
  'sv': "Välkommen till vår restaurang! Jag hjälper dig gärna att boka bord idag.",
  'tr': "Restoranımıza hoş geldiniz! Bugün rezervasyon yapmanıza yardımcı olmaktan mutluluk duyarım."
};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { country, language } = req.query;

    // Validate API key
    if (!process.env.CARTESIA_API_KEY) {
      logger.error('[Cartesia] CARTESIA_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'Cartesia API key not configured'
      });
    }

    // Determine language from country or use explicit language
    let targetLanguage = language || COUNTRY_LANGUAGE_MAP[country] || 'en';

    logger.info(`[Cartesia] Fetching voices for language: ${targetLanguage} (country: ${country})`);

    // Fetch voices from Cartesia API
    const response = await fetch('https://api.cartesia.ai/voices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CARTESIA_API_KEY}`,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Cartesia] API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: `Cartesia API error: ${response.status} ${errorText}`
      });
    }

    const data = await response.json();
    logger.info(`[Cartesia] Received ${data.length || 0} total voices`);

    // Filter voices by language and public availability
    // Use startsWith() to match language variants (e.g., 'pt' matches 'pt-BR' and 'pt-PT')
    let filteredVoices = data.filter(voice => {
      const voiceLang = voice.language || '';
      return voiceLang.startsWith(targetLanguage) && voice.is_public === true;
    });

    logger.info(`[Cartesia] Filtered to ${filteredVoices.length} voices for language ${targetLanguage}`);

    // Return top 6 voices (one row)
    const voicesToReturn = filteredVoices.slice(0, 6);

    // Add preview phrase for each voice
    const previewPhrase = PREVIEW_PHRASES[targetLanguage] || PREVIEW_PHRASES['en'];
    const voicesWithPhrases = voicesToReturn.map(voice => ({
      id: voice.id,
      name: voice.name,
      description: voice.description || '',
      language: voice.language,
      gender: voice.gender,
      preview_phrase: previewPhrase,
      is_starred: voice.is_starred || false,
    }));

    return res.status(200).json({
      success: true,
      data: {
        voices: voicesWithPhrases,
        language: targetLanguage,
        country: country,
        total_count: filteredVoices.length,
        returned_count: voicesWithPhrases.length
      }
    });

  } catch (error) {
    logger.error('[Cartesia] Error fetching voices:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch voices'
    });
  }
};
