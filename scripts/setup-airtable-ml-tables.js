/**
 * Airtable ML Setup Script
 *
 * Automatically creates Customer History table and adds ML fields to Reservations
 * Run once to set up database for ML system
 */

const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;

// ============================================================================
// STEP 1: CREATE CUSTOMER HISTORY TABLE
// ============================================================================

async function createCustomerHistoryTable() {
  console.log('\n📋 STEP 1: Creating Customer History table...\n');

  try {
    const response = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        name: 'Customer History',
        description: 'Customer behavioral history and stats for ML predictions',
        fields: [
          {
            name: 'Email',
            type: 'email'
          },
          {
            name: 'Phone',
            type: 'phoneNumber'
          },
          {
            name: 'Customer Name',
            type: 'singleLineText'
          },
          {
            name: 'First Visit Date',
            type: 'date',
            options: {
              dateFormat: {
                name: 'iso'
              }
            }
          },
          {
            name: 'Last Visit Date',
            type: 'date',
            options: {
              dateFormat: {
                name: 'iso'
              }
            }
          },
          {
            name: 'Total Reservations',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'Completed Reservations',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'No Shows',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'Cancellations',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'Average Party Size',
            type: 'number',
            options: {
              precision: 1
            }
          },
          {
            name: 'Total Spend',
            type: 'currency',
            options: {
              precision: 2,
              symbol: '$'
            }
          },
          {
            name: 'Average Spend Per Visit',
            type: 'currency',
            options: {
              precision: 2,
              symbol: '$'
            }
          },
          {
            name: 'Favorite Time Slot',
            type: 'singleLineText'
          },
          {
            name: 'Favorite Day',
            type: 'singleLineText'
          },
          {
            name: 'VIP Status',
            type: 'checkbox',
            options: {
              icon: 'star',
              color: 'yellowBright'
            }
          },
          {
            name: 'No Show Risk Score',
            type: 'number',
            options: {
              precision: 3
            }
          },
          {
            name: 'Days Since Last Visit',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'Notes',
            type: 'multilineText'
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const tableId = response.data.id;
    console.log('✅ Customer History table created successfully!');
    console.log(`   Table ID: ${tableId}`);
    console.log(`   Name: ${response.data.name}`);
    console.log(`   Fields: ${response.data.fields.length} fields created`);

    return tableId;

  } catch (error) {
    if (error.response?.status === 422 && error.response?.data?.error?.message?.includes('already exists')) {
      console.log('⚠️  Customer History table already exists');

      // Find the existing table
      const tables = await axios.get(
        `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
        {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`
          }
        }
      );

      const customerHistoryTable = tables.data.tables.find(t => t.name === 'Customer History');
      if (customerHistoryTable) {
        console.log(`   Using existing table ID: ${customerHistoryTable.id}`);
        return customerHistoryTable.id;
      }
    }

    console.error('❌ Error creating Customer History table:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================================================
// STEP 2: ADD ML FIELDS TO RESERVATIONS TABLE
// ============================================================================

async function addMLFieldsToReservations(customerHistoryTableId) {
  console.log('\n📋 STEP 2: Adding ML fields to Reservations table...\n');

  const fieldsToAdd = [
    {
      name: 'Customer History',
      type: 'multipleRecordLinks',
      options: {
        linkedTableId: customerHistoryTableId
      }
    },
    {
      name: 'Booking Created At',
      type: 'dateTime',
      options: {
        dateFormat: {
          name: 'iso'
        },
        timeFormat: {
          name: '24hour'
        },
        timeZone: 'utc'
      }
    },
    {
      name: 'Booking Lead Time Hours',
      type: 'number',
      options: {
        precision: 1
      }
    },
    {
      name: 'Is Repeat Customer',
      type: 'checkbox',
      options: {
        icon: 'check',
        color: 'greenBright'
      }
    },
    {
      name: 'Previous Visit Count',
      type: 'number',
      options: {
        precision: 0
      }
    },
    {
      name: 'Previous No Show Count',
      type: 'number',
      options: {
        precision: 0
      }
    },
    {
      name: 'Customer No Show Rate',
      type: 'number',
      options: {
        precision: 3
      }
    },
    {
      name: 'Is Special Occasion',
      type: 'checkbox',
      options: {
        icon: 'star',
        color: 'yellowBright'
      }
    },
    {
      name: 'Occasion Type',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'birthday' },
          { name: 'anniversary' },
          { name: 'celebration' },
          { name: 'business' },
          { name: 'none' }
        ]
      }
    },
    {
      name: 'Confirmation Sent At',
      type: 'dateTime',
      options: {
        dateFormat: {
          name: 'iso'
        },
        timeFormat: {
          name: '24hour'
        },
        timeZone: 'utc'
      }
    },
    {
      name: 'Confirmation Method',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'email' },
          { name: 'sms' },
          { name: 'call' },
          { name: 'none' }
        ]
      }
    },
    {
      name: 'Confirmation Clicked',
      type: 'checkbox',
      options: {
        icon: 'check',
        color: 'blueBright'
      }
    },
    {
      name: 'Deposit Required',
      type: 'checkbox',
      options: {
        icon: 'dollar',
        color: 'greenBright'
      }
    },
    {
      name: 'Deposit Amount',
      type: 'currency',
      options: {
        precision: 2,
        symbol: '$'
      }
    },
    {
      name: 'Deposit Paid',
      type: 'checkbox',
      options: {
        icon: 'check',
        color: 'greenBright'
      }
    },
    {
      name: 'ML Risk Score',
      type: 'number',
      options: {
        precision: 1
      }
    },
    {
      name: 'ML Risk Level',
      type: 'singleSelect',
      options: {
        choices: [
          { name: 'low' },
          { name: 'medium' },
          { name: 'high' }
        ]
      }
    },
    {
      name: 'ML Confidence',
      type: 'number',
      options: {
        precision: 2
      }
    },
    {
      name: 'ML Model Version',
      type: 'singleLineText'
    },
    {
      name: 'ML Top Factors',
      type: 'multilineText'
    },
    {
      name: 'ML Prediction Timestamp',
      type: 'dateTime',
      options: {
        dateFormat: {
          name: 'iso'
        },
        timeFormat: {
          name: '24hour'
        },
        timeZone: 'utc'
      }
    }
  ];

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const field of fieldsToAdd) {
    try {
      await axios.post(
        `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${RESERVATIONS_TABLE_ID}/fields`,
        field,
        {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Added field: ${field.name}`);
      added++;

    } catch (error) {
      if (error.response?.status === 422 && error.response?.data?.error?.message?.includes('already exists')) {
        console.log(`⚠️  Field already exists: ${field.name}`);
        skipped++;
      } else {
        console.error(`❌ Error adding field "${field.name}":`, error.response?.data?.error?.message || error.message);
        errors++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Added: ${added} fields`);
  console.log(`   Skipped (already exist): ${skipped} fields`);
  console.log(`   Errors: ${errors} fields`);

  return { added, skipped, errors };
}

// ============================================================================
// STEP 3: UPDATE ENVIRONMENT VARIABLES
// ============================================================================

async function updateEnvironmentVariables(customerHistoryTableId) {
  console.log('\n📋 STEP 3: Environment variable configuration...\n');

  console.log('Add this to your Vercel environment variables:');
  console.log('');
  console.log(`CUSTOMER_HISTORY_TABLE_ID=${customerHistoryTableId}`);
  console.log('');
  console.log('You can add it via:');
  console.log('1. Vercel Dashboard → Settings → Environment Variables');
  console.log('2. Or run: vercel env add CUSTOMER_HISTORY_TABLE_ID');
  console.log('');
}

// ============================================================================
// MAIN SETUP
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Airtable ML Setup - Customer History & ML Fields      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !RESERVATIONS_TABLE_ID) {
    console.error('\n❌ Missing required environment variables:');
    console.error('   - AIRTABLE_API_KEY');
    console.error('   - AIRTABLE_BASE_ID');
    console.error('   - RESERVATIONS_TABLE_ID');
    process.exit(1);
  }

  try {
    // Step 1: Create Customer History table
    const customerHistoryTableId = await createCustomerHistoryTable();

    // Step 2: Add ML fields to Reservations
    await addMLFieldsToReservations(customerHistoryTableId);

    // Step 3: Show environment variable
    await updateEnvironmentVariables(customerHistoryTableId);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   ✅ SETUP COMPLETE                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add CUSTOMER_HISTORY_TABLE_ID to Vercel');
    console.log('2. Run backfill script to populate customer history');
    console.log('3. Deploy updated API code');
    console.log('');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
main();
