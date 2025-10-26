/**
 * Test new XGBoost model (v2.0.0) predictions
 */

const { predictNoShow, getModelInfo } = require('./api/ml/predict');

console.log("=".repeat(80));
console.log("TESTING NEW XGBOOST MODEL (v2.0.0)");
console.log("=".repeat(80));

// Get model info
const modelInfo = getModelInfo();
console.log("\nModel Info:");
console.log(JSON.stringify(modelInfo, null, 2));

// Test 1: New customer (high risk expected)
console.log("\n" + "=".repeat(80));
console.log("TEST 1: New Customer - No History");
console.log("=".repeat(80));

const newCustomer = {
  reservation_id: 'TEST-001',
  customer_name: 'New Customer',
  customer_email: 'new@test.com',
  customer_phone: '+1234567890',
  party_size: 2,
  date: '2025-10-30',
  time: '19:00',
  special_requests: '',
  created_at: new Date().toISOString()
};

const prediction1 = predictNoShow(newCustomer, null);
console.log("\nPrediction:");
console.log(`  No-Show Probability: ${(prediction1.noShowProbability * 100).toFixed(1)}%`);
console.log(`  Risk Level: ${prediction1.noShowRisk}`);
console.log(`  Confidence: ${(prediction1.confidence * 100).toFixed(1)}%`);

// Test 2: Repeat customer with special requests (low risk expected)
console.log("\n" + "=".repeat(80));
console.log("TEST 2: Repeat Customer with Special Requests");
console.log("=".repeat(80));

const repeatCustomer = {
  reservation_id: 'TEST-002',
  customer_name: 'Loyal Customer',
  customer_email: 'loyal@test.com',
  customer_phone: '+1234567891',
  party_size: 4,
  date: '2025-10-30',
  time: '19:30',
  special_requests: 'Window seat please',
  created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Booked 7 days ago
};

const customerHistory = {
  fields: {
    'Completed Reservations': 5,
    'No Show Risk Score': 0.1,  // Low historical no-show rate
    'Average Party Size': 3.5,
    'Last Visit Date': new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
    'Total Spend': 450
  }
};

const prediction2 = predictNoShow(repeatCustomer, customerHistory);
console.log("\nPrediction:");
console.log(`  No-Show Probability: ${(prediction2.noShowProbability * 100).toFixed(1)}%`);
console.log(`  Risk Level: ${prediction2.noShowRisk}`);
console.log(`  Confidence: ${(prediction2.confidence * 100).toFixed(1)}%`);

// Test 3: Large party, last minute booking (high risk expected)
console.log("\n" + "=".repeat(80));
console.log("TEST 3: Large Party, Last-Minute Booking");
console.log("=".repeat(80));

const lastMinute = {
  reservation_id: 'TEST-003',
  customer_name: 'Last Minute Party',
  customer_email: 'lastminute@test.com',
  customer_phone: '+1234567892',
  party_size: 8,
  date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
  time: '20:00',
  special_requests: '',
  created_at: new Date().toISOString() // Just now
};

const prediction3 = predictNoShow(lastMinute, null);
console.log("\nPrediction:");
console.log(`  No-Show Probability: ${(prediction3.noShowProbability * 100).toFixed(1)}%`);
console.log(`  Risk Level: ${prediction3.noShowRisk}`);
console.log(`  Confidence: ${(prediction3.confidence * 100).toFixed(1)}%`);

console.log("\n" + "=".repeat(80));
console.log("TESTING COMPLETE!");
console.log("=".repeat(80));
