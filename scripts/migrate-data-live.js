/**
 * Live Airtable to Supabase Data Migration
 * Fetches from Airtable and returns JSON for Supabase MCP insertion
 */

require('dotenv').config();
const axios = require('axios');

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

async function main() {
  console.log('\n🚀 Starting Airtable Data Extraction\n');

  // Fetch Tables data
  console.log('📊 Fetching Tables from Airtable...');
  const tablesResult = await airtableRequest(process.env.TABLES_TABLE_ID);

  const tables = [];
  if (tablesResult.success && tablesResult.records.length > 0) {
    console.log(`✅ Found ${tablesResult.records.length} tables`);

    tablesResult.records.forEach(r => {
      const tableNum = r.fields['Table Number'];
      const capacity = r.fields['Capacity'];

      // Skip records with missing critical data
      if (!tableNum || !capacity) {
        console.log(`⚠️  Skipping table with missing data: ${JSON.stringify(r.fields)}`);
        return;
      }

      const location = r.fields['Location'] || 'Main';
      const status = (r.fields['Status'] || 'available').toLowerCase().replace(' ', '_');

      tables.push({
        table_number: tableNum,
        capacity: capacity,
        location: location,
        status: status,
        is_active: true
      });
    });
  }

  // Fetch Reservations data
  console.log('\n📅 Fetching Reservations from Airtable...');
  const reservationsResult = await airtableRequest(process.env.RESERVATIONS_TABLE_ID);

  const reservations = [];
  if (reservationsResult.success && reservationsResult.records.length > 0) {
    console.log(`✅ Found ${reservationsResult.records.length} reservations`);

    reservationsResult.records.forEach(r => {
      const resId = r.fields['Reservation ID'];
      const name = (r.fields['Customer Name'] || '').replace(/'/g, "''");
      const phone = r.fields['Customer Phone'] || '';
      const email = r.fields['Customer Email'] || null;
      const partySize = r.fields['Party Size'] || 2;
      const date = r.fields['Date'];
      const time = r.fields['Time'];
      const status = (r.fields['Status'] || 'pending').toLowerCase().replace('-', '_');

      // Skip if missing critical data
      if (!resId || !name || !date || !time) {
        return;
      }

      reservations.push({
        reservation_id: resId,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        party_size: partySize,
        date: date,
        time: time,
        status: status
      });
    });
  }

  // Output as JSON
  console.log('\n✅ Data extraction complete!\n');
  console.log(JSON.stringify({
    tables: tables,
    reservations: reservations
  }, null, 2));
}

main();
