/**
 * Airtable to Supabase Migration using MCP
 * This script will output SQL that can be executed via Supabase MCP
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

// SQL escaping helper
const escapeSQL = (str) => {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'string') {
    return `'${str.replace(/'/g, "''")}'`;
  }
  return str;
};

async function main() {
  console.log('🚀 Fetching data from Airtable...\n');

  // 1. Fetch Tables
  const tablesResult = await airtableRequest(process.env.TABLES_TABLE_ID);
  console.log(`✅ Found ${tablesResult.records.length} tables\n`);

  // 2. Fetch Reservations
  const reservationsResult = await airtableRequest(process.env.RESERVATIONS_TABLE_ID);
  console.log(`✅ Found ${reservationsResult.records.length} reservations\n`);

  // Build SQL for Tables
  console.log('-- ============================================');
  console.log('-- TABLES DATA');
  console.log('-- ============================================\n');

  tablesResult.records.forEach(r => {
    const tableNum = r.fields['Table Number'];
    const capacity = r.fields['Capacity'];
    const location = r.fields['Location'] || 'Main';
    const status = (r.fields['Status'] || 'available').toLowerCase().replace(/\s+/g, '_');

    if (tableNum && capacity) {  // Only insert valid records
      console.log(`INSERT INTO tables (table_number, capacity, location, status, is_active) VALUES (${tableNum}, ${capacity}, ${escapeSQL(location)}, ${escapeSQL(status)}, true);`);
    }
  });

  // Build SQL for Reservations
  console.log('\n-- ============================================');
  console.log('-- RESERVATIONS DATA');
  console.log('-- ============================================\n');

  reservationsResult.records.forEach(r => {
    const resId = escapeSQL(r.fields['Reservation ID']);
    const name = escapeSQL(r.fields['Customer Name']);
    const phone = escapeSQL(r.fields['Customer Phone']);
    const email = escapeSQL(r.fields['Customer Email']);
    const partySize = r.fields['Party Size'] || 2;
    const date = escapeSQL(r.fields['Date']);
    const time = escapeSQL(r.fields['Time']);
    const status = escapeSQL((r.fields['Status'] || 'pending').toLowerCase().replace(/-/g, '_'));
    const specialRequests = escapeSQL(r.fields['Special Requests']);

    if (resId !== 'NULL' && date !== 'NULL' && time !== 'NULL') {  // Only valid reservations
      console.log(`INSERT INTO reservations (reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, status, special_requests) VALUES (${resId}, ${name}, ${phone}, ${email}, ${partySize}, ${date}, ${time}, ${status}, ${specialRequests});`);
    }
  });

  console.log('\n✅ SQL generation complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Tables: ${tablesResult.records.filter(r => r.fields['Table Number']).length} valid records`);
  console.log(`   - Reservations: ${reservationsResult.records.filter(r => r.fields['Reservation ID']).length} valid records`);
  console.log('\n💡 Copy the SQL above and execute via Supabase MCP execute_sql tool');
}

main();
