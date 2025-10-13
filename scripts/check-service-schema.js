require('dotenv').config();
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SERVICE_RECORDS_TABLE_ID = process.env.SERVICE_RECORDS_TABLE_ID || 'tblServiceRecords';

async function checkServiceRecordsSchema() {
  try {
    // Get the first record to see field names
    const response = await axios({
      method: 'GET',
      url: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SERVICE_RECORDS_TABLE_ID}?maxRecords=1`,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n=== Service Records Table Schema ===\n');

    if (response.data.records && response.data.records.length > 0) {
      const fields = response.data.records[0].fields;
      console.log('Available fields:');
      Object.keys(fields).forEach(fieldName => {
        console.log(`  - "${fieldName}": ${typeof fields[fieldName]} = ${JSON.stringify(fields[fieldName])}`);
      });
    } else {
      console.log('No records found. Checking table metadata...');

      // Try to get table schema via meta API
      const metaResponse = await axios({
        method: 'GET',
        url: `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      });

      const serviceTable = metaResponse.data.tables.find(t => t.id === SERVICE_RECORDS_TABLE_ID);
      if (serviceTable) {
        console.log('\nTable fields from metadata:');
        serviceTable.fields.forEach(field => {
          console.log(`  - "${field.name}": ${field.type}`);
        });
      }
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkServiceRecordsSchema();
