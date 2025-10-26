const axios = require('axios');

const AIRTABLE_API_KEY = 'patAvc1iw5cPE146l.6450b0bd5b8ffa2186708971d294c23f29011e5e849d55124e1a0552753d07bf';
const AIRTABLE_BASE_ID = 'appm7zo5vOf3c3rqm';
const RESERVATIONS_TABLE_ID = 'tbloL2huXFYQluomn';

async function testMLUpdate() {
  try {
    // Use record ID from our check: rec65dIJCw15v7tl6 (Test ML Customer 2)
    const recordId = 'rec65dIJCw15v7tl6';

    console.log('Testing direct ML field update...\n');

    const updateData = {
      fields: {
        'ML Risk Score': 75,
        'ML Risk Level': 'high',
        'ML Confidence': 85,
        'ML Model Version': '1.0.0-test'
      }
    };

    console.log('Attempting to update:', JSON.stringify(updateData, null, 2));

    const response = await axios.patch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}/${recordId}`,
      updateData,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ UPDATE SUCCESSFUL!');
    console.log('Updated fields:', JSON.stringify(response.data.fields, null, 2));

    // Read it back to verify
    console.log('\nReading back to verify...');
    const readResponse = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`
        }
      }
    );

    const fields = readResponse.data.fields;
    console.log('\nVerification:');
    console.log(`ML Risk Score: ${fields['ML Risk Score']}`);
    console.log(`ML Risk Level: ${fields['ML Risk Level']}`);
    console.log(`ML Confidence: ${fields['ML Confidence']}`);
    console.log(`ML Model Version: ${fields['ML Model Version']}`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testMLUpdate();
