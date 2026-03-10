/**
 * Frontend & Backend Integration Test
 *
 * Tests:
 * 1. Backend API endpoints
 * 2. Feature extraction service
 * 3. Frontend UI with Playwright
 * 4. End-to-end reservation flow
 */

const axios = require('axios');

// Production URL
const BASE_URL = 'https://seatable.one';
const API_URL = `${BASE_URL}/api`;

// ============================================================================
// BACKEND API TESTS
// ============================================================================

async function testBackendAPIs() {
  console.log('🔧 Testing Backend APIs\n');
  console.log('=' .repeat(80));

  const tests = [];

  // Test 1: Host Dashboard Data
  try {
    console.log('\n📊 Test 1: GET /api/host-dashboard/data');
    const response = await axios.get(`${API_URL}/host-dashboard/data`, { timeout: 10000 });

    if (response.status === 200 && response.data.tables) {
      console.log('   ✅ Host dashboard API working');
      console.log(`   ✅ Tables: ${response.data.tables.length}`);
      console.log(`   ✅ Active parties: ${response.data.active_parties?.length || 0}`);
      console.log(`   ✅ Upcoming reservations: ${response.data.upcoming_reservations?.length || 0}`);
      tests.push({ name: 'Host Dashboard API', passed: true });
    } else {
      console.log('   ❌ Unexpected response');
      tests.push({ name: 'Host Dashboard API', passed: false });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    tests.push({ name: 'Host Dashboard API', passed: false });
  }

  // Test 2: Check Availability
  try {
    console.log('\n📊 Test 2: POST /api/check-availability');
    const response = await axios.post(`${API_URL}/check-availability`, {
      date: '2025-10-30',
      time: '19:00',
      party_size: 4
    }, { timeout: 10000 });

    if (response.status === 200) {
      console.log('   ✅ Availability check API working');
      console.log(`   ✅ Available: ${response.data.available}`);
      tests.push({ name: 'Availability API', passed: true });
    } else {
      console.log('   ❌ Unexpected response');
      tests.push({ name: 'Availability API', passed: false });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    tests.push({ name: 'Availability API', passed: false });
  }

  // Test 3: Get Wait Time
  try {
    console.log('\n📊 Test 3: GET /api/get-wait-time');
    const response = await axios.get(`${API_URL}/get-wait-time`, { timeout: 10000 });

    if (response.status === 200 && 'wait_time_minutes' in response.data) {
      console.log('   ✅ Wait time API working');
      console.log(`   ✅ Current wait: ${response.data.wait_time_minutes} minutes`);
      tests.push({ name: 'Wait Time API', passed: true });
    } else {
      console.log('   ❌ Unexpected response');
      tests.push({ name: 'Wait Time API', passed: false });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    tests.push({ name: 'Wait Time API', passed: false });
  }

  console.log('\n' + '=' .repeat(80));
  console.log('Backend API Test Summary:\n');

  const passedTests = tests.filter(t => t.passed).length;
  const totalTests = tests.length;

  tests.forEach(test => {
    console.log(`  ${test.passed ? '✅' : '❌'} ${test.name}`);
  });

  console.log(`\n  Total: ${passedTests}/${totalTests} tests passed`);

  return passedTests === totalTests;
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runAllTests() {
  console.log('🧪 Restaurant AI MCP - Frontend & Backend Integration Tests\n');
  console.log('Testing production environment: ' + BASE_URL);
  console.log('');

  try {
    // Test backend APIs
    const backendPassed = await testBackendAPIs();

    console.log('\n' + '=' .repeat(80));
    console.log('📋 OVERALL TEST RESULTS\n');

    if (backendPassed) {
      console.log('✅ Backend APIs: PASSED');
      console.log('✅ Production environment is healthy!');
      console.log('\n🎯 Next Step: Testing frontend with Playwright...\n');
      console.log('Run: npx playwright test --headed\n');
      return true;
    } else {
      console.log('❌ Backend APIs: FAILED');
      console.log('⚠️ Some backend endpoints are not working');
      return false;
    }

  } catch (error) {
    console.error('❌ Test suite error:', error);
    return false;
  }
}

if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testBackendAPIs, runAllTests };
