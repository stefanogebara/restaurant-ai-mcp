/**
 * POST /api/onboarding/complete
 *
 * Completes the entire restaurant onboarding process:
 * 1. Updates restaurant_info table with restaurant configuration
 * 2. Creates tables in the tables table
 * 3. Returns success response
 *
 * NOTE: Migrated from Airtable multi-restaurant architecture to
 * Supabase single-restaurant architecture (Nov 2025)
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { suggestTimezone } = require('../_lib/timezone');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const logger = createSecureLogger('Onboarding');

// ============ Voice Defaults ============

/**
 * Fallback ElevenLabs voice ID used when no voice is selected during onboarding.
 * Rachel (English) — ElevenLabs built-in voice available on all plans.
 * Override via ELEVENLABS_DEFAULT_VOICE_ID environment variable.
 */
const ELEVENLABS_DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/**
 * Returns a language-appropriate default ElevenLabs voice ID.
 * Language-specific overrides can be set via ELEVENLABS_VOICE_ID_ES / _PT env vars.
 * Falls back to ELEVENLABS_DEFAULT_VOICE_ID when no language-specific override exists.
 */
const DEFAULT_VOICE_IDS = {
  'en': ELEVENLABS_DEFAULT_VOICE_ID,
  'es': process.env.ELEVENLABS_VOICE_ID_ES || ELEVENLABS_DEFAULT_VOICE_ID,
  'pt': process.env.ELEVENLABS_VOICE_ID_PT || ELEVENLABS_DEFAULT_VOICE_ID,
};

function getDefaultVoiceId(language) {
  return DEFAULT_VOICE_IDS[language] || DEFAULT_VOICE_IDS['en'];
}

// ============ Country + Language Inference ============

// The onboarding form submits country as a display name ("Brazil", "Spain"), not
// an ISO code. Downstream helpers like suggestTimezone() only recognise ISO
// codes — without this mapping timezone silently falls back to UTC and
// agent_language stays 'en' for every non-US restaurant.
const COUNTRY_NAME_TO_ISO = {
  brazil: 'BR', brasil: 'BR',
  spain: 'ES', espana: 'ES', 'españa': 'ES',
  portugal: 'PT',
  france: 'FR',
  italy: 'IT', italia: 'IT',
  germany: 'DE', deutschland: 'DE',
  'united kingdom': 'GB', uk: 'GB',
  'united states': 'US', usa: 'US',
  canada: 'CA',
  mexico: 'MX', 'méxico': 'MX',
  argentina: 'AR', colombia: 'CO', chile: 'CL', peru: 'PE',
  japan: 'JP', australia: 'AU',
};
const COUNTRY_LANGUAGE_MAP = {
  BR: 'pt', PT: 'pt', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
  FR: 'fr', IT: 'it', DE: 'de', JP: 'ja', US: 'en', GB: 'en', CA: 'en', AU: 'en',
};
const PHONE_PREFIX_TO_ISO = [
  ['+351', 'PT'], ['+54', 'AR'], ['+55', 'BR'], ['+56', 'CL'], ['+57', 'CO'],
  ['+52', 'MX'], ['+51', 'PE'], ['+34', 'ES'], ['+33', 'FR'], ['+39', 'IT'],
  ['+49', 'DE'], ['+44', 'GB'], ['+81', 'JP'], ['+61', 'AU'], ['+1', 'US'],
];

function countryFromPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return null;
  for (const [p, iso] of PHONE_PREFIX_TO_ISO) if (digits.startsWith(p)) return iso;
  return null;
}

function resolveCountryIso(countryInput, phone) {
  if (!countryInput) return countryFromPhone(phone);
  const s = String(countryInput).trim();
  if (/^[A-Z]{2}$/.test(s)) return s;                   // already ISO
  const iso = COUNTRY_NAME_TO_ISO[s.toLowerCase()];
  return iso || countryFromPhone(phone);
}

// DB enum restaurant.restaurant_type_enum accepts only this whitelist (as of
// 2026-04 — observed by querying existing rows). The onboarding form surfaces
// more user-friendly options (Pizzaria, Bar, Café…) that the enum doesn't
// accept. Anything outside the whitelist is folded into 'other' rather than
// silently failing the insert.
const VALID_CONFIG_RESTAURANT_TYPES = new Set([
  'casual_dining', 'fine_dining', 'italian', 'japanese', 'mexican', 'steakhouse', 'other',
]);

// ============ Slug Generation ============

/**
 * Generate a URL-friendly slug from a restaurant name.
 * Handles accented characters, special chars, and trims to 50 chars.
 * @param {string} name - Restaurant name
 * @returns {string} URL-safe slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')            // Collapse consecutive hyphens
    .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
    .slice(0, 50);
}

/**
 * Generate a unique slug for a restaurant, checking against existing slugs.
 * If a collision is found, appends a random 4-digit suffix.
 * @param {string} name - Restaurant name
 * @param {object} supabaseClient - Supabase client instance
 * @returns {Promise<string>} Unique slug
 */
async function generateUniqueSlug(name, supabaseClient) {
  const baseSlug = generateSlug(name);

  // Check if this slug already exists (restaurant_config is in 'restaurant' schema)
  const { data: existing } = await supabaseClient
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('slug', baseSlug)
    .limit(1);

  if (!existing || existing.length === 0) {
    return baseSlug;
  }

  // Collision detected: append cryptographically random 4-digit suffix
  const suffix = (crypto.randomBytes(2).readUInt16BE(0) % 9000) + 1000; // 1000-9999
  const slugWithSuffix = `${baseSlug.slice(0, 45)}-${suffix}`;

  // Verify the suffixed slug is also unique (extremely unlikely collision but safe)
  const { data: existingWithSuffix } = await supabaseClient
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('slug', slugWithSuffix)
    .limit(1);

  if (!existingWithSuffix || existingWithSuffix.length === 0) {
    return slugWithSuffix;
  }

  // Last resort: add timestamp fragment
  return `${baseSlug.slice(0, 40)}-${Date.now().toString(36).slice(-6)}`;
}

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'onboarding_complete', 10, 60);
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const {
      customer_email,
      restaurant_id,
      restaurant_name,
      restaurant_type,
      city,
      country,
      phone_number,
      email,
      website,
      business_hours,
      average_dining_duration,
      areas,
      advance_booking_days,
      buffer_time,
      cancellation_policy,
      special_notes,
      team_members,
      plan, // Subscription plan from Stripe
      selected_voice_id, // Voice selection from Step 2.5
      selected_voice_language, // Language code from selected voice (e.g., 'es', 'fr', 'en')
      restaurant_learning, // AI restaurant learning data (session_id, restaurant_profile)
    } = req.body;

    // Validate required fields
    if (!customer_email || !restaurant_name || !phone_number || !email) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customer_email', 'restaurant_name', 'phone_number', 'email'],
      });
    }

    logger.info(' Starting onboarding for:', customer_email);
    logger.info(' Restaurant:', restaurant_name);

    // Validate and sanitize business_hours
    const HH_MM_REGEX = /^\d{2}:\d{2}$/;
    let validatedBusinessHours = Array.isArray(business_hours) ? business_hours : [];

    // Validate time format for each day
    validatedBusinessHours = validatedBusinessHours.map(day => ({
      ...day,
      open_time: HH_MM_REGEX.test(day.open_time) ? day.open_time : '11:00',
      close_time: HH_MM_REGEX.test(day.close_time) ? day.close_time : '22:00',
    }));

    // Check if at least one day has valid open/close times
    const hasAnyOpenDay = validatedBusinessHours.some(
      day => day.is_open && day.open_time && day.close_time
    );

    if (!hasAnyOpenDay) {
      logger.warn(' No open days in business_hours — applying default schedule (Mon-Sat 11:00-22:00)');
      const defaultDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      validatedBusinessHours = defaultDays.map(day => ({
        day,
        is_open: day !== 'Sunday',
        open_time: '11:00',
        close_time: '22:00',
      }));
    }

    // Generate Restaurant ID
    const generatedRestaurantId = restaurant_id || `REST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Validate restaurant_type against allowed values
    // Must include all slugified types sent by the frontend (Step1Welcome.tsx)
    const ALLOWED_RESTAURANT_TYPES = [
      'traditional', 'modern', 'fast-casual', 'fine-dining',
      'casual-dining', 'cafe', 'bar', 'bistro',
      'pizzeria', 'steakhouse', 'seafood', 'other',
    ];
    const validatedRestaurantType = ALLOWED_RESTAURANT_TYPES.includes(restaurant_type)
      ? restaurant_type
      : null;  // Set to null if invalid value provided

    if (restaurant_type && !validatedRestaurantType) {
      logger.warn(` Invalid restaurant_type "${restaurant_type}". Must be one of: ${ALLOWED_RESTAURANT_TYPES.join(', ')}. Setting to null.`);
    }

    // Resolve ISO country code + language. The form submits the country name
    // ("Brazil"), not the ISO code; without this, timezone falls back to UTC
    // and agent_language stays 'en' regardless of where the restaurant is.
    const resolvedCountryIso = resolveCountryIso(country, phone_number);
    const resolvedLanguage = COUNTRY_LANGUAGE_MAP[resolvedCountryIso] || 'en';
    const resolvedTimezone = suggestTimezone(resolvedCountryIso || country, city);

    // STEP 1: Update restaurant_info table
    logger.info(' Step 1: Updating restaurant_info...');

    // Map onboarding fields to actual database schema
    const restaurantInfoData = {
      restaurant_name,
      phone: phone_number,  // Schema uses 'phone' not 'phone_number'
      email: email,
      address: `${city}, ${country}`,
      business_hours: validatedBusinessHours,
      avg_dining_duration_minutes: average_dining_duration || 90,  // Schema uses this name
      timezone: resolvedTimezone,
      language: resolvedLanguage,
      // Store additional metadata in metric_profile JSON field
      // Template is auto-derived from subscription plan:
      // - Basic/Free → simple template
      // - Professional/Pro → advanced template
      metric_profile: {
        customer_email,
        restaurant_id: generatedRestaurantId,
        restaurant_type: validatedRestaurantType,  // Use validated value
        city,
        country,
        plan: plan || 'Starter',
        template: (plan === 'growth' || plan === 'Growth' || plan === 'scale' || plan === 'Scale') ? 'advanced' : 'simple',
        website: website || '',
        cancellation_policy: cancellation_policy || 'Cancelamento gratuito até 2 horas antes da reserva',
        special_notes: special_notes || '',
        advance_booking_days: advance_booking_days || 30,
        buffer_time: buffer_time || 15,
        onboarding_completed_at: new Date().toISOString()
      }
    };

    // Check if restaurant_info record exists (lives in 'restaurant' schema)
    const { data: existingInfo, error: fetchError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .select('id')
      .limit(1)
      .single();

    let restaurantInfoResult;
    if (existingInfo) {
      // Update existing record
      const { data, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_info')
        .update(restaurantInfoData)
        .eq('id', existingInfo.id)
        .select()
        .single();

      if (error) throw error;
      restaurantInfoResult = data;
      logger.info(' Restaurant info updated');
    } else {
      // Insert new record
      const { data, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_info')
        .insert(restaurantInfoData)
        .select()
        .single();

      if (error) throw error;
      restaurantInfoResult = data;
      logger.info(' Restaurant info created');
    }

    // STEP 2: Create Tables
    logger.info(' Step 2: Creating tables...');

    // First, delete existing tables FOR THIS RESTAURANT ONLY
    const { error: deleteError } = await supabaseAdmin
      .from('tables')
      .delete()
      .eq('restaurant_id', restaurantInfoResult.id);

    if (deleteError) {
      logger.warn(' Warning: Could not delete existing tables:', deleteError);
    } else {
      logger.info(` Cleared existing tables for restaurant ${restaurantInfoResult.id}`);
    }

    // Create new tables from areas configuration
    let tableNumber = 1;
    const tablesToInsert = [];

    for (const area of areas || []) {
      for (const tableConfig of area.tables || []) {
        for (let i = 0; i < tableConfig.count; i++) {
          tablesToInsert.push({
            restaurant_id: restaurantInfoResult.id,
            table_number: tableNumber,
            capacity: tableConfig.capacity,
            location: area.name,
            status: 'available',  // Must be lowercase to match database enum
            is_active: true,
            current_service_id: null,
            is_fixed: tableConfig.is_fixed || false,  // Flexible table support
            shape: tableConfig.shape || 'square',  // Table shape from onboarding
            is_joinable: tableConfig.is_joinable !== false,  // Default to joinable
            is_fixed_seating: tableConfig.is_fixed_seating || false
          });
          tableNumber++;
        }
      }
    }

    if (tablesToInsert.length === 0) {
      logger.warn(' No tables provided in onboarding — creating 4 default tables');
      for (let i = 1; i <= 4; i++) {
        tablesToInsert.push({
          restaurant_id: restaurantInfoResult.id,
          table_number: i,
          capacity: 4,
          location: 'Main',
          status: 'available',
          is_active: true,
          current_service_id: null,
          is_fixed: false,
          shape: 'square',
          is_joinable: true,
          is_fixed_seating: false
        });
      }
    }

    const { data: tablesData, error: tablesError } = await supabaseAdmin
      .from('tables')
      .insert(tablesToInsert)
      .select();

    if (tablesError) throw tablesError;
    logger.info(` Created ${tablesData.length} tables`);

    // STEP 3: Create/Update Restaurant Config (for AI Agent)
    logger.info(' Step 3: Creating restaurant_config for AI agent...');

    // Get user ID from the verified auth token (already available, no lookup needed)
    let userId = auth.user?.sub || null;
    if (userId) {
      logger.info(' User ID from auth token:', userId);
    } else {
      logger.warn(' No user ID in auth token, restaurant_config will not be saved');
    }

    // Prepare table configuration for restaurant_config
    const tableConfiguration = areas.map(area => ({
      area_name: area.name,
      tables: []
    }));

    // Build table numbers array for each area
    let currentTableNum = 1;
    for (const area of areas) {
      const areaConfig = tableConfiguration.find(a => a.area_name === area.name);
      for (const tableConfig of area.tables) {
        for (let i = 0; i < tableConfig.count; i++) {
          areaConfig.tables.push({
            table_number: String(currentTableNum),
            capacity: tableConfig.capacity
          });
          currentTableNum++;
        }
      }
    }

    // Map restaurant_type slug to restaurant_config enum value
    const typeMapping = {
      'traditional': 'casual_dining',
      'modern': 'fine_dining',
      'fast-casual': 'fast_casual',
      'fine-dining': 'fine_dining',
      'casual-dining': 'casual_dining',
      'italian': 'italian',
      'japanese': 'japanese',
      'mexican': 'mexican',
      'steakhouse': 'steakhouse',
      'cafe': 'cafe',
      'bar': 'bar',
      'bistro': 'bistro',
      'pizzeria': 'pizzeria',
      'seafood': 'seafood',
      'other': 'other',
    };
    // Fold anything outside the DB enum whitelist into 'other'. Previously
    // onboarding submitted types like 'pizzeria' or 'cafe' that typeMapping
    // passed through unchanged, which blew up with
    //   22P02: invalid input value for enum restaurant_type
    // inside a silent try/catch — leaving the user without a restaurant_config
    // row and a broken dashboard.
    const preferredType = typeMapping[restaurant_type] || 'other';
    const mappedType = VALID_CONFIG_RESTAURANT_TYPES.has(preferredType) ? preferredType : 'other';
    if (preferredType !== mappedType) {
      logger.warn(`restaurant_type "${preferredType}" not in DB enum; using 'other'`);
    }

    // Language code to locale mapping (e.g., 'es' → 'es-ES')
    const languageToLocale = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'pl': 'pl-PL',
      'tr': 'tr-TR',
      'ru': 'ru-RU',
      'nl': 'nl-NL',
      'sv': 'sv-SE',
      'da': 'da-DK',
      'no': 'no-NO',
      'fi': 'fi-FI',
      'ja': 'ja-JP'
    };

    // Multilingual greeting messages
    const greetingMessages = {
      'en': `Thank you for calling ${restaurant_name}! How may I assist you today?`,
      'es': `¡Gracias por llamar a ${restaurant_name}! ¿Cómo puedo ayudarle hoy?`,
      'fr': `Merci d'appeler ${restaurant_name}! Comment puis-je vous aider aujourd'hui?`,
      'de': `Vielen Dank für Ihren Anruf bei ${restaurant_name}! Wie kann ich Ihnen heute helfen?`,
      'it': `Grazie per aver chiamato ${restaurant_name}! Come posso aiutarla oggi?`,
      'pt': `Obrigado por ligar para ${restaurant_name}! Como posso ajudá-lo hoje?`,
      'pl': `Dziękujemy za telefon do ${restaurant_name}! Jak mogę Ci dzisiaj pomóc?`,
      'tr': `${restaurant_name}'i aradığınız için teşekkür ederiz! Bugün size nasıl yardımcı olabilirim?`,
      'ru': `Спасибо, что позвонили в ${restaurant_name}! Чем я могу вам помочь сегодня?`,
      'nl': `Bedankt voor het bellen naar ${restaurant_name}! Hoe kan ik u vandaag helpen?`,
      'sv': `Tack för att du ringer ${restaurant_name}! Hur kan jag hjälpa dig idag?`,
      'da': `Tak fordi du ringer til ${restaurant_name}! Hvordan kan jeg hjælpe dig i dag?`,
      'no': `Takk for at du ringer ${restaurant_name}! Hvordan kan jeg hjelpe deg i dag?`,
      'fi': `Kiitos kun soitit ${restaurant_name}! Kuinka voin auttaa sinua tänään?`,
      'ja': `${restaurant_name}にお電話いただきありがとうございます！本日はどのようにお手伝いできますか？`
    };

    // Multilingual farewell messages
    const farewellMessages = {
      'en': 'Thank you for calling. Have a great day!',
      'es': '¡Gracias por llamar. Que tenga un gran día!',
      'fr': 'Merci d\'avoir appelé. Passez une excellente journée!',
      'de': 'Vielen Dank für Ihren Anruf. Haben Sie einen schönen Tag!',
      'it': 'Grazie per aver chiamato. Buona giornata!',
      'pt': 'Obrigado por ligar. Tenha um ótimo dia!',
      'pl': 'Dziękujemy za telefon. Miłego dnia!',
      'tr': 'Aradığınız için teşekkür ederiz. İyi günler!',
      'ru': 'Спасибо за звонок. Хорошего дня!',
      'nl': 'Bedankt voor het bellen. Fijne dag nog!',
      'sv': 'Tack för att du ringde. Ha en bra dag!',
      'da': 'Tak for dit opkald. Ha en god dag!',
      'no': 'Takk for at du ringte. Ha en fin dag!',
      'fi': 'Kiitos soitosta. Mukavaa päivänjatkoa!',
      'ja': 'お電話ありがとうございました。良い一日をお過ごしください！'
    };

    // Get language-specific messages
    const voiceLanguage = selected_voice_language || resolvedLanguage || 'en';
    const locale = languageToLocale[voiceLanguage] || 'en-US';
    const greetingMessage = greetingMessages[voiceLanguage] || greetingMessages['en'];
    const farewellMessage = farewellMessages[voiceLanguage] || farewellMessages['en'];

    // STEP 3a: Generate unique slug for public booking URL
    logger.info(' Step 3a: Generating booking slug...');
    const restaurantSlug = await generateUniqueSlug(restaurant_name, supabaseAdmin);
    logger.info(` Slug generated: ${restaurantSlug}`);

    // Prepare restaurant_config data
    const restaurantConfigData = {
      restaurant_name,
      restaurant_type: mappedType,
      slug: restaurantSlug,
      city,
      // Store ISO country code on the config row so downstream consumers
      // (timezone, weekly-report day filter, etc.) get the same answer here
      // as from restaurant_info. Fall back to the raw form value if we
      // couldn't resolve.
      country: resolvedCountryIso || country,
      agent_language: resolvedLanguage,
      email: email || customer_email,
      phone: phone_number,
      website: website || null,
      voice_id: selected_voice_id || 'default',
      business_hours: validatedBusinessHours.reduce((acc, day) => {
        acc[day.day.toLowerCase()] = {
          is_open: day.is_open,
          open_time: day.open_time,
          close_time: day.close_time
        };
        return acc;
      }, {}),
      table_configuration: tableConfiguration,
      reservation_settings: {
        advance_booking_days: advance_booking_days || 30,
        buffer_time_minutes: buffer_time || 15,
        cancellation_policy: cancellation_policy || 'Cancelamento gratuito até 2 horas antes da reserva',
        special_notes: special_notes || '',
        max_party_size: 12,
        min_party_size: 1,
        require_credit_card: false,
        allow_waitlist: true
      },
      average_dining_duration_minutes: average_dining_duration || 90,
      timezone: resolvedTimezone,
      max_concurrent_reservations: 50,
      team_members: (team_members || []).map(tm => ({
        email: tm.email,
        role: tm.role.toLowerCase(),
        status: tm.status || 'pending'
      })),
      ai_config: {
        greeting_message: greetingMessage,
        farewell_message: farewellMessage,
        language: locale,
        enable_voicemail: false,
        max_call_duration_minutes: 10,
        transfer_phone: phone_number
      },
      is_active: true,
      onboarding_completed: true,
      ...(restaurant_learning?.restaurant_profile ? {
        restaurant_profile: restaurant_learning.restaurant_profile
      } : {}),
    };

    // If we have a user_id, add it; otherwise use service role to insert
    if (userId) {
      restaurantConfigData.user_id = userId;
    }

    let configResult;
    try {
      // Check if config already exists for this user
      if (userId) {
        const { data: existingConfig } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('id, user_id')
          .eq('user_id', userId)
          .single();

        if (existingConfig) {
          // Update existing config
          const { data, error } = await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .update(restaurantConfigData)
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw error;
          configResult = data;
          logger.info(' Restaurant config updated');
        } else {
          // Insert new config
          const { data, error } = await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .insert(restaurantConfigData)
            .select()
            .single();

          if (error) throw error;
          configResult = data;
          logger.info(' Restaurant config created');
        }
      } else {
        // No user_id, skip restaurant_config creation
        logger.info(' Skipping restaurant_config creation (no user_id)');
      }
      // STEP 3b: Update tables to use restaurant_config.id as restaurant_id
      // The dashboard resolves restaurant_id from restaurant_config, so tables must match
      if (configResult && configResult.id !== restaurantInfoResult.id) {
        logger.info(' Step 3b: Aligning tables restaurant_id with config id...');
        const { error: alignError } = await supabaseAdmin
          .from('tables')
          .update({ restaurant_id: configResult.id })
          .eq('restaurant_id', restaurantInfoResult.id);

        if (alignError) {
          logger.warn(' Could not align table restaurant_ids:', alignError);
        } else {
          logger.info(` Tables aligned to config id: ${configResult.id}`);
        }
      }
    } catch (configError) {
      logger.error(' Error saving restaurant_config:', {
        message: configError?.message,
        code: configError?.code,
        details: configError?.details,
      });
      // Roll back the half-created restaurant so the user isn't stranded with
      // a dashboard-less account. Without this, the previous implementation
      // returned 200 OK while the user's dashboard / AI agent / WhatsApp
      // router were all invisible to them.
      try {
        await supabaseAdmin.from('tables').delete().eq('restaurant_id', restaurantInfoResult.id);
        await supabaseAdmin.schema('restaurant').from('restaurant_info').delete().eq('id', restaurantInfoResult.id);
        logger.info(' Rolled back restaurant_info + tables after config failure');
      } catch (rollbackErr) {
        logger.warn(' Rollback failed (leaving orphaned rows):', rollbackErr.message);
      }
      return res.status(500).json({
        success: false,
        error: 'restaurant_config_insert_failed',
        message: configError?.message || 'Could not save restaurant configuration. Please try again.',
      });
    }


    // Invalidate SEO city+cuisine cache so the page rebuilds with this restaurant included
    try {
      const { slugify } = require('../_lib/seo-html');
      const cityKey = slugify(city || '');
      const cuisineKey = slugify(validatedRestaurantType || restaurant_type || '');
      if (cityKey && cuisineKey) {
        await supabaseAdmin
          .from('seo_page_cache')
          .delete()
          .eq('cache_key', `city:${cityKey}:${cuisineKey}`);
        logger.info('SEO cache invalidated', { cityKey, cuisineKey });
      }
    } catch (seoErr) {
      // Non-critical — log and continue. Onboarding is not affected.
      logger.warn('SEO cache invalidation failed (non-critical)', { err: seoErr.message });
    }

    // STEP 4: Create ElevenLabs Agent
    // Uses the service directly (no HTTP call) to bypass subscription guards.
    // During onboarding the subscription doesn't exist yet, and the agent should
    // be provisioned for ALL plans — voice settings UI is gated separately.
    logger.info(' Step 4: Creating ElevenLabs agent...');
    logger.info(' Voice config:', {
      selected_voice_id,
      selected_voice_language,
      restaurant_name
    });

    // Transform business_hours array to object format for agent service
    // From: [{ day: "Monday", is_open: true, open_time: "12:00", close_time: "23:00" }]
    // To: { monday: { isOpen: true, open: "12:00", close: "23:00" } }
    const agentBusinessHours = {};
    if (Array.isArray(validatedBusinessHours)) {
      validatedBusinessHours.forEach(dayConfig => {
        const dayKey = dayConfig.day.toLowerCase();
        agentBusinessHours[dayKey] = {
          isOpen: dayConfig.is_open,
          open: dayConfig.open_time,
          close: dayConfig.close_time
        };
      });
    }

    // Use the correct restaurant_config UUID (not the generated REST-xxx string)
    const canonicalRestaurantId = configResult?.id || null;

    let agentId = null;
    try {
      const { createAgent, syncKnowledgeBase } = require('../services/elevenlabsAgentService');

      const agentResult = await createAgent({
        restaurantId: canonicalRestaurantId,
        restaurant_name,
        voice_id: selected_voice_id || getDefaultVoiceId(selected_voice_language),
        language: selected_voice_language || 'en',
        business_hours: agentBusinessHours,
        phone: phone_number,
        address: `${city}, ${country}`
      });

      if (agentResult.success) {
        agentId = agentResult.agent_id;

        // Update restaurant_info with agent details
        const voiceIdToSave = selected_voice_id || getDefaultVoiceId(selected_voice_language);
        await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_info')
          .update({
            elevenlabs_agent_id: agentId,
            agent_voice_id: voiceIdToSave,
            agent_language: selected_voice_language || 'en',
            agent_created_at: new Date().toISOString()
          })
          .eq('id', restaurantInfoResult.id);

        // Also save agent_id to restaurant_config for webhook routing
        if (canonicalRestaurantId) {
          await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .update({
              elevenlabs_agent_id: agentId,
              agent_language: selected_voice_language || 'en'
            })
            .eq('id', canonicalRestaurantId);

          logger.info(' Agent saved to restaurant_config');
        }

        logger.info(' ElevenLabs agent created:', agentId);
        logger.info(' Agent URL: https://elevenlabs.io/app/conversational-ai/' + agentId);

        // Step 4b: Sync knowledge base to ElevenLabs agent (fire-and-forget)
        if (canonicalRestaurantId) {
          syncKnowledgeBase(canonicalRestaurantId).then(result => {
            if (result.success) {
              logger.info('KB synced to ElevenLabs agent', { documentId: result.documentId });
            } else {
              logger.warn('KB sync skipped or failed:', result.error);
            }
          }).catch(err => logger.error('KB sync error:', err.message));
        }
      } else {
        logger.error(' Failed to create agent:', {
          error: agentResult.error,
          details: agentResult.details
        });
      }
    } catch (agentError) {
      logger.error(' Error creating ElevenLabs agent:', {
        message: agentError.message,
        stack: agentError.stack
      });
      logger.warn(' Continuing without agent creation');
    }

    // STEP 5: Create subscription (Brazil gets free plan; all others get 14-day Growth trial)
    logger.info(' Step 5: Creating subscription...');

    const isBrazil = country && country.toLowerCase().includes('brazil') || country && country.toLowerCase() === 'brasil';

    let trialSubscription = null;
    try {
      const now = new Date();
      const canonicalRestaurantId = configResult?.id || restaurantInfoResult.id;

      let subscriptionData;
      if (isBrazil) {
        // Brazil: permanent free plan with far-future expiry
        const farFuture = new Date('2099-12-31T23:59:59.000Z');
        subscriptionData = {
          restaurant_id: canonicalRestaurantId,
          subscription_id: `free_${canonicalRestaurantId}`,
          customer_id: userId || `user_${Date.now()}`,
          customer_email: customer_email,
          plan_name: 'Free',
          price_id: 'free',
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: farFuture.toISOString(),
          trial_end: null
        };
      } else {
        // All other countries: 14-day Growth trial
        const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        subscriptionData = {
          restaurant_id: canonicalRestaurantId,
          subscription_id: `trial_${canonicalRestaurantId}`,
          customer_id: userId || `user_${Date.now()}`,
          customer_email: customer_email,
          plan_name: plan || 'Growth',
          price_id: 'trial',
          status: 'trialing',
          current_period_start: now.toISOString(),
          current_period_end: trialEnd.toISOString(),
          trial_end: trialEnd.toISOString()
        };
      }

      const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (subError) {
        logger.warn(' Could not create subscription:', subError.message);
      } else {
        trialSubscription = subData;
        logger.info(' Subscription created:', subscriptionData.plan_name, isBrazil ? '(free/Brazil)' : '(trial)');
      }
    } catch (trialError) {
      logger.warn(' Subscription creation error (non-fatal):', trialError.message);
    }

    logger.info(' Onboarding complete!');

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      restaurant: {
        restaurant_id: canonicalRestaurantId,
        restaurant_name,
        slug: restaurantSlug,
        booking_url: `/book/${restaurantSlug}`,
        record_id: restaurantInfoResult.id,
        tables_created: tablesToInsert.length,
        ai_config_saved: !!userId,
        trial_active: !!trialSubscription,
        trial_end: trialSubscription?.trial_end || null
      },
    });
  } catch (error) {
    logger.error(' Error:', error);
    return res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error.message,
      details: error.details || error.hint || 'Unknown error'
    });
  }
};
