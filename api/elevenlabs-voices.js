/**
 * ElevenLabs Voices API - Vercel Serverless Function
 * GET /api/elevenlabs-voices
 * Fetches available voices from ElevenLabs, filtered by language based on country
 */

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

  // Portuguese-speaking countries - Portugal gets European Portuguese
  'Portugal': 'pt-PT',
  'Brazil': 'pt-BR',

  // Other languages
  'China': 'zh', 'Japan': 'ja',
  'Korea': 'ko', 'South Korea': 'ko',
  'Netherlands': 'nl', 'Poland': 'pl',
  'Russia': 'ru', 'Sweden': 'sv',
  'Turkey': 'tr', 'India': 'hi'
};

// CURATED VOICE LISTS - High-quality voices for each language/region
// These are hand-picked ElevenLabs voices that sound professional and native
const CURATED_VOICES = {
  // Spanish (Spain) - Use dynamic API filtering for Castilian voices
  'es-ES': null,

  // Portuguese (Portugal) - Use dynamic API filtering for Brazilian voices
  'pt-PT': null,

  // Portuguese (Brazil) - Use dynamic API filtering
  'pt-BR': null,

  // Spanish (Latin America) - Will use API filtering
  'es-LATAM': null
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

// ElevenLabs language codes mapping
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
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('[ElevenLabs] ELEVENLABS_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    // Determine language from country or use explicit language
    let targetLanguage = language || COUNTRY_LANGUAGE_MAP[country] || 'en';

    console.log(`[ElevenLabs] Fetching voices for language: ${targetLanguage} (country: ${country})`);

    // Check if we have curated voices for this language/region
    const curatedVoices = CURATED_VOICES[targetLanguage];
    if (curatedVoices && curatedVoices.length > 0) {
      console.log(`[ElevenLabs] Using ${curatedVoices.length} curated voices for ${targetLanguage}`);

      // Get the base language code for preview phrase (es-ES -> es, pt-PT -> pt)
      const baseLanguage = targetLanguage.split('-')[0];
      const previewPhrase = PREVIEW_PHRASES[baseLanguage] || PREVIEW_PHRASES['en'];

      const voicesWithPhrases = curatedVoices.map(voice => ({
        id: voice.id,
        name: voice.name,
        description: voice.description,
        language: targetLanguage,
        gender: voice.gender,
        preview_phrase: previewPhrase,
        preview_url: null,
        category: 'curated',
        is_multilingual: false
      }));

      return res.status(200).json({
        success: true,
        data: {
          voices: voicesWithPhrases,
          language: targetLanguage,
          country: country,
          total_count: voicesWithPhrases.length,
          returned_count: voicesWithPhrases.length,
          source: 'curated'
        }
      });
    }

    // For non-curated languages, normalize language code (es-LATAM -> es, pt-BR -> pt)
    const normalizedLanguage = targetLanguage.split('-')[0];

    // Fetch voices from ElevenLabs API
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ElevenLabs] API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: `ElevenLabs API error: ${response.status} ${errorText}`
      });
    }

    const data = await response.json();
    const voices = data.voices || [];
    console.log(`[ElevenLabs] Received ${voices.length} total voices`);

    // Get language codes to match (use normalized language for API filtering)
    const languageCodes = ELEVENLABS_LANGUAGE_MAP[normalizedLanguage] || [normalizedLanguage];

    // Filter voices by language
    // ElevenLabs voices have fine_tuning.language or labels.language
    let filteredVoices = voices.filter(voice => {
      // Check various places where language might be stored
      const voiceLanguage = voice.fine_tuning?.language ||
                           voice.labels?.language ||
                           '';

      // Also check if it's a multilingual voice (can be used for any language)
      const isMultilingual = voice.labels?.use_case === 'conversational' ||
                            voice.fine_tuning?.is_allowed_to_fine_tune;

      // Match if language matches or if it's a high-quality multilingual voice
      return languageCodes.some(code =>
        voiceLanguage.toLowerCase().startsWith(code.toLowerCase())
      ) || (isMultilingual && normalizedLanguage === 'en');
    });

    // Track if we're using fallback (multilingual) voices
    let usingMultilingualFallback = false;

    // If no language-specific voices found, return general high-quality voices
    if (filteredVoices.length === 0) {
      console.log(`[ElevenLabs] No voices found for ${targetLanguage}, returning multilingual voices`);
      usingMultilingualFallback = true;
      filteredVoices = voices.filter(voice =>
        voice.category === 'premade' || voice.category === 'professional'
      );
    }

    console.log(`[ElevenLabs] Filtered to ${filteredVoices.length} voices for language ${normalizedLanguage} (multilingual: ${usingMultilingualFallback})`);

    // Sort by quality/popularity and return top 6 voices
    const sortedVoices = filteredVoices.sort((a, b) => {
      // Prioritize premade and professional voices
      const categoryOrder = { 'premade': 0, 'professional': 1, 'cloned': 2, 'generated': 3 };
      return (categoryOrder[a.category] || 4) - (categoryOrder[b.category] || 4);
    });

    const voicesToReturn = sortedVoices.slice(0, 6);

    // Add preview phrase for each voice (use normalized language)
    const previewPhrase = PREVIEW_PHRASES[normalizedLanguage] || PREVIEW_PHRASES['en'];
    const voicesWithPhrases = voicesToReturn.map(voice => {
      // Get the voice's native language
      const nativeLanguage = voice.fine_tuning?.language || voice.labels?.language || '';

      // For multilingual fallback voices, use target language and note multilingual support
      let displayLanguage = targetLanguage;
      let description = voice.description || voice.labels?.description || '';

      if (usingMultilingualFallback && nativeLanguage && nativeLanguage.toLowerCase().startsWith('en')) {
        // Add multilingual note if not already present
        if (!description.toLowerCase().includes('multilingual')) {
          description = description ? `${description} (Multilingual voice)` : 'Multilingual voice - supports all languages';
        }
      } else if (nativeLanguage) {
        // Use native language if available and not in fallback mode
        displayLanguage = nativeLanguage;
      }

      return {
        id: voice.voice_id,
        name: voice.name,
        description: description,
        language: displayLanguage,
        gender: voice.labels?.gender || 'neutral',
        preview_phrase: previewPhrase,
        preview_url: voice.preview_url || null,
        category: voice.category,
        is_multilingual: usingMultilingualFallback
      };
    });

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
    console.error('[ElevenLabs] Error fetching voices:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch voices'
    });
  }
};
