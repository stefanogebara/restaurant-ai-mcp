/**
 * Test ML Prediction Integration
 * Tests the reservation creation with ML prediction
 */

const axios = require('axios');

async function testMLIntegration() {
  console.log('🧪 Testing ML Integration in Reservation Creation\n');

  const testReservation = {
    date: '2025-11-01',
    time: '19:00',
    party_size: 4,
    customer_name: 'Test ML Customer',
    customer_phone: '+1555999' + Math.floor(Math.random() * 10000),
    customer_email: `test${Date.now()}@mltest.com`,
    special_requests: 'Testing ML integration'
  };

  try {
    console.log('📝 Creating reservation:', testReservation);

    // Call local API
    const response = await axios.post(
      'http://localhost:3001/api/reservations?action=create',
      testReservation
    );

    console.log('\n✅ Reservation created successfully!');
    console.log('Response:', response.data);

    // Wait a moment for async ML processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n📊 Check Airtable to verify:');
    console.log('1. Reservation was created');
    console.log('2. Customer History was created/updated');
    console.log('3. ML prediction fields are populated:');
    console.log('   - No Show Risk Score');
    console.log('   - No Show Risk Level');
    console.log('   - Prediction Confidence');
    console.log('   - ML Model Version');

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testMLIntegration();
