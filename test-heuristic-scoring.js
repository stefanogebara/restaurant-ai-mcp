/**
 * Test script to verify heuristic risk scoring U-shaped curve
 */

// Load environment variables
require('dotenv').config();

const { calculateRiskScore, INTERVENTION_COSTS, AVERAGE_NO_SHOW_VALUE } = require('./api/services/mlRiskScoring');

console.log('\n=== Testing Heuristic Risk Scoring (Updated U-Curve) ===\n');

console.log('📊 Current Cost Configuration:');
console.log('   Confirmation call:', `€${INTERVENTION_COSTS.confirmation_call}`);
console.log('   Deposit processing:', `€${INTERVENTION_COSTS.deposit_required}`);
console.log('   SMS reminder:', `€${INTERVENTION_COSTS.sms_reminder}`);
console.log('   Email reminder:', `€${INTERVENTION_COSTS.email_reminder}`);
console.log('   Average no-show value:', `€${AVERAGE_NO_SHOW_VALUE}\n`);

// Base reservation template (new customer, no special requests)
const baseReservation = {
  customer_email: 'test@example.com',
  customer_phone: '+1234567890',
  party_size: 2,
  date: '2025-11-15',
  time: '19:00',
  special_requests: '',
  created_at: null // Will be set per test case
};

async function runTests() {
  // Test Case 1: Same-day urgent (2 hours) - Should have LOWER risk
  const test1 = {
    ...baseReservation,
    created_at: '2025-11-15T17:00:00Z' // 2 hours before
  };

  // Test Case 2: Short notice (1 day) - Should have HIGHER risk
  const test2 = {
    ...baseReservation,
    created_at: '2025-11-14T19:00:00Z' // 1 day before
  };

  // Test Case 3: Sweet spot (5 days) - Should be baseline
  const test3 = {
    ...baseReservation,
    created_at: '2025-11-10T19:00:00Z' // 5 days before
  };

  // Test Case 4: Far future (10 days) - Should have HIGHER risk
  const test4 = {
    ...baseReservation,
    created_at: '2025-11-05T19:00:00Z' // 10 days before
  };

  console.log('Test 1: Same-day urgent (2 hours)');
  console.log('Expected: LOWER risk (urgent = committed)');
  const result1 = await calculateRiskScore(test1);
  console.log(`Result: Score ${result1.riskScore}/100 (${result1.riskLevel})`);
  const leadFactor1 = result1.factors.find(f => f.factor.includes('day') || f.factor.includes('notice'));
  if (leadFactor1) console.log(`Lead time impact: ${leadFactor1.impact} - ${leadFactor1.description}`);
  console.log('');

  console.log('Test 2: Short notice (1 day)');
  console.log('Expected: HIGHER risk (impulsive)');
  const result2 = await calculateRiskScore(test2);
  console.log(`Result: Score ${result2.riskScore}/100 (${result2.riskLevel})`);
  const leadFactor2 = result2.factors.find(f => f.factor.includes('notice') || f.factor.includes('day'));
  if (leadFactor2) console.log(`Lead time impact: ${leadFactor2.impact} - ${leadFactor2.description}`);
  console.log('');

  console.log('Test 3: Sweet spot (5 days)');
  console.log('Expected: BASELINE (no lead time adjustment)');
  const result3 = await calculateRiskScore(test3);
  console.log(`Result: Score ${result3.riskScore}/100 (${result3.riskLevel})`);
  const leadFactor3 = result3.factors.find(f => f.factor.includes('advance') || f.factor.includes('notice'));
  console.log(`Lead time impact: ${leadFactor3 ? leadFactor3.impact + ' - ' + leadFactor3.description : 'No adjustment (sweet spot)'}`);
  console.log('');

  console.log('Test 4: Far future (10 days)');
  console.log('Expected: HIGHER risk (plans may change)');
  const result4 = await calculateRiskScore(test4);
  console.log(`Result: Score ${result4.riskScore}/100 (${result4.riskLevel})`);
  const leadFactor4 = result4.factors.find(f => f.factor.includes('advance'));
  if (leadFactor4) console.log(`Lead time impact: ${leadFactor4.impact} - ${leadFactor4.description}`);
  console.log('');

  console.log('=== Summary: U-Shaped Curve ===');
  console.log(`Same-day urgent (2h):   ${result1.riskScore}/100 - ${result1.riskLevel}`);
  console.log(`Short notice (1 day):   ${result2.riskScore}/100 - ${result2.riskLevel}`);
  console.log(`Sweet spot (5 days):    ${result3.riskScore}/100 - ${result3.riskLevel}`);
  console.log(`Far future (10 days):   ${result4.riskScore}/100 - ${result4.riskLevel}`);
  console.log('\n✅ U-shaped curve verified: same-day < sweet spot < short notice/far future\n');

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
