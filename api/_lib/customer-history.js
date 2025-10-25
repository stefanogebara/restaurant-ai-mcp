/**
 * Customer History Tracking Service
 *
 * Manages customer profiles and behavioral history for ML predictions
 * Tracks: visits, no-shows, preferences, spend patterns
 */

const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const CUSTOMER_HISTORY_TABLE_ID = process.env.CUSTOMER_HISTORY_TABLE_ID || 'tblCustomerHistory';

// ============================================================================
// AIRTABLE REQUESTS
// ============================================================================

async function airtableRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    };

    if (data !== null && method !== 'GET') {
      config.data = data;
    }

    console.log(`[CustomerHistory ${method}] ${endpoint}`);
    const response = await axios(config);

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Customer History request error:', error.response?.data || error.message);
    return {
      success: false,
      error: true,
      message: error.response?.data?.error?.message || 'Database connection error'
    };
  }
}

// ============================================================================
// CUSTOMER LOOKUP
// ============================================================================

/**
 * Find customer by email
 */
async function findCustomerByEmail(email) {
  if (!email) return null;

  const filter = `{Email} = '${email.toLowerCase().trim()}'`;
  const result = await airtableRequest('GET', `${CUSTOMER_HISTORY_TABLE_ID}?filterByFormula=${encodeURIComponent(filter)}`);

  if (result.success && result.data.records && result.data.records.length > 0) {
    return mapCustomerRecord(result.data.records[0]);
  }

  return null;
}

/**
 * Find customer by phone
 */
async function findCustomerByPhone(phone) {
  if (!phone) return null;

  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');

  const filter = `{Phone} = '${normalizedPhone}'`;
  const result = await airtableRequest('GET', `${CUSTOMER_HISTORY_TABLE_ID}?filterByFormula=${encodeURIComponent(filter)}`);

  if (result.success && result.data.records && result.data.records.length > 0) {
    return mapCustomerRecord(result.data.records[0]);
  }

  return null;
}

/**
 * Get customer by Airtable record ID
 */
async function getCustomer(recordId) {
  const result = await airtableRequest('GET', `${CUSTOMER_HISTORY_TABLE_ID}/${recordId}`);

  if (result.success && result.data) {
    return mapCustomerRecord(result.data);
  }

  return null;
}

/**
 * Map Airtable record to customer object
 */
function mapCustomerRecord(record) {
  return {
    id: record.id,
    email: record.fields['Email'] || '',
    phone: record.fields['Phone'] || '',
    customer_name: record.fields['Customer Name'] || '',
    first_visit_date: record.fields['First Visit Date'] || null,
    last_visit_date: record.fields['Last Visit Date'] || null,
    total_reservations: record.fields['Total Reservations'] || 0,
    completed_reservations: record.fields['Completed Reservations'] || 0,
    no_shows: record.fields['No Shows'] || 0,
    cancellations: record.fields['Cancellations'] || 0,
    average_party_size: record.fields['Average Party Size'] || 0,
    total_spend: record.fields['Total Spend'] || 0,
    average_spend_per_visit: record.fields['Average Spend Per Visit'] || 0,
    favorite_time_slot: record.fields['Favorite Time Slot'] || '',
    favorite_day: record.fields['Favorite Day'] || '',
    vip_status: record.fields['VIP Status'] || false,
    no_show_risk_score: record.fields['No Show Risk Score'] || 0.15,
    days_since_last_visit: record.fields['Days Since Last Visit'] || 0,
    notes: record.fields['Notes'] || '',
    created_at: record.createdTime,
    updated_at: record.fields['Updated At'] || record.createdTime
  };
}

// ============================================================================
// FIND OR CREATE
// ============================================================================

/**
 * Find existing customer or create new one
 *
 * Tries to find by email first, then phone, then creates new
 */
async function findOrCreateCustomer(email, phone, name) {
  console.log(`[CustomerHistory] Finding or creating customer: ${email || phone}`);

  // Try to find by email
  let customer = await findCustomerByEmail(email);

  // If not found, try phone
  if (!customer && phone) {
    customer = await findCustomerByPhone(phone);
  }

  // If still not found, create new
  if (!customer) {
    console.log('[CustomerHistory] Customer not found, creating new...');

    const today = new Date().toISOString().split('T')[0];

    const newCustomerData = {
      fields: {
        'Email': email || '',
        'Phone': phone || '',
        'Customer Name': name || '',
        'First Visit Date': today,
        'Total Reservations': 0,
        'Completed Reservations': 0,
        'No Shows': 0,
        'Cancellations': 0,
        'Average Party Size': 0,
        'No Show Risk Score': 0.15,  // Default for new customers
        'Total Spend': 0,
        'Average Spend Per Visit': 0
      }
    };

    const result = await airtableRequest('POST', CUSTOMER_HISTORY_TABLE_ID, newCustomerData);

    if (result.success && result.data) {
      customer = mapCustomerRecord(result.data);
      console.log(`[CustomerHistory] ✓ Created new customer: ${customer.id}`);
    } else {
      console.error('[CustomerHistory] ✗ Failed to create customer:', result);
      return null;
    }
  } else {
    console.log(`[CustomerHistory] ✓ Found existing customer: ${customer.id}`);
  }

  return customer;
}

// ============================================================================
// UPDATE CUSTOMER HISTORY
// ============================================================================

/**
 * Update customer history stats based on reservation outcome
 *
 * @param {string} customerId - Airtable record ID
 * @param {object} reservation - Reservation details
 * @param {string} outcome - 'created', 'completed', 'no-show', 'cancelled'
 */
async function updateCustomerHistory(customerId, reservation, outcome) {
  console.log(`[CustomerHistory] Updating customer ${customerId} - outcome: ${outcome}`);

  // Get current customer data
  const customer = await getCustomer(customerId);
  if (!customer) {
    console.error('[CustomerHistory] Customer not found:', customerId);
    return { success: false, error: 'Customer not found' };
  }

  // Calculate updates based on outcome
  const updates = {};

  if (outcome === 'created') {
    // New reservation created
    updates['Total Reservations'] = customer.total_reservations + 1;

  } else if (outcome === 'completed') {
    // Reservation completed successfully
    updates['Completed Reservations'] = customer.completed_reservations + 1;
    updates['Last Visit Date'] = reservation.date || reservation.Date;

    // Update average party size
    const totalPartySize = (customer.average_party_size * customer.completed_reservations) +
                           (reservation.party_size || reservation['Party Size']);
    updates['Average Party Size'] = parseFloat((totalPartySize / (customer.completed_reservations + 1)).toFixed(1));

    // Recalculate no-show risk
    updates['No Show Risk Score'] = parseFloat(
      (customer.no_shows / (customer.total_reservations || 1)).toFixed(3)
    );

  } else if (outcome === 'no-show') {
    // Customer didn't show up
    updates['No Shows'] = customer.no_shows + 1;

    // Recalculate no-show risk (now higher)
    updates['No Show Risk Score'] = parseFloat(
      ((customer.no_shows + 1) / (customer.total_reservations || 1)).toFixed(3)
    );

  } else if (outcome === 'cancelled') {
    // Reservation was cancelled
    updates['Cancellations'] = customer.cancellations + 1;
  }

  // Apply updates
  const result = await airtableRequest('PATCH', `${CUSTOMER_HISTORY_TABLE_ID}/${customerId}`, {
    fields: updates
  });

  if (result.success) {
    console.log(`[CustomerHistory] ✓ Updated customer ${customerId}:`, updates);
    return { success: true, updates };
  } else {
    console.error(`[CustomerHistory] ✗ Failed to update customer ${customerId}:`, result);
    return { success: false, error: result.message };
  }
}

/**
 * Add spending data to customer history (if tracking revenue)
 */
async function updateCustomerSpend(customerId, amount) {
  const customer = await getCustomer(customerId);
  if (!customer) return { success: false, error: 'Customer not found' };

  const newTotalSpend = customer.total_spend + amount;
  const newAvgSpend = customer.completed_reservations > 0
    ? newTotalSpend / customer.completed_reservations
    : amount;

  const updates = {
    fields: {
      'Total Spend': newTotalSpend,
      'Average Spend Per Visit': parseFloat(newAvgSpend.toFixed(2))
    }
  };

  return await airtableRequest('PATCH', `${CUSTOMER_HISTORY_TABLE_ID}/${customerId}`, updates);
}

// ============================================================================
// CUSTOMER STATS & ANALYTICS
// ============================================================================

/**
 * Get customer statistics for ML features
 */
async function getCustomerStats(email, phone) {
  const customer = await findCustomerByEmail(email) || await findCustomerByPhone(phone);

  if (!customer) {
    // Return default stats for new customer
    return {
      is_repeat_customer: false,
      total_reservations: 0,
      completed_reservations: 0,
      no_show_count: 0,
      no_show_rate: 0.15,  // Default industry average
      cancellation_count: 0,
      average_party_size: 0,
      days_since_last_visit: null,
      vip_status: false,
      customer_id: null
    };
  }

  return {
    is_repeat_customer: customer.total_reservations > 0,
    total_reservations: customer.total_reservations,
    completed_reservations: customer.completed_reservations,
    no_show_count: customer.no_shows,
    no_show_rate: customer.no_show_risk_score,
    cancellation_count: customer.cancellations,
    average_party_size: customer.average_party_size,
    days_since_last_visit: customer.days_since_last_visit,
    vip_status: customer.vip_status,
    customer_id: customer.id
  };
}

/**
 * Calculate days since last visit
 */
function calculateDaysSinceLastVisit(lastVisitDate) {
  if (!lastVisitDate) return null;

  const last = new Date(lastVisitDate);
  const now = new Date();
  const diffTime = Math.abs(now - last);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

// ============================================================================
// BACKFILL HISTORICAL DATA
// ============================================================================

/**
 * Backfill customer history from historical reservations
 * Run once to populate customer history table
 */
async function backfillCustomerHistory(reservations) {
  console.log('[CustomerHistory] Starting backfill of customer history...');

  // Group reservations by customer (email/phone)
  const customerMap = new Map();

  for (const res of reservations) {
    const key = (res.fields['Customer Email'] || res.fields['Customer Phone'] || '').toLowerCase();
    if (!key) continue;

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        email: res.fields['Customer Email'] || '',
        phone: res.fields['Customer Phone'] || '',
        name: res.fields['Customer Name'] || '',
        reservations: []
      });
    }

    customerMap.get(key).reservations.push(res);
  }

  console.log(`[CustomerHistory] Found ${customerMap.size} unique customers`);

  let created = 0;
  let errors = 0;

  // Create customer history records
  for (const [key, data] of customerMap.entries()) {
    try {
      const reservations = data.reservations;
      const completedRes = reservations.filter(r => r.fields.Status === 'completed');
      const noShows = reservations.filter(r => r.fields.Status === 'no-show' || r.fields.Status === 'No-Show');
      const cancellations = reservations.filter(r => r.fields.Status === 'cancelled' || r.fields.Status === 'Cancelled');

      const dates = reservations.map(r => r.fields.Date).filter(Boolean).sort();
      const firstVisit = dates[0] || new Date().toISOString().split('T')[0];

      const completedDates = completedRes.map(r => r.fields.Date).filter(Boolean).sort();
      const lastVisit = completedDates[completedDates.length - 1] || null;

      const totalPartySize = completedRes.reduce((sum, r) => sum + (r.fields['Party Size'] || 0), 0);
      const avgPartySize = completedRes.length > 0 ? totalPartySize / completedRes.length : 0;

      const customerData = {
        fields: {
          'Email': data.email,
          'Phone': data.phone,
          'Customer Name': data.name,
          'First Visit Date': firstVisit,
          'Last Visit Date': lastVisit,
          'Total Reservations': reservations.length,
          'Completed Reservations': completedRes.length,
          'No Shows': noShows.length,
          'Cancellations': cancellations.length,
          'Average Party Size': parseFloat(avgPartySize.toFixed(1)),
          'No Show Risk Score': reservations.length > 0
            ? parseFloat((noShows.length / reservations.length).toFixed(3))
            : 0.15
        }
      };

      const result = await airtableRequest('POST', CUSTOMER_HISTORY_TABLE_ID, customerData);

      if (result.success) {
        created++;
      } else {
        errors++;
        console.error('[CustomerHistory] Failed to create customer:', result);
      }

    } catch (error) {
      errors++;
      console.error('[CustomerHistory] Error processing customer:', error);
    }
  }

  console.log(`[CustomerHistory] Backfill complete: ${created} created, ${errors} errors`);

  return {
    success: true,
    total_customers: customerMap.size,
    created,
    errors
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Lookup
  findCustomerByEmail,
  findCustomerByPhone,
  getCustomer,
  findOrCreateCustomer,

  // Updates
  updateCustomerHistory,
  updateCustomerSpend,

  // Stats
  getCustomerStats,
  calculateDaysSinceLastVisit,

  // Backfill
  backfillCustomerHistory
};
