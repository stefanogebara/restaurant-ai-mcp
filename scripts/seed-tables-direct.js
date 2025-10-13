/**
 * Seed Tables Directly to Airtable
 *
 * This script adds sample tables directly to Airtable
 * Run with: AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx TABLES_TABLE_ID=xxx node scripts/seed-tables-direct.js
 */

const https = require('https');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLES_TABLE_ID = process.env.TABLES_TABLE_ID;

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.airtable.com',
      port: 443,
      path: `/v0/${AIRTABLE_BASE_ID}/${TABLES_TABLE_ID}${path}`,
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

async function seedTables() {
  console.log('🌱 Creating 12 sample tables in Airtable...\n');

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
  const batch1 = records.slice(0, 10);
  const batch2 = records.slice(10, 12);

  console.log('📊 Creating first 10 tables...');
  const result1 = await makeRequest('POST', '', { records: batch1 });

  if (result1.status === 200) {
    console.log(`✅ Created ${batch1.length} tables`);
  } else {
    console.error(`❌ Failed (${result1.status}):`, result1.data);
    return;
  }

  console.log('📊 Creating last 2 tables...');
  const result2 = await makeRequest('POST', '', { records: batch2 });

  if (result2.status === 200) {
    console.log(`✅ Created ${batch2.length} tables`);
  } else {
    console.error(`❌ Failed (${result2.status}):`, result2.data);
    return;
  }

  console.log('\n✨ All tables created successfully!\n');
  console.log('📍 Total Capacity: 42 seats');
  console.log('📍 Indoor: 26 seats (6 tables)');
  console.log('📍 Patio: 12 seats (4 tables)');
  console.log('📍 Bar: 4 seats (2 tables)');
  console.log('\n🚀 Visit https://restaurant-ai-mcp.vercel.app/ to see them!');
}

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !TABLES_TABLE_ID) {
  console.error('❌ Missing environment variables!');
  console.error('Usage: AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx TABLES_TABLE_ID=xxx node scripts/seed-tables-direct.js');
  process.exit(1);
}

seedTables().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
