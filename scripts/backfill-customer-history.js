/**
 * Backfill Customer History from Historical Reservations
 *
 * This script populates the Customer History table by analyzing all past reservations
 * and calculating statistics for each unique customer.
 *
 * Usage:
 *   node scripts/backfill-customer-history.js
 */

require('dotenv').config();
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const CUSTOMER_HISTORY_TABLE_ID = process.env.CUSTOMER_HISTORY_TABLE_ID;

// ============================================================================
// AIRTABLE HELPERS
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
      timeout: 10000
    };

    if (data !== null && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Airtable ${method} error:`, error.response?.data || error.message);
    return {
      success: false,
      error: true,
      message: error.response?.data?.error?.message || error.message
    };
  }
}

async function getAllReservations() {
  console.log('\n📥 Fetching all reservations from Airtable...');

  let allRecords = [];
  let offset = null;
  let pageCount = 0;

  do {
    pageCount++;
    const endpoint = offset
      ? `${RESERVATIONS_TABLE_ID}?offset=${offset}`
      : RESERVATIONS_TABLE_ID;

    const result = await airtableRequest('GET', endpoint);

    if (!result.success) {
      throw new Error(`Failed to fetch reservations: ${result.message}`);
    }

    allRecords = allRecords.concat(result.data.records);
    offset = result.data.offset;

    console.log(`   Page ${pageCount}: Fetched ${result.data.records.length} records (Total: ${allRecords.length})`);

  } while (offset);

  console.log(`✅ Fetched ${allRecords.length} total reservations\n`);
  return allRecords;
}

// ============================================================================
// CUSTOMER GROUPING & STATISTICS
// ============================================================================

function groupReservationsByCustomer(reservations) {
  console.log('📊 Grouping reservations by customer...\n');

  const customerMap = new Map();

  for (const res of reservations) {
    const email = res.fields['Customer Email']?.toLowerCase().trim() || '';
    const phone = res.fields['Customer Phone']?.trim() || '';
    const name = res.fields['Customer Name'] || '';

    // Skip if no contact info
    if (!email && !phone) {
      continue;
    }

    // Use email as primary key, phone as fallback
    const key = email || phone;

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        email: email,
        phone: phone,
        name: name,
        reservations: []
      });
    }

    customerMap.get(key).reservations.push(res);
  }

  console.log(`✅ Found ${customerMap.size} unique customers\n`);
  return customerMap;
}

function calculateCustomerStats(reservations) {
  const completedRes = reservations.filter(r =>
    r.fields.Status === 'completed' || r.fields.Status === 'Completed'
  );

  const noShows = reservations.filter(r =>
    r.fields.Status === 'no-show' || r.fields.Status === 'No-Show'
  );

  const cancellations = reservations.filter(r =>
    r.fields.Status === 'cancelled' || r.fields.Status === 'Cancelled'
  );

  // Get all dates and find first/last
  const allDates = reservations
    .map(r => r.fields.Date)
    .filter(Boolean)
    .sort();

  const firstVisit = allDates[0] || new Date().toISOString().split('T')[0];

  // Get completed dates for last visit
  const completedDates = completedRes
    .map(r => r.fields.Date)
    .filter(Boolean)
    .sort();

  const lastVisit = completedDates[completedDates.length - 1] || null;

  // Calculate average party size from completed reservations
  const totalPartySize = completedRes.reduce((sum, r) =>
    sum + (r.fields['Party Size'] || 0), 0
  );
  const avgPartySize = completedRes.length > 0
    ? totalPartySize / completedRes.length
    : 0;

  // Calculate no-show risk score
  const noShowRate = reservations.length > 0
    ? noShows.length / reservations.length
    : 0.15; // Default for new customers

  return {
    totalReservations: reservations.length,
    completedReservations: completedRes.length,
    noShows: noShows.length,
    cancellations: cancellations.length,
    firstVisit,
    lastVisit,
    avgPartySize,
    noShowRate
  };
}

// ============================================================================
// CUSTOMER HISTORY CREATION
// ============================================================================

async function createCustomerRecord(email, phone, name, stats) {
  const customerData = {
    fields: {
      'Email': email || '',
      'Phone': phone || '',
      'Customer Name': name || '',
      'First Visit Date': stats.firstVisit,
      'Last Visit Date': stats.lastVisit,
      'Total Reservations': stats.totalReservations,
      'Completed Reservations': stats.completedReservations,
      'No Shows': stats.noShows,
      'Cancellations': stats.cancellations,
      'Average Party Size': parseFloat(stats.avgPartySize.toFixed(1)),
      'No Show Risk Score': parseFloat(stats.noShowRate.toFixed(3)),
      'Total Spend': 0,
      'Average Spend Per Visit': 0
    }
  };

  const result = await airtableRequest('POST', CUSTOMER_HISTORY_TABLE_ID, customerData);
  return result.success;
}

// ============================================================================
// MAIN BACKFILL FUNCTION
// ============================================================================

async function backfillCustomerHistory() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Customer History Backfill - ML Foundation         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Validate environment variables
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !RESERVATIONS_TABLE_ID || !CUSTOMER_HISTORY_TABLE_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   - AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✓' : '✗');
    console.error('   - AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✓' : '✗');
    console.error('   - RESERVATIONS_TABLE_ID:', RESERVATIONS_TABLE_ID ? '✓' : '✗');
    console.error('   - CUSTOMER_HISTORY_TABLE_ID:', CUSTOMER_HISTORY_TABLE_ID ? '✓' : '✗');
    process.exit(1);
  }

  try {
    // Step 1: Fetch all reservations
    const reservations = await getAllReservations();

    if (reservations.length === 0) {
      console.log('⚠️  No reservations found. Nothing to backfill.');
      return;
    }

    // Step 2: Group by customer
    const customerMap = groupReservationsByCustomer(reservations);

    // Step 3: Create customer history records
    console.log('📝 Creating customer history records...\n');

    let created = 0;
    let errors = 0;
    let skipped = 0;

    for (const [key, customer] of customerMap.entries()) {
      try {
        const stats = calculateCustomerStats(customer.reservations);

        const success = await createCustomerRecord(
          customer.email,
          customer.phone,
          customer.name,
          stats
        );

        if (success) {
          created++;
          console.log(`✅ Created: ${customer.name || customer.email || customer.phone} (${stats.totalReservations} reservations, ${stats.noShows} no-shows)`);
        } else {
          errors++;
          console.error(`❌ Failed: ${customer.name || customer.email || customer.phone}`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error processing ${customer.name || customer.email || customer.phone}:`, error.message);
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 4: Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    BACKFILL COMPLETE                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Summary:`);
    console.log(`   Total Reservations Analyzed: ${reservations.length}`);
    console.log(`   Unique Customers Found: ${customerMap.size}`);
    console.log(`   Customer Records Created: ${created}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Skipped: ${skipped}`);
    console.log('');

    if (created > 0) {
      console.log('✅ Customer History table is now populated!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Verify data in Airtable Customer History table');
      console.log('2. Integrate customer tracking into reservation creation');
      console.log('3. Test customer lookup and stats calculation');
      console.log('');
    }

  } catch (error) {
    console.error('\n❌ Backfill failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run backfill
backfillCustomerHistory().catch(console.error);
