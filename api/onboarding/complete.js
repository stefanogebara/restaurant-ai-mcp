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

const { supabaseAdmin } = require('../_lib/supabase');
const fetch = require('node-fetch');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { suggestTimezone } = require('../_lib/timezone');
const logger = createSecureLogger('Onboarding');

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

  // Collision detected: append random 4-digit suffix
  const suffix = Math.floor(1000 + Math.random() * 9000); // 1000-9999
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
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Generate Restaurant ID
    const generatedRestaurantId = restaurant_id || `REST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Validate restaurant_type against allowed values
    const ALLOWED_RESTAURANT_TYPES = ['traditional', 'modern', 'fast-casual', 'fine-dining'];
    const validatedRestaurantType = ALLOWED_RESTAURANT_TYPES.includes(restaurant_type)
      ? restaurant_type
      : null;  // Set to null if invalid value provided

    if (restaurant_type && !validatedRestaurantType) {
      logger.warn(` Invalid restaurant_type "${restaurant_type}". Must be one of: ${ALLOWED_RESTAURANT_TYPES.join(', ')}. Setting to null.`);
    }

    // STEP 1: Update restaurant_info table
    logger.info(' Step 1: Updating restaurant_info...');

    // Map onboarding fields to actual database schema
    const restaurantInfoData = {
      restaurant_name,
      phone: phone_number,  // Schema uses 'phone' not 'phone_number'
      email: email,
      address: `${city}, ${country}`,
      business_hours: business_hours || [],
      avg_dining_duration_minutes: average_dining_duration || 90,  // Schema uses this name
      timezone: suggestTimezone(country, city),
      language: 'en',
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
        cancellation_policy: cancellation_policy || 'Free cancellation up to 2 hours before reservation',
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
      .select('*')
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

    // First, delete all existing tables (onboarding resets the restaurant)
    const { error: deleteError } = await supabaseAdmin
      .from('tables')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');  // Delete all (using impossible UUID)

    if (deleteError) {
      logger.warn(' Warning: Could not delete existing tables:', deleteError);
    } else {
      logger.info(' Cleared all existing tables');
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

    if (tablesToInsert.length > 0) {
      const { data: tablesData, error: tablesError } = await supabaseAdmin
        .from('tables')
        .insert(tablesToInsert)
        .select();

      if (tablesError) throw tablesError;
      logger.info(` Created ${tablesData.length} tables`);
    } else {
      logger.info(' No tables to create');
    }

    // STEP 3: Create/Update Restaurant Config (for AI Agent)
    logger.info(' Step 3: Creating restaurant_config for AI agent...');

    // Get or create user for this email
    let userId;
    try {
      // Check if user exists in auth.users
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();

      if (listError) {
        logger.warn(' Could not list users:', listError.message);
      }

      const existingUser = users?.find(u => u.email === customer_email);

      if (existingUser) {
        userId = existingUser.id;
        logger.info(' Found existing user:', userId);
      } else {
        // Create a new user for this restaurant
        const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: customer_email,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            restaurant_name,
            onboarding_completed: true
          }
        });

        if (createUserError) {
          logger.warn(' Could not create user:', createUserError.message);
          // Continue without user - we'll use service role to insert
        } else {
          userId = newUser.user.id;
          logger.info(' Created new user:', userId);
        }
      }
    } catch (authError) {
      logger.warn(' Auth error, continuing with service role:', authError.message);
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

    // Map restaurant_type to enum value
    const typeMapping = {
      'traditional': 'casual_dining',
      'modern': 'fine_dining',
      'fast-casual': 'fast_casual',
      'fine-dining': 'fine_dining',
      'italian': 'italian',
      'japanese': 'japanese',
      'mexican': 'mexican',
      'steakhouse': 'steakhouse',
      'cafe': 'cafe',
      'bar': 'bar'
    };
    const mappedType = typeMapping[restaurant_type] || 'other';

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
    const voiceLanguage = selected_voice_language || 'en';
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
      country,
      email: email || customer_email,
      phone: phone_number,
      website: website || null,
      voice_id: selected_voice_id || 'default',
      business_hours: business_hours.reduce((acc, day) => {
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
        cancellation_policy: cancellation_policy || '24 hours notice required',
        special_notes: special_notes || '',
        max_party_size: 12,
        min_party_size: 1,
        require_credit_card: false,
        allow_waitlist: true
      },
      average_dining_duration_minutes: average_dining_duration || 90,
      timezone: suggestTimezone(country, city),
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
          .select('*')
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
      logger.error(' Error saving restaurant_config:', configError);
      // Don't fail the whole onboarding if config save fails
      logger.warn(' Continuing despite restaurant_config error');
    }


    // STEP 4: Create ElevenLabs Agent
    logger.info(' Step 4: Creating ElevenLabs agent...');
    logger.info(' Voice config:', {
      selected_voice_id,
      selected_voice_language,
      restaurant_name
    });

    // Transform business_hours array to object format for agent API
    // From: [{ day: "Monday", is_open: true, open_time: "12:00", close_time: "23:00" }]
    // To: { monday: { isOpen: true, open: "12:00", close: "23:00" } }
    const agentBusinessHours = {};
    if (Array.isArray(business_hours)) {
      business_hours.forEach(dayConfig => {
        const dayKey = dayConfig.day.toLowerCase();
        agentBusinessHours[dayKey] = {
          isOpen: dayConfig.is_open,
          open: dayConfig.open_time,
          close: dayConfig.close_time
        };
      });
    }

    let agentId = null;
    try {
      const agentCreateEndpoint = `${process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app'}/api/elevenlabs-agent-create`;

      const agentResponse = await fetch(agentCreateEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || ''
        },
        body: JSON.stringify({
          restaurant_id: generatedRestaurantId,
          restaurant_name,
          voice_id: selected_voice_id || '21m00Tcm4TlvDq8ikWAM', // Rachel - ElevenLabs default
          language: selected_voice_language || 'en',
          business_hours: agentBusinessHours,
          phone: phone_number,
          address: `${city}, ${country}`
        })
      });

      logger.info(' Agent API response status:', agentResponse.status);

      if (agentResponse.ok) {
        const agentData = await agentResponse.json();
        agentId = agentData.agent_id;

        // Update restaurant_info with agent details
        const voiceIdToSave = selected_voice_id || '21m00Tcm4TlvDq8ikWAM';
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
        if (userId) {
          await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .update({
              elevenlabs_agent_id: agentId,
              agent_language: selected_voice_language || 'en'
            })
            .eq('user_id', userId);

          logger.info(' Agent saved to restaurant_config');
        }

        logger.info(' ElevenLabs agent created:', agentId);
        logger.info(' Agent URL: https://elevenlabs.io/app/conversational-ai/' + agentId);
      } else {
        const errorText = await agentResponse.text();
        logger.error(' ❌ Failed to create agent:', {
          status: agentResponse.status,
          statusText: agentResponse.statusText,
          error: errorText
        });
      }
    } catch (agentError) {
      logger.error(' ❌ Error creating ElevenLabs agent:', {
        message: agentError.message,
        stack: agentError.stack
      });
      logger.warn(' Continuing without agent creation');
    }

    // STEP 5: Create trial subscription (14-day free trial, no payment required)
    logger.info(' Step 5: Creating trial subscription...');

    let trialSubscription = null;
    try {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

      // Use restaurant_config.id as canonical restaurant_id (matches dashboard auth)
      const canonicalRestaurantId = configResult?.id || restaurantInfoResult.id;
      const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
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
        })
        .select()
        .single();

      if (subError) {
        logger.warn(' Could not create trial subscription:', subError.message);
      } else {
        trialSubscription = subData;
        logger.info(' Trial subscription created (expires:', trialEnd.toISOString(), ')');
      }
    } catch (trialError) {
      logger.warn(' Trial subscription error (non-fatal):', trialError.message);
    }

    logger.info(' Onboarding complete!');

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      restaurant: {
        restaurant_id: generatedRestaurantId,
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
