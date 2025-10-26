/**
 * Test ML Predictions
 *
 * Tests the prediction service with sample reservations
 */

const { predictNoShow, getModelInfo } = require('../api/ml/predict');

console.log('🧪 Testing ML Prediction Service\n');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// Test 1: Get model info
console.log('📊 Test 1: Get Model Info\n');
const modelInfo = getModelInfo();
console.log(JSON.stringify(modelInfo, null, 2));
console.log('\n');

// Test 2: Predict for same-day booking (low risk)
console.log('📊 Test 2: Same-Day Booking (Expected: Low Risk)\n');

const sameDayReservation = {
  reservation_id: 'TEST-001',
  date: '2025-10-26',
  time: '19:00',
  party_size: 2,
  special_requests: 'Window seat',
  booking_created_at: '2025-10-26T09:00:00', // Same day
  customer_email: 'john@example.com',
  customer_phone: '+15551234567'
};

const prediction1 = predictNoShow(sameDayReservation, null);
console.log('Prediction:', prediction1.prediction);
console.log('No-Show Risk:', prediction1.noShowRisk);
console.log('Probability:', (prediction1.noShowProbability * 100).toFixed(1) + '%');
console.log('Confidence:', (prediction1.confidence * 100).toFixed(1) + '%');
console.log('\n');

// Test 3: Predict for week-ahead booking (higher risk)
console.log('📊 Test 3: Week-Ahead Booking (Expected: Higher Risk)\n');

const weekAheadReservation = {
  reservation_id: 'TEST-002',
  date: '2025-11-02',
  time: '21:00', // Late time
  party_size: 6, // Large party
  special_requests: '',
  booking_created_at: '2025-10-26T09:00:00', // Week ahead
  customer_email: 'new@example.com',
  customer_phone: '+15559876543'
};

const prediction2 = predictNoShow(weekAheadReservation, null);
console.log('Prediction:', prediction2.prediction);
console.log('No-Show Risk:', prediction2.noShowRisk);
console.log('Probability:', (prediction2.noShowProbability * 100).toFixed(1) + '%');
console.log('Confidence:', (prediction2.confidence * 100).toFixed(1) + '%');
console.log('\n');

// Test 4: Repeat customer (low risk)
console.log('📊 Test 4: Repeat Customer with Good History (Expected: Low Risk)\n');

const repeatCustomerHistory = {
  email: 'loyal@example.com',
  phone: '+15551111111',
  name: 'Loyal Customer',
  completed_reservations: 10,
  total_reservations: 11,
  no_shows: 1,
  last_visit_date: '2025-10-15'
};

const repeatReservation = {
  reservation_id: 'TEST-003',
  date: '2025-10-27',
  time: '19:00',
  party_size: 4,
  special_requests: 'Anniversary dinner',
  booking_created_at: '2025-10-25T14:00:00',
  customer_email: 'loyal@example.com',
  customer_phone: '+15551111111'
};

const prediction3 = predictNoShow(repeatReservation, repeatCustomerHistory);
console.log('Prediction:', prediction3.prediction);
console.log('No-Show Risk:', prediction3.noShowRisk);
console.log('Probability:', (prediction3.noShowProbability * 100).toFixed(1) + '%');
console.log('Confidence:', (prediction3.confidence * 100).toFixed(1) + '%');
console.log('\n');

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('✅ Prediction Service Tests Complete!\n');
