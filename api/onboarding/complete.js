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
        restaurant_type,
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

    // First, deactivate all existing tables
    const { error: deactivateError } = await supabase
      .from('tables')
      .update({ is_active: false })
      .eq('is_active', true);

    if (deactivateError) {
      console.warn('[Onboarding] Warning: Could not deactivate existing tables:', deactivateError);
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
            status: 'Available',
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

    // STEP 3: Log team members (store in metadata for now)
    if (team_members && team_members.length > 0) {
      console.log(`[Onboarding] Team members provided: ${team_members.length}`);
      console.log('[Onboarding] Note: Team member creation not yet implemented in Supabase');
      // TODO: Create team_members table and implement team member creation
    }

    console.log('[Onboarding] ✅ Onboarding complete!');

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      restaurant: {
        restaurant_id: generatedRestaurantId,
        restaurant_name,
        record_id: restaurantInfoResult.id,
        tables_created: tablesToInsert.length
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
