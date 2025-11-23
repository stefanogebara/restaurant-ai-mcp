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

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    } = req.body;

    // Validate required fields
    if (!customer_email || !restaurant_name || !phone_number || !email) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customer_email', 'restaurant_name', 'phone_number', 'email'],
      });
    }

    console.log('[Onboarding] Starting onboarding for:', customer_email);
    console.log('[Onboarding] Restaurant:', restaurant_name);

    // Generate Restaurant ID
    const generatedRestaurantId = restaurant_id || `REST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Validate restaurant_type against allowed values
    const ALLOWED_RESTAURANT_TYPES = ['traditional', 'modern', 'fast-casual', 'fine-dining'];
    const validatedRestaurantType = ALLOWED_RESTAURANT_TYPES.includes(restaurant_type)
      ? restaurant_type
      : null;  // Set to null if invalid value provided

    if (restaurant_type && !validatedRestaurantType) {
      console.warn(`[Onboarding] Invalid restaurant_type "${restaurant_type}". Must be one of: ${ALLOWED_RESTAURANT_TYPES.join(', ')}. Setting to null.`);
    }

    // STEP 1: Update restaurant_info table
    console.log('[Onboarding] Step 1: Updating restaurant_info...');

    // Map onboarding fields to actual database schema
    const restaurantInfoData = {
      restaurant_name,
      phone: phone_number,  // Schema uses 'phone' not 'phone_number'
      email: email,
      address: `${city}, ${country}`,
      business_hours: business_hours || [],
      avg_dining_duration_minutes: average_dining_duration || 90,  // Schema uses this name
      timezone: 'America/New_York',  // Default timezone
      language: 'en',
      // Store additional metadata in metric_profile JSON field
      metric_profile: {
        customer_email,
        restaurant_id: generatedRestaurantId,
        restaurant_type: validatedRestaurantType,  // Use validated value
        city,
        country,
        plan: plan || 'Basic',
        website: website || '',
        cancellation_policy: cancellation_policy || 'Free cancellation up to 2 hours before reservation',
        special_notes: special_notes || '',
        advance_booking_days: advance_booking_days || 30,
        buffer_time: buffer_time || 15,
        onboarding_completed_at: new Date().toISOString()
      }
    };

    // Check if restaurant_info record exists
    const { data: existingInfo, error: fetchError } = await supabase
      .from('restaurant_info')
      .select('*')
      .limit(1)
      .single();

    let restaurantInfoResult;
    if (existingInfo) {
      // Update existing record
      const { data, error } = await supabase
        .from('restaurant_info')
        .update(restaurantInfoData)
        .eq('id', existingInfo.id)
        .select()
        .single();

      if (error) throw error;
      restaurantInfoResult = data;
      console.log('[Onboarding] Restaurant info updated');
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('restaurant_info')
        .insert(restaurantInfoData)
        .select()
        .single();

      if (error) throw error;
      restaurantInfoResult = data;
      console.log('[Onboarding] Restaurant info created');
    }

    // STEP 2: Create Tables
    console.log('[Onboarding] Step 2: Creating tables...');

    // First, delete all existing tables (onboarding resets the restaurant)
    const { error: deleteError } = await supabase
      .from('tables')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');  // Delete all (using impossible UUID)

    if (deleteError) {
      console.warn('[Onboarding] Warning: Could not delete existing tables:', deleteError);
    } else {
      console.log('[Onboarding] Cleared all existing tables');
    }

    // Create new tables from areas configuration
    let tableNumber = 1;
    const tablesToInsert = [];

    for (const area of areas || []) {
      for (const tableConfig of area.tables || []) {
        for (let i = 0; i < tableConfig.count; i++) {
          tablesToInsert.push({
            table_number: tableNumber,
            capacity: tableConfig.capacity,
            location: area.name,
            status: 'available',  // Must be lowercase to match database enum
            is_active: true,
            current_service_id: null
          });
          tableNumber++;
        }
      }
    }

    if (tablesToInsert.length > 0) {
      const { data: tablesData, error: tablesError } = await supabase
        .from('tables')
        .insert(tablesToInsert)
        .select();

      if (tablesError) throw tablesError;
      console.log(`[Onboarding] Created ${tablesData.length} tables`);
    } else {
      console.log('[Onboarding] No tables to create');
    }

    // STEP 3: Create/Update Restaurant Config (for AI Agent)
    console.log('[Onboarding] Step 3: Creating restaurant_config for AI agent...');

    // Get or create user for this email
    let userId;
    try {
      // Check if user exists in auth.users
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

      if (listError) {
        console.warn('[Onboarding] Could not list users:', listError.message);
      }

      const existingUser = users?.find(u => u.email === customer_email);

      if (existingUser) {
        userId = existingUser.id;
        console.log('[Onboarding] Found existing user:', userId);
      } else {
        // Create a new user for this restaurant
        const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
          email: customer_email,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            restaurant_name,
            onboarding_completed: true
          }
        });

        if (createUserError) {
          console.warn('[Onboarding] Could not create user:', createUserError.message);
          // Continue without user - we'll use service role to insert
        } else {
          userId = newUser.user.id;
          console.log('[Onboarding] Created new user:', userId);
        }
      }
    } catch (authError) {
      console.warn('[Onboarding] Auth error, continuing with service role:', authError.message);
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

    // Prepare restaurant_config data
    const restaurantConfigData = {
      restaurant_name,
      restaurant_type: mappedType,
      city,
      country,
      email: email || customer_email,
      phone: phone_number,
      website: website || null,
      voice_id: selected_voice_id || 'default_cartesia_voice',
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
      onboarding_completed: true
    };

    // If we have a user_id, add it; otherwise use service role to insert
    if (userId) {
      restaurantConfigData.user_id = userId;
    }

    try {
      // Check if config already exists for this user
      let configResult;
      if (userId) {
        const { data: existingConfig } = await supabase
          .from('restaurant_config')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (existingConfig) {
          // Update existing config
          const { data, error } = await supabase
            .from('restaurant_config')
            .update(restaurantConfigData)
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw error;
          configResult = data;
          console.log('[Onboarding] Restaurant config updated');
        } else {
          // Insert new config
          const { data, error } = await supabase
            .from('restaurant_config')
            .insert(restaurantConfigData)
            .select()
            .single();

          if (error) throw error;
          configResult = data;
          console.log('[Onboarding] Restaurant config created');
        }
      } else {
        // No user_id, skip restaurant_config creation
        console.log('[Onboarding] Skipping restaurant_config creation (no user_id)');
      }
    } catch (configError) {
      console.error('[Onboarding] Error saving restaurant_config:', configError);
      // Don't fail the whole onboarding if config save fails
      console.warn('[Onboarding] Continuing despite restaurant_config error');
    }

    
    // STEP 4: Create ElevenLabs Agent
    console.log('[Onboarding] Step 4: Creating ElevenLabs agent...');

    let agentId = null;
    try {
      const agentCreateEndpoint = `${process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app'}/api/routes/elevenlabs-agent-create`;

      const agentResponse = await fetch(agentCreateEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          restaurant_id: generatedRestaurantId,
          restaurant_name,
          voice_id: selected_voice_id || 'default_voice',
          language: selected_voice_language || 'en',
          business_hours: business_hours || {},
          phone: phone_number,
          address: `${city}, ${country}`
        })
      });

      if (agentResponse.ok) {
        const agentData = await agentResponse.json();
        agentId = agentData.agent_id;

        // Update restaurant_info with agent details
        await supabase
          .from('restaurant_info')
          .update({
            elevenlabs_agent_id: agentId,
            agent_voice_id: selected_voice_id,
            agent_language: selected_voice_language || 'en',
            agent_created_at: new Date().toISOString()
          })
          .eq('id', restaurantInfoResult.id);

        console.log('[Onboarding] ✅ ElevenLabs agent created:', agentId);
      } else {
        const errorText = await agentResponse.text();
        console.warn('[Onboarding] Failed to create agent:', errorText);
      }
    } catch (agentError) {
      console.error('[Onboarding] Error creating ElevenLabs agent:', agentError);
      console.warn('[Onboarding] Continuing without agent creation');
    }

    console.log('[Onboarding] ✅ Onboarding complete!');

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      restaurant: {
        restaurant_id: generatedRestaurantId,
        restaurant_name,
        record_id: restaurantInfoResult.id,
        tables_created: tablesToInsert.length,
        ai_config_saved: !!userId
      },
    });
  } catch (error) {
    console.error('[Onboarding] Error:', error);
    return res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error.message,
      details: error.details || error.hint || 'Unknown error'
    });
  }
};
