/**
 * POST /api/onboarding/complete
 *
 * Completes the entire restaurant onboarding process:
 * 1. Creates restaurant record in Restaurants table
 * 2. Creates business hours (7 records)
 * 3. Creates restaurant areas
 * 4. Creates tables linked to areas
 * 5. Invites team members (if Pro+ plan)
 * 6. Marks onboarding as complete
 */

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
    } = req.body;

    // Validate required fields
    if (!customer_email || !restaurant_name || !phone_number || !email) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['customer_email', 'restaurant_name', 'phone_number', 'email'],
      });
    }

    console.log('[Onboarding] Starting onboarding for:', customer_email);

    const axios = require('axios');
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

    const airtableRequest = async (method, endpoint, data = null) => {
      const config = {
        method,
        url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      };
      if (data) config.data = data;
      const response = await axios(config);
      return response.data;
    };

    // Generate Restaurant ID
    const generatedRestaurantId = restaurant_id || `REST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // STEP 1: Create Restaurant Record
    console.log('[Onboarding] Step 1: Creating restaurant record...');
    const restaurantFields = {
      'Restaurant ID': generatedRestaurantId,
      'Customer Email': customer_email,
      'Restaurant Name': restaurant_name,
      'Restaurant Type': restaurant_type,
      'City': city,
      'Country': country,
      'Phone Number': phone_number,
      'Email': email,
      'Website': website || '',
      'Average Dining Duration': average_dining_duration,
      'Advance Booking Days': advance_booking_days,
      'Buffer Time': buffer_time,
      'Cancellation Policy': cancellation_policy,
      'Special Notes': special_notes || '',
      'Onboarding Completed': true,
      'Created At': new Date().toISOString().split('T')[0],
      'Status': 'active',
    };

    const restaurantResult = await airtableRequest(
      'POST',
      process.env.RESTAURANTS_TABLE_ID || 'tblRestaurants',
      { fields: restaurantFields }
    );
    console.log('[Onboarding] Restaurant created:', restaurantResult.id);

    // STEP 2: Create Business Hours
    console.log('[Onboarding] Step 2: Creating business hours...');
    const hoursPromises = business_hours.map((day, index) => {
      return airtableRequest(
        'POST',
        process.env.BUSINESS_HOURS_TABLE_ID || 'tblBusinessHours',
        {
          fields: {
            'Hours ID': `${generatedRestaurantId}-${day.day}`,
            'Restaurant ID': [restaurantResult.id], // Link to restaurant
            'Day of Week': day.day,
            'Is Open': day.is_open,
            'Open Time': day.open_time,
            'Close Time': day.close_time,
          },
        }
      );
    });
    await Promise.all(hoursPromises);
    console.log('[Onboarding] Business hours created (7 days)');

    // STEP 3: Create Restaurant Areas
    console.log('[Onboarding] Step 3: Creating restaurant areas...');
    const areaResults = [];
    for (const [index, area] of areas.entries()) {
      const areaResult = await airtableRequest(
        'POST',
        process.env.AREAS_TABLE_ID || 'tblAreas',
        {
          fields: {
            'Area ID': `${generatedRestaurantId}-AREA-${index + 1}`,
            'Restaurant ID': [restaurantResult.id], // Link to restaurant
            'Area Name': area.name,
            'Is Active': area.is_active,
            'Display Order': index + 1,
            'Created At': new Date().toISOString().split('T')[0],
          },
        }
      );
      areaResults.push({ ...area, recordId: areaResult.id });
      console.log(`[Onboarding] Area created: ${area.name} (${areaResult.id})`);
    }

    // STEP 4: Create Tables
    console.log('[Onboarding] Step 4: Creating tables...');
    let tableNumber = 1;
    const tablePromises = [];

    for (const areaData of areaResults) {
      for (const tableConfig of areaData.tables) {
        for (let i = 0; i < tableConfig.count; i++) {
          tablePromises.push(
            airtableRequest(
              'POST',
              process.env.TABLES_TABLE_ID || 'tblTables',
              {
                fields: {
                  'Table Number': tableNumber,
                  'Capacity': tableConfig.capacity,
                  'Status': 'Available',
                  'Is Active': true,
                  'Location': areaData.name,
                  'Restaurant ID': [restaurantResult.id], // Link to restaurant
                  'Area ID': [areaData.recordId], // Link to area
                },
              }
            )
          );
          tableNumber++;
        }
      }
    }

    await Promise.all(tablePromises);
    console.log(`[Onboarding] Tables created: ${tableNumber - 1} tables`);

    // STEP 5: Invite Team Members (if any)
    if (team_members && team_members.length > 0) {
      console.log('[Onboarding] Step 5: Inviting team members...');
      const teamPromises = team_members.map((member) => {
        return airtableRequest(
          'POST',
          process.env.TEAM_MEMBERS_TABLE_ID || 'tblTeamMembers',
          {
            fields: {
              'Member ID': `${generatedRestaurantId}-${member.email}`,
              'Restaurant ID': [restaurantResult.id], // Link to restaurant
              'Email': member.email,
              'Role': member.role,
              'Status': 'pending',
              'Invited At': new Date().toISOString().split('T')[0],
            },
          }
        );
      });
      await Promise.all(teamPromises);
      console.log(`[Onboarding] Team members invited: ${team_members.length}`);
    }

    console.log('[Onboarding] ✅ Onboarding complete!');

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      restaurant: {
        restaurant_id: generatedRestaurantId,
        restaurant_name,
        record_id: restaurantResult.id,
      },
    });
  } catch (error) {
    console.error('[Onboarding] Error:', error);
    return res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error.message,
    });
  }
};
