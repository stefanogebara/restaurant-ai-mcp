/**
 * End-to-End ML Testing Script
 * Tests all ML fixes:
 * 1. Heuristic risk scoring with U-shaped curve
 * 2. Auto-calculation of average revenue
 * 3. Intervention recommendations with configurable costs
 * 4. ROI calculations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  calculateRiskScore,
  getRecommendedIntervention,
  calculateAverageNoShowValue,
  INTERVENTION_COSTS,
  MODEL_VERSION
} = require('./api/services/mlRiskScoring');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('\n========================================');
console.log('🧪 END-TO-END ML SYSTEM TEST');
console.log('========================================\n');

async function runTests() {
  console.log('📋 Test Configuration:');
  console.log(`   Model Version: ${MODEL_VERSION}`);
  console.log(`   Intervention Costs:`, INTERVENTION_COSTS);
  console.log('');

  // ======================
  // TEST 1: U-Shaped Curve
  // ======================
  console.log('═══════════════════════════════════════');
  console.log('TEST 1: U-Shaped Curve (Lead Time Logic)');
  console.log('═══════════════════════════════════════\n');

  const baseReservation = {
    customer_email: 'test@example.com',
    customer_phone: '+1234567890',
    party_size: 2,
    date: '2025-11-15',
    time: '19:00'
  };

  const tests = [
    {
      name: 'Same-day urgent (2 hours)',
      created_at: '2025-11-15T17:00:00Z',
      expectedImpact: -10,
      expectedReason: 'urgent/committed'
    },
    {
      name: 'Short notice (1 day)',
      created_at: '2025-11-14T19:00:00Z',
      expectedImpact: +15,
      expectedReason: 'impulsive'
    },
    {
      name: 'Sweet spot (5 days)',
      created_at: '2025-11-10T19:00:00Z',
      expectedImpact: 0,
      expectedReason: 'baseline'
    },
    {
      name: 'Far future (10 days)',
      created_at: '2025-11-05T19:00:00Z',
      expectedImpact: +20,
      expectedReason: 'plans may change'
    }
  ];

  for (const test of tests) {
    const result = await calculateRiskScore({
      ...baseReservation,
      created_at: test.created_at
    });

    const leadFactor = result.factors.find(f =>
      f.factor.includes('day') ||
      f.factor.includes('notice') ||
      f.factor.includes('advance') ||
      f.factor.includes('urgent')
    );

    console.log(`✓ ${test.name}`);
    console.log(`  Risk Score: ${result.riskScore}/100 (${result.riskLevel})`);
    console.log(`  Lead Time Impact: ${leadFactor ? leadFactor.impact : 0} (expected: ${test.expectedImpact})`);
    console.log(`  Reason: ${leadFactor ? leadFactor.description : 'No adjustment'}`);

    const impactMatches = leadFactor ? leadFactor.impact === test.expectedImpact : test.expectedImpact === 0;
    console.log(`  ${impactMatches ? '✅ PASS' : '❌ FAIL'}\n`);
  }

  // ======================
  // TEST 2: Auto-Calculate Average Revenue
  // ======================
  console.log('═══════════════════════════════════════');
  console.log('TEST 2: Auto-Calculate Average Revenue');
  console.log('═══════════════════════════════════════\n');

  console.log('Step 1: Check existing service records with total_bill...');
  const { data: existingRecords, error: fetchError } = await supabase
    .from('service_records')
    .select('service_id, total_bill, seated_at')
    .not('total_bill', 'is', null)
    .eq('status', 'completed')
    .order('seated_at', { ascending: false })
    .limit(5);

  if (fetchError) {
    console.error('   ❌ Error fetching existing records:', fetchError);
  } else if (existingRecords && existingRecords.length > 0) {
    console.log(`   ✓ Found ${existingRecords.length} existing records with total_bill:`);
    existingRecords.forEach(r => {
      console.log(`     - ${r.service_id}: €${r.total_bill}`);
    });
  } else {
    console.log('   ℹ️  No existing records with total_bill found');
  }

  console.log('\nStep 2: Create test service records with total_bill...');

  const testServiceRecords = [
    { total_bill: 45.50, party_size: 2 },
    { total_bill: 82.00, party_size: 4 },
    { total_bill: 120.75, party_size: 6 },
    { total_bill: 38.00, party_size: 2 },
    { total_bill: 95.25, party_size: 4 }
  ];

  const createdRecords = [];
  for (const record of testServiceRecords) {
    const { data, error } = await supabase
      .from('service_records')
      .insert({
        service_id: `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        customer_name: 'Test Customer',
        customer_phone: '+1111111111',
        party_size: record.party_size,
        table_ids: ['1'],
        seated_at: new Date().toISOString(),
        actual_departure: new Date().toISOString(),
        total_bill: record.total_bill,
        status: 'completed'
      })
      .select()
      .single();

    if (error) {
      console.error(`   ❌ Error creating record: €${record.total_bill}`, error.message);
    } else {
      createdRecords.push(data);
      console.log(`   ✓ Created: ${data.service_id} - €${record.total_bill}`);
    }
  }

  console.log('\nStep 3: Calculate average revenue...');
  const avgRevenue = await calculateAverageNoShowValue();
  const expectedAvg = testServiceRecords.reduce((sum, r) => sum + r.total_bill, 0) / testServiceRecords.length;

  console.log(`   Calculated Average: €${avgRevenue}`);
  console.log(`   Expected (from test data): €${expectedAvg.toFixed(2)}`);
  console.log(`   ${avgRevenue >= 30 && avgRevenue <= 100 ? '✅ PASS' : '⚠️  WARN'} (reasonable value)\n`);

  // ======================
  // TEST 3: Intervention Recommendations
  // ======================
  console.log('═══════════════════════════════════════');
  console.log('TEST 3: Intervention Recommendations');
  console.log('═══════════════════════════════════════\n');

  console.log('High Risk Reservation (Score: 60/100)');
  const highRiskIntervention = await getRecommendedIntervention('high', 60, avgRevenue);
  console.log(`   Type: ${highRiskIntervention.type}`);
  console.log(`   Description: ${highRiskIntervention.description}`);
  console.log(`   Cost: €${highRiskIntervention.estimatedCost}`);
  console.log(`   Value: €${highRiskIntervention.estimatedValue}`);
  const highROI = ((highRiskIntervention.estimatedValue / highRiskIntervention.estimatedCost) * 100).toFixed(0);
  console.log(`   ROI: ${highROI}%`);
  console.log(`   ${highRiskIntervention.type === 'confirmation_call' ? '✅ PASS' : '❌ FAIL'} (should be confirmation_call)\n`);

  console.log('Very High Risk Reservation (Score: 80/100)');
  const veryHighRiskIntervention = await getRecommendedIntervention('very-high', 80, avgRevenue);
  console.log(`   Type: ${veryHighRiskIntervention.type}`);
  console.log(`   Description: ${veryHighRiskIntervention.description}`);
  console.log(`   Cost: €${veryHighRiskIntervention.estimatedCost}`);
  console.log(`   Value: €${veryHighRiskIntervention.estimatedValue}`);
  const veryHighROI = ((veryHighRiskIntervention.estimatedValue / veryHighRiskIntervention.estimatedCost) * 100).toFixed(0);
  console.log(`   ROI: ${veryHighROI}%`);
  console.log(`   ${veryHighRiskIntervention.type === 'deposit_required' ? '✅ PASS' : '❌ FAIL'} (should be deposit_required)\n`);

  // ======================
  // TEST 4: ROI Targets
  // ======================
  console.log('═══════════════════════════════════════');
  console.log('TEST 4: ROI Target Verification');
  console.log('═══════════════════════════════════════\n');

  console.log('Target ROI: 300-500% (€3-€5 saved per €1 spent)\n');

  console.log(`Confirmation Call:`);
  console.log(`   Cost: €${INTERVENTION_COSTS.confirmation_call}`);
  console.log(`   Value: €${avgRevenue}`);
  console.log(`   ROI: ${highROI}%`);
  console.log(`   ${parseInt(highROI) >= 300 ? '✅ PASS' : '❌ FAIL'} (meets 300% target)\n`);

  console.log(`Deposit Required:`);
  console.log(`   Cost: €${INTERVENTION_COSTS.deposit_required}`);
  console.log(`   Value: €${avgRevenue}`);
  console.log(`   ROI: ${veryHighROI}%`);
  console.log(`   ${parseInt(veryHighROI) >= 300 ? '✅ PASS' : '❌ FAIL'} (meets 300% target)\n`);

  // ======================
  // CLEANUP
  // ======================
  console.log('═══════════════════════════════════════');
  console.log('CLEANUP');
  console.log('═══════════════════════════════════════\n');

  console.log('Deleting test service records...');
  for (const record of createdRecords) {
    const { error } = await supabase
      .from('service_records')
      .delete()
      .eq('service_id', record.service_id);

    if (error) {
      console.error(`   ❌ Error deleting ${record.service_id}:`, error.message);
    } else {
      console.log(`   ✓ Deleted: ${record.service_id}`);
    }
  }

  console.log('\n========================================');
  console.log('✅ ALL TESTS COMPLETE');
  console.log('========================================\n');
}

runTests().catch(error => {
  console.error('\n❌ Test Error:', error);
  process.exit(1);
});
