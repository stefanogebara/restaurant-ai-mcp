const axios = require('axios');

const AIRTABLE_API_KEY = 'patAvc1iw5cPE146l.6450b0bd5b8ffa2186708971d294c23f29011e5e849d55124e1a0552753d07bf';
const AIRTABLE_BASE_ID = 'appm7zo5vOf3c3rqm';
const RESERVATIONS_TABLE_ID = 'tbloL2huXFYQluomn';

async function checkMLFields() {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    const targetIds = [
      'RES-20251025-4450',
      'RES-20251025-4356',
      'RES-20251024-0997',
      'RES-20251025-5854',
      'RES-20251025-4906'
    ];

    console.log('=== CHECKING BATCH PREDICTED RESERVATIONS ===\n');

    let found = 0;
    for (const record of response.data.records) {
      const resId = record.fields['Reservation ID'];
      if (targetIds.includes(resId)) {
        found++;
        const fields = record.fields;
        console.log(`Customer: ${fields['Customer Name'] || 'N/A'}`);
        console.log(`Reservation ID: ${resId}`);
        console.log(`Record ID: ${record.id}`);
        console.log(`ML Risk Score: ${fields['ML Risk Score'] ?? 'MISSING'}`);
        console.log(`ML Risk Level: ${fields['ML Risk Level'] ?? 'MISSING'}`);
        console.log(`ML Confidence: ${fields['ML Confidence'] ?? 'MISSING'}`);
        console.log(`ML Model Version: ${fields['ML Model Version'] ?? 'MISSING'}`);

        const mlFields = Object.keys(fields).filter(k =>
          k.includes('ML') || k.includes('Risk') || k.includes('Confidence')
        );

        if (mlFields.length > 0) {
          console.log(`✅ HAS ML DATA: ${mlFields.join(', ')}`);
        } else {
          console.log('❌ NO ML FIELDS FOUND!');
        }
        console.log('---\n');
      }
    }

    console.log(`\nFound ${found}/${targetIds.length} target reservations`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMLFields();
