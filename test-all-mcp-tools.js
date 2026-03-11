/**
 * Comprehensive MCP Server Tool Testing Script
 * Tests all 10 restaurant management tools
 */

const readline = require('readline');

// MCP Inspector proxy details
const MCP_PROXY_URL = 'http://localhost:6277';
// Set TEST_AUTH_TOKEN env var before running: export TEST_AUTH_TOKEN=<your_token>
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';

// Test results storage
const testResults = [];

// Helper function to make MCP tool calls
async function callMCPTool(toolName, args) {
  const fetch = (await import('node-fetch')).default;

  const response = await fetch(`${MCP_PROXY_URL}/call-tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({
      tool: toolName,
      arguments: args
    })
  });

  return await response.json();
}

// Test 1: check_restaurant_availability
async function test_checkRestaurantAvailability() {
  console.log('\n🧪 Test 1: check_restaurant_availability');
  console.log('==========================================');

  try {
    const result = await callMCPTool('check_restaurant_availability', {
      date: '2025-10-25',
      time: '19:00',
      party_size: 4
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'check_restaurant_availability', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'check_restaurant_availability', status: 'FAIL', error: error.message });
  }
}

// Test 2: create_reservation
async function test_createReservation() {
  console.log('\n🧪 Test 2: create_reservation');
  console.log('==========================================');

  try {
    const result = await callMCPTool('create_reservation', {
      customer_name: 'MCP Test Customer',
      customer_email: 'mcp.test@example.com',
      customer_phone: '+1 555 999 0000',
      party_size: 2,
      date: '2025-10-26',
      time: '18:30',
      special_requests: 'Testing MCP server tool'
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'create_reservation', status: 'PASS', result });

    // Store reservation ID for later tests
    if (result.reservation_id) {
      global.testReservationId = result.reservation_id;
      console.log(`📝 Stored reservation ID: ${global.testReservationId}`);
    }
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'create_reservation', status: 'FAIL', error: error.message });
  }
}

// Test 3: lookup_reservation
async function test_lookupReservation() {
  console.log('\n🧪 Test 3: lookup_reservation');
  console.log('==========================================');

  if (!global.testReservationId) {
    console.log('⚠️ SKIPPED - No reservation ID from previous test');
    testResults.push({ tool: 'lookup_reservation', status: 'SKIP', reason: 'No reservation ID' });
    return;
  }

  try {
    const result = await callMCPTool('lookup_reservation', {
      reservation_id: global.testReservationId
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'lookup_reservation', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'lookup_reservation', status: 'FAIL', error: error.message });
  }
}

// Test 4: modify_reservation
async function test_modifyReservation() {
  console.log('\n🧪 Test 4: modify_reservation');
  console.log('==========================================');

  if (!global.testReservationId) {
    console.log('⚠️ SKIPPED - No reservation ID from previous test');
    testResults.push({ tool: 'modify_reservation', status: 'SKIP', reason: 'No reservation ID' });
    return;
  }

  try {
    const result = await callMCPTool('modify_reservation', {
      reservation_id: global.testReservationId,
      party_size: 3,
      special_requests: 'Updated via MCP tool test'
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'modify_reservation', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'modify_reservation', status: 'FAIL', error: error.message });
  }
}

// Test 5: get_wait_time
async function test_getWaitTime() {
  console.log('\n🧪 Test 5: get_wait_time');
  console.log('==========================================');

  try {
    const result = await callMCPTool('get_wait_time', {
      party_size: 4
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'get_wait_time', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'get_wait_time', status: 'FAIL', error: error.message });
  }
}

// Test 6: get_host_dashboard_data
async function test_getHostDashboardData() {
  console.log('\n🧪 Test 6: get_host_dashboard_data');
  console.log('==========================================');

  try {
    const result = await callMCPTool('get_host_dashboard_data', {});

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'get_host_dashboard_data', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'get_host_dashboard_data', status: 'FAIL', error: error.message });
  }
}

// Test 7: seat_party
async function test_seatParty() {
  console.log('\n🧪 Test 7: seat_party (previously fixed)');
  console.log('==========================================');

  try {
    const result = await callMCPTool('seat_party', {
      customer_name: 'MCP Seat Test',
      customer_phone: '+1 555 888 7777',
      party_size: 2,
      table_ids: [1],
      special_requests: 'Testing seat_party tool'
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'seat_party', status: 'PASS', result });

    // Store service ID for later tests
    if (result.service_id) {
      global.testServiceId = result.service_id;
      console.log(`📝 Stored service ID: ${global.testServiceId}`);
    }
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'seat_party', status: 'FAIL', error: error.message });
  }
}

// Test 8: complete_service
async function test_completeService() {
  console.log('\n🧪 Test 8: complete_service (previously fixed)');
  console.log('==========================================');

  if (!global.testServiceId) {
    console.log('⚠️ SKIPPED - No service ID from previous test');
    testResults.push({ tool: 'complete_service', status: 'SKIP', reason: 'No service ID' });
    return;
  }

  try {
    const result = await callMCPTool('complete_service', {
      service_id: global.testServiceId
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'complete_service', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'complete_service', status: 'FAIL', error: error.message });
  }
}

// Test 9: mark_table_clean
async function test_markTableClean() {
  console.log('\n🧪 Test 9: mark_table_clean (previously fixed)');
  console.log('==========================================');

  try {
    const result = await callMCPTool('mark_table_clean', {
      table_ids: [1]
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'mark_table_clean', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'mark_table_clean', status: 'FAIL', error: error.message });
  }
}

// Test 10: cancel_reservation
async function test_cancelReservation() {
  console.log('\n🧪 Test 10: cancel_reservation');
  console.log('==========================================');

  if (!global.testReservationId) {
    console.log('⚠️ SKIPPED - No reservation ID from previous test');
    testResults.push({ tool: 'cancel_reservation', status: 'SKIP', reason: 'No reservation ID' });
    return;
  }

  try {
    const result = await callMCPTool('cancel_reservation', {
      reservation_id: global.testReservationId
    });

    console.log('✅ SUCCESS');
    console.log('Response:', JSON.stringify(result, null, 2));
    testResults.push({ tool: 'cancel_reservation', status: 'PASS', result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', error.message);
    testResults.push({ tool: 'cancel_reservation', status: 'FAIL', error: error.message });
  }
}

// Print summary
function printSummary() {
  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    TEST SUMMARY                           ');
  console.log('═══════════════════════════════════════════════════════════');

  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const skipped = testResults.filter(r => r.status === 'SKIP').length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped (Total: ${testResults.length})`);
  console.log('\nDetailed Results:');
  console.log('─────────────────────────────────────────────────────────────');

  testResults.forEach((test, index) => {
    const emoji = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${index + 1}. ${emoji} ${test.tool} - ${test.status}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Calculate success rate
  const successRate = testResults.length > 0
    ? ((passed / testResults.length) * 100).toFixed(1)
    : 0;

  console.log(`🎯 Success Rate: ${successRate}%`);

  if (failed === 0 && passed > 0) {
    console.log('\n🎉 ALL TESTS PASSED! MCP Server is fully operational!');
  } else if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed. Review errors above.`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n🚀 Starting MCP Server Tool Testing...\n');
  console.log('Testing 10 restaurant management tools\n');

  await test_checkRestaurantAvailability();
  await test_createReservation();
  await test_lookupReservation();
  await test_modifyReservation();
  await test_getWaitTime();
  await test_getHostDashboardData();
  await test_seatParty();
  await test_completeService();
  await test_markTableClean();
  await test_cancelReservation();

  printSummary();
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
