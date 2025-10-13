/**
 * Seed Sample Data Script
 *
 * Adds sample tables and reservations to Airtable for testing
 */

const axios = require('axios');
require('dotenv').config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLES_TABLE_ID = process.env.TABLES_TABLE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;

const airtableRequest = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    if (data !== null && method !== 'GET') {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Airtable request error:', error.response?.data || error.message);
    return {
      success: false,
      error: true,
      message: error.response?.data?.error?.message || 'Database connection error'
    };
  }
};

async function seedTables() {
  console.log('\n📊 Creating sample tables...\n');

  const tables = [
    // Indoor Tables
    { 'Table Number': '1', 'Capacity': 2, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '2', 'Capacity': 2, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '3', 'Capacity': 4, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '4', 'Capacity': 4, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '5', 'Capacity': 6, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '6', 'Capacity': 8, 'Location': 'Indoor', 'Status': 'Available', 'Is Active': true },

    // Outdoor Patio
    { 'Table Number': '7', 'Capacity': 2, 'Location': 'Patio', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '8', 'Capacity': 2, 'Location': 'Patio', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '9', 'Capacity': 4, 'Location': 'Patio', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '10', 'Capacity': 4, 'Location': 'Patio', 'Status': 'Available', 'Is Active': true },

    // Bar Area
    { 'Table Number': '11', 'Capacity': 2, 'Location': 'Bar', 'Status': 'Available', 'Is Active': true },
    { 'Table Number': '12', 'Capacity': 2, 'Location': 'Bar', 'Status': 'Available', 'Is Active': true },
  ];

  const records = tables.map(fields => ({ fields }));

  // Airtable allows batch creating up to 10 records at a time
  const batches = [];
  for (let i = 0; i < records.length; i += 10) {
    batches.push(records.slice(i, i + 10));
  }

  for (const batch of batches) {
    const result = await airtableRequest('POST', TABLES_TABLE_ID, { records: batch });
    if (result.success) {
      console.log(`✅ Created ${batch.length} tables`);
    } else {
      console.error(`❌ Failed to create tables:`, result.message);
    }
  }

  console.log('\n✨ Sample tables created!\n');
  console.log('📍 Total Capacity: 42 seats');
  console.log('📍 Indoor: 26 seats (6 tables)');
  console.log('📍 Patio: 12 seats (4 tables)');
  console.log('📍 Bar: 4 seats (2 tables)');
}

async function seedReservations() {
  console.log('\n📅 Creating sample reservations...\n');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Get current time and add 30 minutes
  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();
  const futureTime = new Date(today.getTime() + 30 * 60000);
  const futureHour = futureTime.getHours().toString().padStart(2, '0');
  const futureMinute = futureTime.getMinutes().toString().padStart(2, '0');

  const reservations = [
    {
      'Reservation ID': `RES-${todayStr.replace(/-/g, '')}-0001`,
      'Date': todayStr,
      'Time': `${futureHour}:${futureMinute}`,
      'Party Size': 4,
      'Customer Name': 'John Smith',
      'Customer Phone': '+1234567890',
      'Customer Email': 'john@example.com',
      'Status': 'Confirmed',
      'Special Requests': 'Window seat please',
      'Created At': todayStr,
      'Updated At': todayStr,
      'Confirmation Sent': true,
      'Reminder Sent': false
    },
    {
      'Reservation ID': `RES-${todayStr.replace(/-/g, '')}-0002`,
      'Date': todayStr,
      'Time': `${(futureHour + 1).toString().padStart(2, '0')}:00`,
      'Party Size': 2,
      'Customer Name': 'Maria Garcia',
      'Customer Phone': '+1234567891',
      'Customer Email': 'maria@example.com',
      'Status': 'Confirmed',
      'Special Requests': 'Birthday celebration - dessert surprise',
      'Created At': todayStr,
      'Updated At': todayStr,
      'Confirmation Sent': true,
      'Reminder Sent': false
    },
    {
      'Reservation ID': `RES-${todayStr.replace(/-/g, '')}-0003`,
      'Date': todayStr,
      'Time': `${(futureHour + 1).toString().padStart(2, '0')}:30`,
      'Party Size': 6,
      'Customer Name': 'David Chen',
      'Customer Phone': '+1234567892',
      'Customer Email': 'david@example.com',
      'Status': 'Confirmed',
      'Special Requests': 'Vegetarian options needed',
      'Created At': todayStr,
      'Updated At': todayStr,
      'Confirmation Sent': true,
      'Reminder Sent': false
    }
  ];

  const records = reservations.map(fields => ({ fields }));

  const result = await airtableRequest('POST', RESERVATIONS_TABLE_ID, { records });

  if (result.success) {
    console.log(`✅ Created ${reservations.length} reservations`);
    console.log('\n📝 Reservations:');
    reservations.forEach(r => {
      console.log(`   - ${r['Customer Name']} (${r['Party Size']} people) at ${r.Time}`);
    });
  } else {
    console.error(`❌ Failed to create reservations:`, result.message);
  }
}

async function main() {
  console.log('🌱 Starting data seeding...');
  console.log(`📦 Base ID: ${AIRTABLE_BASE_ID}`);
  console.log(`📊 Tables Table: ${TABLES_TABLE_ID}`);
  console.log(`📅 Reservations Table: ${RESERVATIONS_TABLE_ID}`);

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !TABLES_TABLE_ID || !RESERVATIONS_TABLE_ID) {
    console.error('\n❌ Missing required environment variables!');
    console.error('Make sure .env file contains:');
    console.error('  - AIRTABLE_API_KEY');
    console.error('  - AIRTABLE_BASE_ID');
    console.error('  - TABLES_TABLE_ID');
    console.error('  - RESERVATIONS_TABLE_ID');
    process.exit(1);
  }

  await seedTables();
  await seedReservations();

  console.log('\n✅ Data seeding complete!');
  console.log('\n🚀 Next steps:');
  console.log('   1. Visit https://restaurant-ai-mcp.vercel.app/');
  console.log('   2. You should see 12 tables with color-coded statuses');
  console.log('   3. You should see 3 upcoming reservations');
  console.log('   4. Try checking in a reservation and seating a party!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
