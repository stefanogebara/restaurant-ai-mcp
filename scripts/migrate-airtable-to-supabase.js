/**
 * Airtable to Supabase Migration Script
 *
 * This script migrates all data from Airtable to Supabase PostgreSQL
 * Run this once to perform the complete migration
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const airtableRequest = async (tableId) => {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return { success: true, records: response.data.records || [] };
  } catch (error) {
    console.error(`Error fetching from Airtable table ${tableId}:`, error.message);
    return { success: false, records: [] };
  }
};

// ============ MIGRATION FUNCTIONS ============

async function migrateTables() {
  console.log('\n🔄 Migrating Tables...');

  const result = await airtableRequest(process.env.TABLES_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No tables found in Airtable');
    return;
  }

  const tables = result.records.map(r => ({
    table_number: r.fields['Table Number'],
    capacity: r.fields['Capacity'],
    location: r.fields['Location'] || 'Main',
    status: r.fields['Status']?.toLowerCase() || 'available',
    current_service_id: r.fields['Current Service ID'] || null,
    is_active: r.fields['Is Active'] !== false
  }));

  const { data, error } = await supabase
    .from('tables')
    .upsert(tables, { onConflict: 'table_number' });

  if (error) {
    console.error('  ❌ Error migrating tables:', error);
  } else {
    console.log(`  ✅ Migrated ${tables.length} tables`);
  }
}

async function migrateReservations() {
  console.log('\n🔄 Migrating Reservations...');

  const result = await airtableRequest(process.env.RESERVATIONS_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No reservations found in Airtable');
    return;
  }

  const reservations = result.records.map(r => ({
    reservation_id: r.fields['Reservation ID'],
    customer_name: r.fields['Customer Name'],
    customer_phone: r.fields['Customer Phone'],
    customer_email: r.fields['Customer Email'] || null,
    party_size: r.fields['Party Size'],
    date: r.fields['Date'],
    time: r.fields['Time'],
    special_requests: r.fields['Special Requests'] || null,
    status: r.fields['Status']?.toLowerCase()?.replace('-', '_') || 'pending',
    table_ids: r.fields['Table IDs'] || [],
    checked_in_at: r.fields['Checked In At'] || null,
    notes: r.fields['Notes'] || null,
    ml_risk_score: r.fields['ML Risk Score'] || null,
    ml_risk_level: r.fields['ML Risk Level'] || null,
    ml_confidence: r.fields['ML Confidence'] || null,
    ml_model_version: r.fields['ML Model Version'] || null,
    ml_prediction_timestamp: r.fields['ML Prediction Timestamp'] || null
  }));

  const { data, error } = await supabase
    .from('reservations')
    .upsert(reservations, { onConflict: 'reservation_id' });

  if (error) {
    console.error('  ❌ Error migrating reservations:', error);
  } else {
    console.log(`  ✅ Migrated ${reservations.length} reservations`);
  }
}

async function migrateServiceRecords() {
  console.log('\n🔄 Migrating Service Records...');

  const result = await airtableRequest(process.env.SERVICE_RECORDS_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No service records found in Airtable');
    return;
  }

  const serviceRecords = result.records.map(r => ({
    service_id: r.fields['Service ID'],
    reservation_id: r.fields['Reservation ID'] || null,
    customer_name: r.fields['Customer Name'],
    customer_phone: r.fields['Customer Phone'],
    party_size: r.fields['Party Size'],
    table_ids: r.fields['Table IDs'] || [],
    seated_at: r.fields['Seated At'],
    estimated_departure: r.fields['Estimated Departure'] || null,
    actual_departure: r.fields['Actual Departure'] || null,
    special_requests: r.fields['Special Requests'] || null,
    status: r.fields['Status']?.toLowerCase() || 'active'
  }));

  const { data, error } = await supabase
    .from('service_records')
    .upsert(serviceRecords, { onConflict: 'service_id' });

  if (error) {
    console.error('  ❌ Error migrating service records:', error);
  } else {
    console.log(`  ✅ Migrated ${serviceRecords.length} service records`);
  }
}

async function migrateWaitlist() {
  console.log('\n🔄 Migrating Waitlist...');

  const result = await airtableRequest(process.env.WAITLIST_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No waitlist entries found in Airtable');
    return;
  }

  const waitlist = result.records.map(r => ({
    waitlist_id: r.fields['Waitlist ID'],
    customer_name: r.fields['Customer Name'],
    customer_phone: r.fields['Customer Phone'],
    party_size: r.fields['Party Size'],
    added_at: r.fields['Added At'] || new Date().toISOString(),
    estimated_wait_minutes: r.fields['Estimated Wait Minutes'] || null,
    status: r.fields['Status']?.toLowerCase() || 'waiting',
    notes: r.fields['Notes'] || null
  }));

  const { data, error } = await supabase
    .from('waitlist')
    .upsert(waitlist, { onConflict: 'waitlist_id' });

  if (error) {
    console.error('  ❌ Error migrating waitlist:', error);
  } else {
    console.log(`  ✅ Migrated ${waitlist.length} waitlist entries`);
  }
}

async function migrateCustomerHistory() {
  console.log('\n🔄 Migrating Customer History...');

  const result = await airtableRequest(process.env.CUSTOMER_HISTORY_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No customer history found in Airtable');
    return;
  }

  const customerHistory = result.records.map(r => ({
    customer_id: r.fields['Customer ID'],
    customer_phone: r.fields['Customer Phone'] || null,
    customer_email: r.fields['Customer Email'] || null,
    customer_name: r.fields['Customer Name'] || null,
    total_bookings: r.fields['Total Bookings'] || 0,
    completed_bookings: r.fields['Completed Bookings'] || 0,
    cancelled_bookings: r.fields['Cancelled Bookings'] || 0,
    no_shows: r.fields['No Shows'] || 0,
    avg_advance_booking_hours: r.fields['Avg Advance Booking Hours'] || null,
    last_booking_date: r.fields['Last Booking Date'] || null,
    first_booking_date: r.fields['First Booking Date'] || null,
    cancellation_rate: r.fields['Cancellation Rate'] || 0,
    no_show_rate: r.fields['No Show Rate'] || 0,
    reliability_score: r.fields['Reliability Score'] || 100,
    avg_party_size: r.fields['Avg Party Size'] || null,
    preferred_times: r.fields['Preferred Times'] || []
  }));

  const { data, error } = await supabase
    .from('customer_history')
    .upsert(customerHistory, { onConflict: 'customer_id' });

  if (error) {
    console.error('  ❌ Error migrating customer history:', error);
  } else {
    console.log(`  ✅ Migrated ${customerHistory.length} customer history records`);
  }
}

async function migrateRestaurantInfo() {
  console.log('\n🔄 Migrating Restaurant Info...');

  const result = await airtableRequest(process.env.RESTAURANT_INFO_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No restaurant info found in Airtable');
    return;
  }

  const info = result.records[0].fields;

  const restaurantInfo = {
    restaurant_name: info['Restaurant Name'] || 'Restaurant',
    phone: info['Phone'] || null,
    email: info['Email'] || null,
    address: info['Address'] || null,
    business_hours: info['Business Hours'] || null,
    avg_dining_duration_minutes: info['Avg Dining Duration'] || 90,
    timezone: info['Timezone'] || 'UTC'
  };

  // Clear existing data and insert
  await supabase.from('restaurant_info').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { data, error } = await supabase
    .from('restaurant_info')
    .insert(restaurantInfo);

  if (error) {
    console.error('  ❌ Error migrating restaurant info:', error);
  } else {
    console.log(`  ✅ Migrated restaurant info`);
  }
}

async function migrateSubscriptions() {
  console.log('\n🔄 Migrating Subscriptions...');

  const result = await airtableRequest(process.env.SUBSCRIPTIONS_TABLE_ID);

  if (!result.success || result.records.length === 0) {
    console.log('  ⚠️  No subscriptions found in Airtable');
    return;
  }

  const subscriptions = result.records.map(r => ({
    subscription_id: r.fields['Subscription ID'],
    customer_id: r.fields['Customer ID'],
    customer_email: r.fields['Customer Email'],
    plan_name: r.fields['Plan Name'],
    price_id: r.fields['Price ID'],
    status: r.fields['Status']?.toLowerCase() || 'active',
    current_period_start: r.fields['Current Period Start'] || null,
    current_period_end: r.fields['Current Period End'] || null,
    trial_end: r.fields['Trial End'] || null,
    canceled_at: r.fields['Canceled At'] || null
  }));

  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(subscriptions, { onConflict: 'subscription_id' });

  if (error) {
    console.error('  ❌ Error migrating subscriptions:', error);
  } else {
    console.log(`  ✅ Migrated ${subscriptions.length} subscriptions`);
  }
}

// ============ MAIN MIGRATION ============

async function runMigration() {
  console.log('\n========================================');
  console.log('🚀 AIRTABLE TO SUPABASE MIGRATION');
  console.log('========================================');

  // Check credentials
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\n❌ Missing Supabase credentials!');
    console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.error('\n❌ Missing Airtable credentials!');
    console.error('   Please set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env');
    process.exit(1);
  }

  console.log('\n✅ Credentials verified');
  console.log(`   Airtable Base: ${process.env.AIRTABLE_BASE_ID}`);
  console.log(`   Supabase URL: ${process.env.SUPABASE_URL}`);

  try {
    // Migrate in order (respecting foreign keys)
    await migrateRestaurantInfo();
    await migrateTables();
    await migrateReservations();
    await migrateServiceRecords();
    await migrateCustomerHistory();
    await migrateWaitlist();
    await migrateSubscriptions();

    console.log('\n========================================');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('========================================\n');
    console.log('Next steps:');
    console.log('1. Verify data in Supabase dashboard');
    console.log('2. Update API endpoints to use Supabase');
    console.log('3. Test complete application flow');
    console.log('4. Update environment variables on Vercel\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
