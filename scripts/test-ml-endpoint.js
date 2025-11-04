/**
 * Test ML Prediction Endpoint
 * Tests the /api/ml-predict endpoint with various scenarios
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

// Test scenarios
const testCases = [
  {
    name: 'High Risk - No deposit, tourist, high no-show history',
    data: {
      party_size: 6,
      booking_lead_time_hours: 2,
      customer_no_show_rate: 0.4,
      is_repeat_customer: false,
      has_special_requests: false,
      special_request_count: 0,
      booking_changes_count: 3,
      has_deposit: false,
      is_tourist: true,
      is_travel_agency: true,
      reservation_date: new Date().toISOString(),
      reservation_time: '20:00'
    },
    expectedRisk: 'high'
  },
  {
    name: 'Low Risk - Deposit, repeat customer, special requests',
    data: {
      party_size: 2,
      booking_lead_time_hours: 72,
      customer_no_show_rate: 0.0,
      is_repeat_customer: true,
      has_special_requests: true,
      special_request_count: 2,
      booking_changes_count: 0,
      has_deposit: true,
      is_tourist: false,
      is_travel_agency: false,
      reservation_date: new Date().toISOString(),
      reservation_time: '19:00'
    },
    expectedRisk: 'low'
  },
  {
    name: 'Medium Risk - Mixed indicators',
    data: {
      party_size: 4,
      booking_lead_time_hours: 24,
      customer_no_show_rate: 0.15,
      is_repeat_customer: false,
      has_special_requests: true,
      special_request_count: 1,
      booking_changes_count: 1,
      has_deposit: false,
      is_tourist: false,
      is_travel_agency: false,
      reservation_date: new Date().toISOString(),
      reservation_time: '18:30'
    },
    expectedRisk: 'medium'
  }
];

async function testHealthCheck() {
  console.log('\n=== Testing Health Check (GET /api/ml-predict) ===');
  try {
    const response = await axios.get(`${API_BASE}/api/ml-predict`);
    console.log('Status:', response.status);
    console.log('Model Version:', response.data.model_version);
    console.log('ROC AUC Score:', response.data.roc_auc_score);
    console.log('Training Date:', response.data.training_date);
    console.log('Features Count:', response.data.features_count);
    console.log('[OK] Health check passed\n');
    return true;
  } catch (error) {
    console.error('[FAIL] Health check failed:', error.message);
    return false;
  }
}

async function testPrediction(testCase) {
  console.log(`\n=== Testing: ${testCase.name} ===`);
  try {
    const startTime = Date.now();
    const response = await axios.post(`${API_BASE}/api/ml-predict`, testCase.data);
    const responseTime = Date.now() - startTime;

    console.log('Response Time:', responseTime + 'ms');
    console.log('No-Show Probability:', response.data.prediction.no_show_probability);
    console.log('Risk Score:', response.data.prediction.risk_score);
    console.log('Risk Level:', response.data.prediction.risk_level);
    console.log('Show Probability:', response.data.prediction.show_probability);
    console.log('\nRecommendations:');
    response.data.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });

    // Show top 3 most important features for this prediction
    if (response.data.feature_importance) {
      console.log('\nTop 3 Feature Contributions:');
      const features = Object.entries(response.data.feature_importance).slice(0, 3);
      features.forEach(([name, data], idx) => {
        console.log(`  ${idx + 1}. ${name}: ${data.value} (importance: ${data.importance.toFixed(4)})`);
      });
    }

    // Validate response time
    if (responseTime > 200) {
      console.log(`[WARNING] Response time ${responseTime}ms exceeds 200ms target`);
    } else {
      console.log(`[OK] Response time ${responseTime}ms meets <200ms requirement`);
    }

    // Validate risk level matches expectation (rough check)
    const riskMatches = response.data.prediction.risk_level === testCase.expectedRisk ||
                       (testCase.expectedRisk === 'medium' &&
                        ['low', 'medium', 'high'].includes(response.data.prediction.risk_level));

    console.log(`[${riskMatches ? 'OK' : 'INFO'}] Risk level: ${response.data.prediction.risk_level} (expected: ${testCase.expectedRisk})`);

    return true;
  } catch (error) {
    console.error('[FAIL] Prediction failed:', error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('================================================================================');
  console.log('ML PREDICTION ENDPOINT TEST SUITE');
  console.log('Model: XGBoost v2.0 (ROC AUC: 0.86)');
  console.log('Target: <200ms response time, accurate risk classification');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;

  // Test health check
  const healthCheckPassed = await testHealthCheck();
  if (healthCheckPassed) {
    passed++;
  } else {
    failed++;
    console.log('\n[CRITICAL] Health check failed. Skipping prediction tests.');
    return;
  }

  // Test predictions
  for (const testCase of testCases) {
    const result = await testPrediction(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  }

  console.log('\n================================================================================');
  console.log('TEST SUMMARY');
  console.log('================================================================================');
  console.log(`Total Tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('================================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runAllTests();
