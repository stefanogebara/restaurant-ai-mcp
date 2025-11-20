/**
 * Test ML Risk Scoring
 * Quick test to verify the ML predictions actually work
 */

// Load environment variables
require('dotenv').config();

const { calculateRiskScore, calculateAverageNoShowValue, getRecommendedIntervention } = require('./api/services/mlRiskScoring');

async function testMLScoring() {
  console.log('🧪 Testing ML Risk Scoring System\n');

  // Test Case 1: New customer, large party, prime time (HIGH RISK)
  console.log('Test 1: High-Risk Reservation');
  console.log('===============================');
  const highRisk = await calculateRiskScore({
    customer_phone: '+34999888777', // New customer (no history)
    customer_email: 'newcustomer@example.com',
    party_size: 8, // Large party
    date: '2025-11-23', // Saturday
    time: '20:00', // 8 PM prime time
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // Booked 10 days ago (far advance)
  });
  console.log(`Risk Score: ${highRisk.riskScore}/100`);
  console.log(`Risk Level: ${highRisk.riskLevel}`);
  console.log(`Confidence: ${highRisk.confidence}%`);
  console.log('Factors:');
  highRisk.factors.forEach(f => {
    console.log(`  ${f.impact > 0 ? '+' : ''}${f.impact} - ${f.description}`);
  });

  // Test Case 2: Repeat customer, small party, off-peak (LOW RISK)
  console.log('\n\nTest 2: Low-Risk Reservation');
  console.log('============================');
  const lowRisk = await calculateRiskScore({
    customer_phone: '+34600123456', // Existing customer (check customer_history table)
    customer_email: 'regular@example.com',
    party_size: 2, // Small party
    date: '2025-11-21', // Thursday
    time: '19:00', // 7 PM
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // Booked 3 days ago (sweet spot)
  });
  console.log(`Risk Score: ${lowRisk.riskScore}/100`);
  console.log(`Risk Level: ${lowRisk.riskLevel}`);
  console.log(`Confidence: ${lowRisk.confidence}%`);
  console.log('Factors:');
  lowRisk.factors.forEach(f => {
    console.log(`  ${f.impact > 0 ? '+' : ''}${f.impact} - ${f.description}`);
  });

  // Test Case 3: Same-day urgent booking (VERY LOW RISK)
  console.log('\n\nTest 3: Same-Day Urgent (Very Low Risk)');
  console.log('========================================');
  const urgentRisk = await calculateRiskScore({
    customer_phone: '+34111222333',
    customer_email: 'urgent@example.com',
    party_size: 2,
    date: new Date().toISOString().split('T')[0],
    time: new Date(Date.now() + 2 * 60 * 60 * 1000).toTimeString().split(' ')[0].substring(0, 5), // 2 hours from now
    created_at: new Date().toISOString() // Just now
  });
  console.log(`Risk Score: ${urgentRisk.riskScore}/100`);
  console.log(`Risk Level: ${urgentRisk.riskLevel}`);
  console.log(`Confidence: ${urgentRisk.confidence}%`);
  console.log('Factors:');
  urgentRisk.factors.forEach(f => {
    console.log(`  ${f.impact > 0 ? '+' : ''}${f.impact} - ${f.description}`);
  });

  // Test Average Revenue Calculation
  console.log('\n\n💰 Testing Average Revenue Calculation');
  console.log('======================================');
  const avgRevenue = await calculateAverageNoShowValue();
  console.log(`Average no-show value: €${avgRevenue}`);
  console.log('(Calculated from last 30 days of service_records.total_bill)');

  // Test Intervention Recommendations
  console.log('\n\n💡 Testing Intervention Recommendations');
  console.log('=======================================');

  const veryHighIntervention = await getRecommendedIntervention('very-high', 85, avgRevenue);
  console.log('\nVery High Risk:');
  console.log(`  Type: ${veryHighIntervention.type}`);
  console.log(`  Description: ${veryHighIntervention.description}`);
  console.log(`  Cost: €${veryHighIntervention.estimatedCost}`);
  console.log(`  Value: €${veryHighIntervention.estimatedValue}`);
  console.log(`  ROI: ${((veryHighIntervention.estimatedValue / veryHighIntervention.estimatedCost) * 100).toFixed(0)}%`);

  const highIntervention = await getRecommendedIntervention('high', 65, avgRevenue);
  console.log('\nHigh Risk:');
  console.log(`  Type: ${highIntervention.type}`);
  console.log(`  Description: ${highIntervention.description}`);
  console.log(`  Cost: €${highIntervention.estimatedCost}`);
  console.log(`  Value: €${highIntervention.estimatedValue}`);
  console.log(`  ROI: ${((highIntervention.estimatedValue / highIntervention.estimatedCost) * 100).toFixed(0)}%`);

  console.log('\n✅ All tests completed!\n');
}

testMLScoring().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
