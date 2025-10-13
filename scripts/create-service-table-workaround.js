/**
 * Workaround: Create a dummy Service Records record to initialize the table
 *
 * This assumes the table exists but is empty. If it doesn't exist, you'll need
 * to create it manually via the Airtable web interface.
 */

const https = require('https');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SERVICE_RECORDS_TABLE_NAME = 'Service%20Records'; // URL encoded

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.airtable.com',
      port: 443,
      path: `/v0/${AIRTABLE_BASE_ID}/${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function createServiceRecordsTable() {
  console.log('\n🔧 Attempting to create Service Records table...\n');

  // Try to create a test record - this will tell us if the table exists
  const testRecord = {
    records: [{
      fields: {
        'Service ID': 'SVC-TEST-0001',
        'Customer Name': 'Test Customer',
        'Customer Phone': '555-0000',
        'Party Size': 2,
        'Table IDs': '1',
        'Seated At': new Date().toISOString(),
        'Estimated Departure': new Date(Date.now() + 90 * 60000).toISOString(),
        'Status': 'Active'
      }
    }]
  };

  console.log('📝 Attempting to create test record...');
  const result = await makeRequest('POST', SERVICE_RECORDS_TABLE_NAME, testRecord);

  if (result.status === 200) {
    console.log('✅ Success! Service Records table exists and record created!');
    console.log('Record ID:', result.data.records[0].id);
    console.log('\nTable is ready to use. You can delete this test record from Airtable if needed.');

    // Get the table ID from a list request
    console.log('\n🔍 Getting table ID...');
    const listResult = await makeRequest('GET', `${SERVICE_RECORDS_TABLE_NAME}?maxRecords=1`, null);

    if (listResult.status === 200) {
      // The table ID is in the URL, but we need to get it from the base metadata
      console.log('\n✅ Table is accessible via API');
      console.log('\nAdd to Vercel environment variables:');
      console.log(`SERVICE_RECORDS_TABLE_ID=${SERVICE_RECORDS_TABLE_NAME.replace('%20', ' ')}`);
      console.log('\nOr use the table name directly: "Service Records"');
    }

    return;
  }

  if (result.status === 404 || (result.data.error && result.data.error.type === 'TABLE_NOT_FOUND')) {
    console.log('❌ Table does not exist.');
    console.log('\nThe Service Records table needs to be created manually in Airtable.');
    console.log('Please follow the instructions in AIRTABLE_SETUP.md\n');
    return;
  }

  if (result.data.error && result.data.error.type === 'INVALID_REQUEST_BODY') {
    console.log('⚠️  Table exists but field names might be wrong.');
    console.log('Error:', result.data.error.message);
    console.log('\nPlease check the table schema in Airtable matches the expected fields.\n');
    return;
  }

  console.log('❌ Unexpected error:', result.data);
}

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing environment variables!');
  console.error('Required: AIRTABLE_API_KEY, AIRTABLE_BASE_ID');
  process.exit(1);
}

createServiceRecordsTable().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
