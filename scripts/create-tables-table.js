/**
 * Create Restaurant Tables Table in Airtable
 *
 * Creates a new table with proper fields for restaurant table management
 */

const https = require('https');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.airtable.com',
      port: 443,
      path: path,
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
          const result = { status: res.statusCode, data: JSON.parse(body) };
          resolve(result);
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

async function createTablesTable() {
  console.log('🏗️  Creating Restaurant Tables table in Airtable...\n');

  const tableDefinition = {
    name: "Restaurant Tables",
    fields: [
      {
        name: "Table Number",
        type: "singleLineText"
      },
      {
        name: "Capacity",
        type: "number",
        options: {
          precision: 0
        }
      },
      {
        name: "Location",
        type: "singleSelect",
        options: {
          choices: [
            { name: "Indoor", color: "blueLight2" },
            { name: "Patio", color: "greenLight2" },
            { name: "Bar", color: "orangeLight2" }
          ]
        }
      },
      {
        name: "Status",
        type: "singleSelect",
        options: {
          choices: [
            { name: "Available", color: "greenLight2" },
            { name: "Occupied", color: "redLight2" },
            { name: "Being Cleaned", color: "yellowLight2" },
            { name: "Reserved", color: "blueLight2" }
          ]
        }
      },
      {
        name: "Is Active",
        type: "checkbox",
        options: {
          icon: "check",
          color: "greenBright"
        }
      },
      {
        name: "Current Service ID",
        type: "singleLineText"
      }
    ]
  };

  const result = await makeRequest(
    'POST',
    `/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    tableDefinition
  );

  if (result.status === 200) {
    console.log('✅ Table created successfully!');
    console.log(`📋 Table ID: ${result.data.id}`);
    console.log(`📋 Table Name: ${result.data.name}`);
    console.log('\n🔑 Update your Vercel environment variable:');
    console.log(`   TABLES_TABLE_ID=${result.data.id}`);
    return result.data.id;
  } else {
    console.error(`❌ Failed (${result.status}):`, result.data);
    return null;
  }
}

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('❌ Missing environment variables!');
  console.error('Usage: AIRTABLE_API_KEY=xxx AIRTABLE_BASE_ID=xxx node scripts/create-tables-table.js');
  process.exit(1);
}

createTablesTable().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
