require('dotenv').config();
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

async function createServiceRecordsTable() {
  try {
    console.log('\n=== Creating Service Records Table ===\n');

    const response = await axios({
      method: 'POST',
      url: `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: 'Service Records',
        description: 'Tracks active dining sessions from seating to departure',
        fields: [
          {
            name: 'Service ID',
            type: 'singleLineText',
            description: 'Unique service identifier (SVC-YYYYMMDD-####)'
          },
          {
            name: 'Reservation ID',
            type: 'singleLineText',
            description: 'Optional reservation ID if this was from a reservation'
          },
          {
            name: 'Customer Name',
            type: 'singleLineText'
          },
          {
            name: 'Customer Phone',
            type: 'phoneNumber'
          },
          {
            name: 'Party Size',
            type: 'number',
            options: {
              precision: 0
            }
          },
          {
            name: 'Table IDs',
            type: 'multipleRecordLinks',
            options: {
              linkedTableId: process.env.TABLES_TABLE_ID
            }
          },
          {
            name: 'Seated At',
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
            name: 'Estimated Departure',
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
            name: 'Departed At',
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
            name: 'Special Requests',
            type: 'multilineText'
          },
          {
            name: 'Status',
            type: 'singleSelect',
            options: {
              choices: [
                { name: 'Active', color: 'greenBright' },
                { name: 'Completed', color: 'blueBright' },
                { name: 'Cancelled', color: 'redBright' }
              ]
            }
          }
        ]
      }
    });

    console.log('✅ Service Records table created successfully!');
    console.log('Table ID:', response.data.id);
    console.log('\nAdd this to your .env file:');
    console.log(`SERVICE_RECORDS_TABLE_ID=${response.data.id}`);

  } catch (error) {
    console.error('❌ Error creating table:', error.response?.data || error.message);
  }
}

createServiceRecordsTable();
