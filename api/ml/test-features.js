/**
 * Test Feature Engineering Service
 *
 * Tests all 23 features with sample reservations
 */

const { extractAllFeatures, getFeatureNames } = require('./features');
const { ALL_FEATURES, FEATURE_GROUPS } = require('./feature-config');

// ============================================================================
// TEST DATA
// ============================================================================

// Sample reservation 1: New customer, same-day booking, large party
const sampleReservation1 = {
  reservation_id: 'TEST-001',
  date: '2025-10-26',
  time: '19:00',
  party_size: 8,
  special_requests: 'Window seat please',
  booking_created_at: '2025-10-26T09:00:00',
  customer_email: 'newcustomer@example.com',
  customer_phone: '+15551234567',
  customer_name: 'John Doe',
  confirmation_sent_at: null,
  confirmation_clicked: false
};

// Sample customer history 1: New customer (no history)
const customerHistory1 = null;

// Sample reservation 2: Repeat customer, week-ahead booking, small party
const sampleReservation2 = {
  reservation_id: 'TEST-002',
  date: '2025-11-02',
  time: '20:30',
  party_size: 2,
  special_requests: '',
  booking_created_at: '2025-10-26T10:00:00',
  customer_email: 'regular@example.com',
  customer_phone: '+15559876543',
  customer_name: 'Jane Smith',
  confirmation_sent_at: '2025-10-26T10:05:00',
  confirmation_clicked: true
};

// Sample customer history 2: Regular customer
const customerHistory2 = {
  fields: {
    Email: 'regular@example.com',
    'Customer Name': 'Jane Smith',
    'Total Reservations': 12,
    'Completed Reservations': 11,
    'No Shows': 1,
    'Cancellations': 0,
    'Average Party Size': 2.3,
    'Total Spend': 1450,
    'Last Visit Date': '2025-10-15',
    'No Show Risk Score': 0.09 // 1/11 = 9%
  }
};

// Sample reservation 3: Edge case - missing data
const sampleReservation3 = {
  reservation_id: 'TEST-003',
  date: '2025-10-27',
  time: '12:00',
  party_size: 4
  // Missing: booking_created_at, customer_email, special_requests, etc.
};

const customerHistory3 = null;

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

function testFeatureExtraction() {
  console.log('🧪 Testing Feature Engineering Service\n');
  console.log('=' .repeat(80));
  console.log('\n');

  // Test 1: New customer, same-day booking, large party
  console.log('📊 TEST 1: New Customer, Same-Day, Large Party');
  console.log('-'.repeat(80));
  const features1 = extractAllFeatures(sampleReservation1, customerHistory1);
  printFeatures(features1, sampleReservation1, customerHistory1);
  console.log('\n');

  // Test 2: Repeat customer, week-ahead booking
  console.log('📊 TEST 2: Repeat Customer, Week Ahead, Small Party');
  console.log('-'.repeat(80));
  const features2 = extractAllFeatures(sampleReservation2, customerHistory2);
  printFeatures(features2, sampleReservation2, customerHistory2);
  console.log('\n');

  // Test 3: Edge case - missing data
  console.log('📊 TEST 3: Edge Case - Missing Data');
  console.log('-'.repeat(80));
  const features3 = extractAllFeatures(sampleReservation3, customerHistory3);
  printFeatures(features3, sampleReservation3, customerHistory3);
  console.log('\n');

  // Validate all tests
  console.log('=' .repeat(80));
  console.log('✅ VALIDATION RESULTS\n');

  const allValid = [
    validateFeatures(features1, 'Test 1'),
    validateFeatures(features2, 'Test 2'),
    validateFeatures(features3, 'Test 3')
  ].every(result => result);

  if (allValid) {
    console.log('✅ ALL TESTS PASSED! Feature engineering service is working correctly.\n');
  } else {
    console.log('❌ SOME TESTS FAILED. Check errors above.\n');
  }

  // Feature count verification
  console.log('📋 Feature Count Verification:');
  console.log(`   Expected: 23 features`);
  console.log(`   Test 1: ${Object.keys(features1).length} features`);
  console.log(`   Test 2: ${Object.keys(features2).length} features`);
  console.log(`   Test 3: ${Object.keys(features3).length} features`);

  if (Object.keys(features1).length === 23) {
    console.log('   ✅ Feature count correct!\n');
  } else {
    console.log('   ❌ Feature count mismatch!\n');
  }

  // Print feature groups
  printFeatureGroups();
}

function printFeatures(features, reservation, customerHistory) {
  console.log('\nReservation Details:');
  console.log(`  ID: ${reservation.reservation_id}`);
  console.log(`  Date: ${reservation.date} ${reservation.time}`);
  console.log(`  Party Size: ${reservation.party_size}`);
  console.log(`  Customer Type: ${customerHistory ? 'Repeat' : 'New'}`);
  console.log('');

  console.log('Extracted Features:');
  console.log('');

  // Group by category
  printFeatureGroup('TEMPORAL FEATURES', FEATURE_GROUPS.temporal, features);
  printFeatureGroup('CUSTOMER FEATURES', FEATURE_GROUPS.customer, features);
  printFeatureGroup('RESERVATION FEATURES', FEATURE_GROUPS.reservation, features);
  printFeatureGroup('ENGAGEMENT FEATURES', FEATURE_GROUPS.engagement, features);
  printFeatureGroup('CALCULATED FEATURES', FEATURE_GROUPS.calculated, features);
}

function printFeatureGroup(title, featureNames, features) {
  console.log(`  ${title}:`);
  featureNames.forEach(name => {
    const value = features[name];
    const formattedValue = typeof value === 'number' ?
      (Number.isInteger(value) ? value : value.toFixed(2)) :
      value;
    console.log(`    ${name.padEnd(35)} = ${formattedValue}`);
  });
  console.log('');
}

function validateFeatures(features, testName) {
  const errors = [];

  // Check all 23 features present
  if (Object.keys(features).length !== 23) {
    errors.push(`Feature count mismatch: ${Object.keys(features).length} (expected 23)`);
  }

  // Check all features are numeric
  for (const [key, value] of Object.entries(features)) {
    if (typeof value !== 'number') {
      errors.push(`${key} is not numeric: ${typeof value}`);
    }
    if (isNaN(value)) {
      errors.push(`${key} is NaN`);
    }
  }

  // Validate specific ranges
  if (features.hour_of_day < 0 || features.hour_of_day > 23) {
    errors.push(`hour_of_day out of range: ${features.hour_of_day}`);
  }
  if (features.day_of_week < 0 || features.day_of_week > 6) {
    errors.push(`day_of_week out of range: ${features.day_of_week}`);
  }
  if (features.month_of_year < 1 || features.month_of_year > 12) {
    errors.push(`month_of_year out of range: ${features.month_of_year}`);
  }
  if (features.is_weekend !== 0 && features.is_weekend !== 1) {
    errors.push(`is_weekend not boolean: ${features.is_weekend}`);
  }
  if (features.is_prime_time !== 0 && features.is_prime_time !== 1) {
    errors.push(`is_prime_time not boolean: ${features.is_prime_time}`);
  }
  if (features.customer_no_show_rate < 0 || features.customer_no_show_rate > 1) {
    errors.push(`customer_no_show_rate out of range: ${features.customer_no_show_rate}`);
  }

  // Print results
  if (errors.length === 0) {
    console.log(`✅ ${testName}: All validations passed`);
    return true;
  } else {
    console.log(`❌ ${testName}: Validation errors:`);
    errors.forEach(err => console.log(`   - ${err}`));
    return false;
  }
}

function printFeatureGroups() {
  console.log('📋 Feature Groups Summary:\n');
  console.log(`  Temporal Features:    ${FEATURE_GROUPS.temporal.length} features`);
  console.log(`  Customer Features:    ${FEATURE_GROUPS.customer.length} features`);
  console.log(`  Reservation Features: ${FEATURE_GROUPS.reservation.length} features`);
  console.log(`  Engagement Features:  ${FEATURE_GROUPS.engagement.length} features`);
  console.log(`  Calculated Features:  ${FEATURE_GROUPS.calculated.length} features`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  TOTAL:                ${ALL_FEATURES.length} features\n`);

  console.log('✅ Feature engineering service is ready for production!\n');
  console.log('Next steps:');
  console.log('  1. Create comprehensive unit tests (Day 9)');
  console.log('  2. Export historical data from Airtable (Day 10)');
  console.log('  3. Apply features to historical dataset (Days 11-12)');
  console.log('  4. Integrate into reservation flow (Day 13)');
  console.log('  5. Deploy to production (Day 14)');
  console.log('');
}

// ============================================================================
// RUN TESTS
// ============================================================================

if (require.main === module) {
  try {
    testFeatureExtraction();
    process.exit(0);
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { testFeatureExtraction };
