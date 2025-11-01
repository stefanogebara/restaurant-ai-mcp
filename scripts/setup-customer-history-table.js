/**
 * Customer History Table Setup Script
 *
 * NOTE: Airtable REST API does not support creating tables or fields programmatically.
 * This script provides:
 * 1. Verification if the table already exists
 * 2. Step-by-step manual setup instructions
 * 3. Test data creation once table is ready
 */

require('dotenv').config();
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const CUSTOMER_HISTORY_TABLE_NAME = 'Customer History';

// Table schema definition
const TABLE_SCHEMA = {
  name: 'Customer History',
  description: 'Track customer behavior across visits to improve no-show predictions (43% feature importance)',
  fields: [
    { name: 'Customer ID', type: 'autoNumber', description: 'Auto-generated unique identifier' },
    { name: 'Email', type: 'email', description: 'Customer email address' },
    { name: 'Phone', type: 'phoneNumber', description: 'Customer phone number' },
    { name: 'Customer Name', type: 'singleLineText', description: 'Full name' },
    { name: 'First Visit Date', type: 'date', description: 'Date of first reservation' },
    { name: 'Last Visit Date', type: 'date', description: 'Date of most recent completed reservation' },
    { name: 'Total Reservations', type: 'number', description: 'Count of all reservations made', precision: 0 },
    { name: 'Completed Reservations', type: 'number', description: 'Reservations that showed up', precision: 0 },
    { name: 'No Shows', type: 'number', description: 'Reservations marked as no-show', precision: 0 },
    { name: 'Cancellations', type: 'number', description: 'Reservations cancelled before date', precision: 0 },
    { name: 'Average Party Size', type: 'number', description: 'Mean party size across all reservations', precision: 1 },
    { name: 'Total Spend', type: 'currency', description: 'Lifetime spend', symbol: 'EUR' },
    { name: 'Average Spend Per Visit', type: 'currency', description: 'Mean spend per completed reservation', symbol: 'EUR' },
    { name: 'Favorite Time Slot', type: 'singleLineText', description: 'Most common reservation time (e.g., "19:00-20:00")' },
    { name: 'Favorite Day', type: 'singleLineText', description: 'Most common day of week (e.g., "Friday")' },
    { name: 'VIP Status', type: 'checkbox', description: 'High-value customer flag' },
    {
      name: 'No Show Risk Score',
      type: 'formula',
      description: 'Historical no-show probability (0.00 to 1.00)',
      formula: 'IF({Total Reservations} > 0, {No Shows} / {Total Reservations}, 0.15)'
    },
    {
      name: 'Days Since Last Visit',
      type: 'formula',
      description: 'Days since last completed reservation',
      formula: 'IF({Last Visit Date}, DATETIME_DIFF(TODAY(), {Last Visit Date}, "days"), 0)'
    },
    { name: 'Notes', type: 'multilineText', description: 'Special preferences, allergies, etc.' },
    { name: 'Created At', type: 'createdTime', description: 'Record creation timestamp' },
    { name: 'Last Modified', type: 'lastModifiedTime', description: 'Last update timestamp' }
  ]
};

/**
 * Check if Customer History table exists
 */
async function checkTableExists() {
  try {
    console.log('\n🔍 Checking if Customer History table exists...');

    // Try to fetch records from the table
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CUSTOMER_HISTORY_TABLE_NAME)}?maxRecords=1`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    console.log('✅ Customer History table EXISTS!');
    console.log(`   Found ${response.data.records.length} records`);
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ Customer History table does NOT exist');
      return false;
    }
    console.error('❌ Error checking table:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Print manual setup instructions
 */
function printSetupInstructions() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 MANUAL SETUP INSTRUCTIONS FOR CUSTOMER HISTORY TABLE');
  console.log('='.repeat(80));
  console.log('\n⚠️  Airtable REST API does not support creating tables/fields programmatically.');
  console.log('    You must create the table manually using the Airtable web interface.\n');

  console.log('🔗 Step 1: Open your Airtable base');
  console.log(`   https://airtable.com/${AIRTABLE_BASE_ID}\n`);

  console.log('➕ Step 2: Create a new table named "Customer History"\n');

  console.log('📝 Step 3: Add the following 21 fields:\n');

  TABLE_SCHEMA.fields.forEach((field, index) => {
    console.log(`   ${index + 1}. ${field.name}`);
    console.log(`      Type: ${field.type}`);
    console.log(`      Description: ${field.description}`);
    if (field.formula) {
      console.log(`      Formula: ${field.formula}`);
    }
    if (field.precision !== undefined) {
      console.log(`      Precision: ${field.precision} decimal places`);
    }
    if (field.symbol) {
      console.log(`      Currency: ${field.symbol}`);
    }
    console.log('');
  });

  console.log('💡 Step 4: Field Type Mappings:');
  console.log('   - autoNumber → "Autonumber"');
  console.log('   - email → "Email"');
  console.log('   - phoneNumber → "Phone number"');
  console.log('   - singleLineText → "Single line text"');
  console.log('   - date → "Date"');
  console.log('   - number → "Number" (set precision in options)');
  console.log('   - currency → "Currency" (choose EUR)');
  console.log('   - checkbox → "Checkbox"');
  console.log('   - formula → "Formula" (paste formula from above)');
  console.log('   - multilineText → "Long text"');
  console.log('   - createdTime → "Created time"');
  console.log('   - lastModifiedTime → "Last modified time"\n');

  console.log('⚙️  Step 5: Add the table ID to your .env file:');
  console.log('   CUSTOMER_HISTORY_TABLE_ID=tbl...\n');

  console.log('✅ Step 6: Run this script again to verify setup\n');
  console.log('='.repeat(80) + '\n');
}

/**
 * Create test customer records
 */
async function createTestData(tableId) {
  console.log('\n📊 Creating test customer records...');

  const testCustomers = [
    {
      'Email': 'john.smith@example.com',
      'Phone': '+1-555-123-4567',
      'Customer Name': 'John Smith',
      'First Visit Date': '2024-03-15',
      'Last Visit Date': '2025-10-15',
      'Total Reservations': 8,
      'Completed Reservations': 7,
      'No Shows': 0,
      'Cancellations': 1,
      'Average Party Size': 3.5,
      'Total Spend': 1890.00,
      'Average Spend Per Visit': 270.00,
      'Favorite Time Slot': '19:00-20:00',
      'Favorite Day': 'Friday',
      'VIP Status': true,
      'Notes': 'Prefers window seats, vegetarian options'
    },
    {
      'Email': 'sarah.wilson@example.com',
      'Phone': '+1-555-987-6543',
      'Customer Name': 'Sarah Wilson',
      'First Visit Date': '2025-01-10',
      'Last Visit Date': '2025-10-10',
      'Total Reservations': 4,
      'Completed Reservations': 2,
      'No Shows': 2,
      'Cancellations': 0,
      'Average Party Size': 2.0,
      'Total Spend': 240.00,
      'Average Spend Per Visit': 120.00,
      'Favorite Time Slot': '20:00-21:00',
      'Favorite Day': 'Saturday',
      'VIP Status': false,
      'Notes': 'High no-show risk, consider deposit'
    },
    {
      'Email': 'david.lee@example.com',
      'Phone': '+1-555-456-7890',
      'Customer Name': 'David Lee',
      'First Visit Date': '2024-06-20',
      'Last Visit Date': '2025-10-18',
      'Total Reservations': 12,
      'Completed Reservations': 12,
      'No Shows': 0,
      'Cancellations': 0,
      'Average Party Size': 4.2,
      'Total Spend': 3240.00,
      'Average Spend Per Visit': 270.00,
      'Favorite Time Slot': '18:00-19:00',
      'Favorite Day': 'Thursday',
      'VIP Status': true,
      'Notes': 'Excellent customer, business dinners'
    }
  ];

  try {
    const response = await axios.post(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId || encodeURIComponent(CUSTOMER_HISTORY_TABLE_NAME)}`,
      {
        records: testCustomers.map(fields => ({ fields }))
      },
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Created ${response.data.records.length} test customer records`);
    response.data.records.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.fields['Customer Name']} (${record.id})`);
      console.log(`      No-Show Risk: ${(record.fields['No Show Risk Score'] || 0).toFixed(2)}`);
      console.log(`      VIP: ${record.fields['VIP Status'] ? 'Yes' : 'No'}`);
    });

    return true;
  } catch (error) {
    console.error('❌ Error creating test data:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 CUSTOMER HISTORY TABLE SETUP');
  console.log('='.repeat(80));

  // Check environment variables
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('\n❌ Missing required environment variables:');
    console.error('   AIRTABLE_API_KEY:', AIRTABLE_API_KEY ? '✅' : '❌');
    console.error('   AIRTABLE_BASE_ID:', AIRTABLE_BASE_ID ? '✅' : '❌');
    console.error('\n   Please check your .env file\n');
    process.exit(1);
  }

  // Check if table exists
  const exists = await checkTableExists();

  if (!exists) {
    // Table doesn't exist - print setup instructions
    printSetupInstructions();
  } else {
    // Table exists - offer to create test data
    console.log('\n✅ Customer History table is set up!');

    // Ask if user wants to create test data
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\n📊 Would you like to create 3 test customer records? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        await createTestData();
      } else {
        console.log('\n✅ Skipping test data creation');
      }
      readline.close();

      console.log('\n' + '='.repeat(80));
      console.log('✅ Setup script complete!');
      console.log('='.repeat(80) + '\n');
    });
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { checkTableExists, createTestData };
