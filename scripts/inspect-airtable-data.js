/**
 * Inspect Airtable Data Structure
 * Shows what fields and values actually exist
 */

require('dotenv').config();
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID || 'tbloL2huXFYQluomn';

async function inspectData() {
  console.log('🔍 Inspecting Airtable Reservations Data\n');

  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}?maxRecords=5`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    const records = response.data.records;

    console.log(`Found ${records.length} sample records\n`);

    records.forEach((record, index) => {
      console.log(`\n📋 Record ${index + 1}:`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Fields:`);

      Object.entries(record.fields).forEach(([key, value]) => {
        console.log(`      ${key}: ${JSON.stringify(value)}`);
      });
    });

    // Show unique status values
    console.log('\n\n📊 Analyzing Status Field...\n');

    const allRecords = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    const statusValues = new Set();
    const statusFieldNames = new Set();

    allRecords.data.records.forEach(record => {
      Object.keys(record.fields).forEach(key => {
        if (key.toLowerCase().includes('status')) {
          statusFieldNames.add(key);
          statusValues.add(record.fields[key]);
        }
      });
    });

    console.log('Status field names found:');
    statusFieldNames.forEach(name => console.log(`   - ${name}`));

    console.log('\nStatus values found:');
    statusValues.forEach(value => console.log(`   - ${value}`));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspectData();
