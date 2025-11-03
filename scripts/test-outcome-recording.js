/**
 * Test ML Outcome Recording
 *
 * Tests the outcome recording API with sample data
 */

require('dotenv').config();

async function testOutcomeRecording() {
  console.log('\n🧪 Testing ML Outcome Recording API\n');
  console.log('='.repeat(60));

  const baseURL = 'http://localhost:3001';

  // Test 1: Record a successful intervention (customer showed up)
  console.log('\n📝 Test 1: Customer showed up (intervention worked)');
  const test1 = await fetch(`${baseURL}/api/ml-outcomes/record-outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservation_id: 'RES-20251017-9854',
      actual_outcome: 'showed_up',
      intervention_taken: true,
      intervention_type: 'confirmation_call',
      intervention_cost: 3.00,
      notes: 'Confirmation call made 24 hours before'
    })
  });

  const result1 = await test1.json();
  console.log('Response:', JSON.stringify(result1, null, 2));

  // Wait a second between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Get ROI summary
  console.log('\n\n📊 Test 2: Get ROI Summary');
  const test2 = await fetch(`${baseURL}/api/ml-outcomes/roi-summary`);
  const result2 = await test2.json();
  console.log('Response:', JSON.stringify(result2, null, 2));

  // Test 3: Record a no-show without intervention
  console.log('\n\n📝 Test 3: No-show without intervention (missed opportunity)');
  const test3 = await fetch(`${baseURL}/api/ml-outcomes/record-outcome`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservation_id: 'RES-20251024-8977',
      actual_outcome: 'no_show',
      intervention_taken: false,
      intervention_type: 'none',
      intervention_cost: 0,
      notes: 'High risk reservation but no intervention was performed'
    })
  });

  const result3 = await test3.json();
  console.log('Response:', JSON.stringify(result3, null, 2));

  // Test 4: Get updated ROI summary
  console.log('\n\n📊 Test 4: Get Updated ROI Summary');
  const test4 = await fetch(`${baseURL}/api/ml-outcomes/roi-summary`);
  const result4 = await test4.json();
  console.log('Response:', JSON.stringify(result4, null, 2));

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ All tests complete!\n');
}

// Run tests
testOutcomeRecording().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
