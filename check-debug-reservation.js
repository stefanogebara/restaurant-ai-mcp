const axios = require('axios');

const AIRTABLE_API_KEY = 'patAvc1iw5cPE146l.6450b0bd5b8ffa2186708971d294c23f29011e5e849d55124e1a0552753d07bf';
const AIRTABLE_BASE_ID = 'appm7zo5vOf3c3rqm';
const RESERVATIONS_TABLE_ID = 'tbloL2huXFYQluomn';

async function checkDebugReservation() {
  try {
    const filter = encodeURIComponent("{Customer Name}='Debug Test Customer'");
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}?filterByFormula=${filter}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    if (response.data.records && response.data.records.length > 0) {
      const fields = response.data.records[0].fields;
      console.log('=== NEW RESERVATION CHECK ===\n');
      console.log(`Customer: ${fields['Customer Name']}`);
      console.log(`Reservation ID: ${fields['Reservation ID']}`);
      console.log(`ML Risk Score: ${fields['ML Risk Score'] ?? 'MISSING'}`);
      console.log(`ML Risk Level: ${fields['ML Risk Level'] ?? 'MISSING'}`);
      console.log(`ML Confidence: ${fields['ML Confidence'] ?? 'MISSING'}`);
      console.log(`ML Model Version: ${fields['ML Model Version'] ?? 'MISSING'}`);

      const mlFields = Object.keys(fields).filter(k => k.includes('ML') || k.includes('Risk') || k.includes('Confidence'));
      console.log(`\nML fields present: ${mlFields.join(', ')}`);
    } else {
      console.log('No reservation found for Debug Test Customer');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDebugReservation();
