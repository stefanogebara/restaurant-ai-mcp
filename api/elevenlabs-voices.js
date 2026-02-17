/**
 * ElevenLabs Voices API - Vercel Serverless Function
 * GET /api/elevenlabs-voices
 * Fetches available voices from ElevenLabs Voice Library (shared-voices),
 * with filtering by language, gender, search, and pagination.
 *
 * Backward compatible: old callers without page_size get 6 voices (legacy behavior).
 * New callers set page_size=12 for enhanced browsing.
 */

const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('ElevenLabsVoices');

// Language mapping for countries
const COUNTRY_LANGUAGE_MAP = {
  // Spanish-speaking countries - Spain gets special treatment (es-ES)
  'Spain': 'es-ES', 'España': 'es-ES',
  // Latin American Spanish (es-LATAM)
  'Mexico': 'es-LATAM', 'México': 'es-LATAM',
  'Argentina': 'es-LATAM', 'Colombia': 'es-LATAM',
  'Chile': 'es-LATAM', 'Peru': 'es-LATAM', 'Perú': 'es-LATAM',
  'Venezuela': 'es-LATAM', 'Ecuador': 'es-LATAM',
  'Guatemala': 'es-LATAM', 'Cuba': 'es-LATAM',
  'Bolivia': 'es-LATAM', 'Dominican Republic': 'es-LATAM',
  'Honduras': 'es-LATAM', 'Paraguay': 'es-LATAM',
  'El Salvador': 'es-LATAM', 'Nicaragua': 'es-LATAM',
  'Costa Rica': 'es-LATAM', 'Panama': 'es-LATAM', 'Panamá': 'es-LATAM',
  'Uruguay': 'es-LATAM', 'Puerto Rico': 'es-LATAM',

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
  'Portugal': 'pt-PT',
  'Brazil': 'pt-BR',

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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ success: false, error: authResult.error });
  }
  req.user = authResult.user;

  // Check subscription + voice_ai feature access (Growth+ only)
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  let featureAllowed = false;
  requireFeature('voice_ai')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  try {
    const {
      country,
      language,
      gender,
      search,
      use_case,
      page_size: pageSizeParam,
      page: pageParam
    } = req.query;

    if (!process.env.ELEVENLABS_API_KEY) {
      logger.error('[ElevenLabs] ELEVENLABS_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    // Determine language from country or explicit language param
    let targetLanguage = language || COUNTRY_LANGUAGE_MAP[country] || 'en';
    const normalizedLanguage = targetLanguage.split('-')[0];

    // Pagination: backward compatible (default 6 for old callers)
    const pageSize = Math.min(parseInt(pageSizeParam) || 6, 50);
    const page = parseInt(pageParam) || 0;

    logger.info(`[ElevenLabs] Fetching voices: lang=${normalizedLanguage}, gender=${gender || 'all'}, search=${search || ''}, page=${page}, page_size=${pageSize}`);

    // Build query params for shared-voices API
    const queryParams = new URLSearchParams();
    queryParams.set('page_size', String(pageSize));
    queryParams.set('page', String(page));
    queryParams.set('language', normalizedLanguage);

    if (gender && gender !== 'all') {
      queryParams.set('gender', gender);
    }
    if (search) {
      queryParams.set('search', search);
    }
    if (use_case) {
      queryParams.set('use_case', use_case);
    }

    // Use shared-voices (Voice Library) instead of /v1/voices (own voices only)
    const apiUrl = `https://api.elevenlabs.io/v1/shared-voices?${queryParams.toString()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 401 || response.status === 403) {
        // Paywall / free-tier limitation - fallback silently
        logger.info(`[ElevenLabs] Shared voices unavailable (${response.status}), using own voices fallback`);
      } else {
        // Other errors (500, network) - log and fallback
        logger.error('[ElevenLabs] Shared voices API error:', response.status, errorText);
      }

      return await fallbackToOwnVoices(req, res, targetLanguage, normalizedLanguage, country, pageSize);
    }

    const data = await response.json();
    const voices = data.voices || [];
    const hasMore = voices.length === pageSize;

    logger.info(`[ElevenLabs] Shared library returned ${voices.length} voices (hasMore: ${hasMore})`);

    // Build preview phrase
    const previewPhrase = PREVIEW_PHRASES[normalizedLanguage] || PREVIEW_PHRASES['en'];

    // Map shared-voices response to our voice format
    const voicesWithPhrases = voices.map(voice => ({
      id: voice.voice_id,
      name: voice.name,
      description: voice.description || '',
      language: normalizedLanguage,
      gender: voice.gender || 'neutral',
      accent: voice.accent || null,
      age: voice.age || null,
      use_case: voice.use_case || null,
      category: voice.category || 'shared',
      preview_url: voice.preview_url || null,
      preview_phrase: previewPhrase,
    }));

    return res.status(200).json({
      success: true,
      data: {
        voices: voicesWithPhrases,
        language: targetLanguage,
        country: country || null,
        total_count: voicesWithPhrases.length,
        returned_count: voicesWithPhrases.length,
        has_more: hasMore,
        page: page,
        page_size: pageSize,
        source: 'shared_library'
      }
    });

  } catch (error) {
    logger.error('[ElevenLabs] Error fetching voices:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch voices'
    });
  }
};

/**
 * Fallback to the own voices API (/v1/voices) if shared-voices is unavailable.
 * This preserves backward compatibility with the original implementation.
 */
async function fallbackToOwnVoices(req, res, targetLanguage, normalizedLanguage, country, pageSize) {
  const ELEVENLABS_LANGUAGE_MAP = {
    'en': ['en', 'en-US', 'en-GB', 'en-AU'],
    'es': ['es', 'es-ES', 'es-MX', 'es-AR'],
    'fr': ['fr', 'fr-FR', 'fr-CA'],
    'de': ['de', 'de-DE'],
    'it': ['it', 'it-IT'],
    'pt': ['pt', 'pt-BR', 'pt-PT'],
    'zh': ['zh', 'zh-CN'],
    'ja': ['ja', 'ja-JP'],
    'ko': ['ko', 'ko-KR'],
    'nl': ['nl', 'nl-NL'],
    'pl': ['pl', 'pl-PL'],
    'ru': ['ru', 'ru-RU'],
    'sv': ['sv', 'sv-SE'],
    'tr': ['tr', 'tr-TR'],
    'hi': ['hi', 'hi-IN']
  };

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'GET',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    return res.status(response.status).json({
      success: false,
      error: `ElevenLabs API error: ${response.status} ${errorText}`
    });
  }

  const data = await response.json();
  const voices = data.voices || [];
  const languageCodes = ELEVENLABS_LANGUAGE_MAP[normalizedLanguage] || [normalizedLanguage];

  let filteredVoices = voices.filter(voice => {
    const voiceLanguage = voice.fine_tuning?.language || voice.labels?.language || '';
    const isMultilingual = voice.labels?.use_case === 'conversational' || voice.fine_tuning?.is_allowed_to_fine_tune;
    return languageCodes.some(code =>
      voiceLanguage.toLowerCase().startsWith(code.toLowerCase())
    ) || (isMultilingual && normalizedLanguage === 'en');
  });

  if (filteredVoices.length === 0) {
    filteredVoices = voices.filter(voice =>
      voice.category === 'premade' || voice.category === 'professional'
    );
  }

  const sortedVoices = filteredVoices.sort((a, b) => {
    const categoryOrder = { 'premade': 0, 'professional': 1, 'cloned': 2, 'generated': 3 };
    return (categoryOrder[a.category] || 4) - (categoryOrder[b.category] || 4);
  });

  const voicesToReturn = sortedVoices.slice(0, pageSize);
  const previewPhrase = PREVIEW_PHRASES[normalizedLanguage] || PREVIEW_PHRASES['en'];

  const voicesWithPhrases = voicesToReturn.map(voice => ({
    id: voice.voice_id,
    name: voice.name,
    description: voice.description || voice.labels?.description || '',
    language: targetLanguage,
    gender: voice.labels?.gender || 'neutral',
    accent: voice.labels?.accent || null,
    age: null,
    use_case: voice.labels?.use_case || null,
    category: voice.category,
    preview_url: voice.preview_url || null,
    preview_phrase: previewPhrase,
  }));

  return res.status(200).json({
    success: true,
    data: {
      voices: voicesWithPhrases,
      language: targetLanguage,
      country: country || null,
      total_count: filteredVoices.length,
      returned_count: voicesWithPhrases.length,
      has_more: false,
      page: 0,
      page_size: pageSize,
      source: 'own_voices_fallback'
    }
  });
}
