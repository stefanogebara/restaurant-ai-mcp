/**
 * Insert Airtable data into Supabase
 * Uses Supabase client to insert all reservations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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
    console.error(`Error fetching from Airtable: ${error.message}`);
    return { success: false, records: [] };
  }
};

async function main() {
  console.log('\n🚀 Starting Supabase Data Insertion\n');

  // Fetch Reservations from Airtable
  console.log('📅 Fetching Reservations from Airtable...');
  const reservationsResult = await airtableRequest(process.env.RESERVATIONS_TABLE_ID);

  if (reservationsResult.success && reservationsResult.records.length > 0) {
    console.log(`✅ Found ${reservationsResult.records.length} reservations in Airtable`);

    const reservations = [];
    reservationsResult.records.forEach(r => {
      const resId = r.fields['Reservation ID'];
      const name = r.fields['Customer Name'] || '';
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

    console.log(`\n📊 Inserting ${reservations.length} reservations into Supabase...`);

    // Insert in batches of 10
    for (let i = 0; i < reservations.length; i += 10) {
      const batch = reservations.slice(i, i + 10);
      const { data, error } = await supabase
        .from('reservations')
        .upsert(batch, { onConflict: 'reservation_id' });

      if (error) {
        console.error(`❌ Error inserting batch ${i / 10 + 1}:`, error.message);
      } else {
        console.log(`✅ Inserted batch ${i / 10 + 1} (${batch.length} reservations)`);
      }
    }

    // Verify final count
    const { count, error } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log(`\n✅ Total reservations in Supabase: ${count}`);
    }
  }

  console.log('\n✅ Migration complete!\n');
}

main().catch(console.error);
