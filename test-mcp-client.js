#!/usr/bin/env node

/**
 * MCP Server Test Client
 * Uses @modelcontextprotocol/sdk to connect directly to the MCP server via STDIO
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// Test results storage
const testResults = [];

// Helper to log test results
function logTest(testName, status, result, error = null) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`\n${emoji} Test: ${testName} - ${status}`);

  if (result) {
    console.log('Result:', JSON.stringify(result, null, 2));
  }

  if (error) {
    console.log('Error:', error);
  }

  testResults.push({ test: testName, status, result, error });
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting MCP Server Tests...\n');
  console.log('Spawning MCP server process...\n');

  // Spawn the MCP server
  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: 'C:\\Users\\stefa\\restaurant-ai-mcp\\mcp-server',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Create STDIO transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    cwd: 'C:\\Users\\stefa\\restaurant-ai-mcp\\mcp-server'
  });

  // Create MCP client
  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {}
    }
  );

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // List available tools
    const toolsResponse = await client.listTools();
    console.log(`📋 Found ${toolsResponse.tools.length} tools:\n`);
    toolsResponse.tools.forEach(tool => {
      console.log(`   - ${tool.name}`);
    });
    console.log('\n');

    // Store for later tests
    let testReservationId = null;
    let testServiceId = null;

    // Test 1: check_restaurant_availability
    try {
      console.log('🧪 Test 1: check_restaurant_availability');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'check_restaurant_availability',
        arguments: {
          date: '2025-10-25',
          time: '19:00',
          party_size: 4
        }
      });

      logTest('check_restaurant_availability', 'PASS', result.content);
    } catch (error) {
      logTest('check_restaurant_availability', 'FAIL', null, error.message);
    }

    // Test 2: create_reservation
    try {
      console.log('\n🧪 Test 2: create_reservation');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'create_reservation',
        arguments: {
          customer_name: 'MCP Test Customer',
          customer_email: 'mcp.test@example.com',
          customer_phone: '+1 555 999 0000',
          party_size: 2,
          date: '2025-10-26',
          time: '18:30',
          special_requests: 'Testing MCP server tool'
        }
      });

      // Extract reservation ID from response
      const responseText = result.content[0]?.text || '';
      const match = responseText.match(/RES-\d+-\d+/);
      if (match) {
        testReservationId = match[0];
        console.log(`📝 Stored reservation ID: ${testReservationId}`);
      }

      logTest('create_reservation', 'PASS', result.content);
    } catch (error) {
      logTest('create_reservation', 'FAIL', null, error.message);
    }

    // Test 3: lookup_reservation
    if (testReservationId) {
      try {
        console.log('\n🧪 Test 3: lookup_reservation');
        console.log('==========================================');

        const result = await client.callTool({
          name: 'lookup_reservation',
          arguments: {
            reservation_id: testReservationId
          }
        });

        logTest('lookup_reservation', 'PASS', result.content);
      } catch (error) {
        logTest('lookup_reservation', 'FAIL', null, error.message);
      }
    } else {
      logTest('lookup_reservation', 'SKIP', null, 'No reservation ID from previous test');
    }

    // Test 4: modify_reservation
    if (testReservationId) {
      try {
        console.log('\n🧪 Test 4: modify_reservation');
        console.log('==========================================');

        const result = await client.callTool({
          name: 'modify_reservation',
          arguments: {
            reservation_id: testReservationId,
            party_size: 3,
            special_requests: 'Updated via MCP tool test'
          }
        });

        logTest('modify_reservation', 'PASS', result.content);
      } catch (error) {
        logTest('modify_reservation', 'FAIL', null, error.message);
      }
    } else {
      logTest('modify_reservation', 'SKIP', null, 'No reservation ID from previous test');
    }

    // Test 5: get_wait_time
    try {
      console.log('\n🧪 Test 5: get_wait_time');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'get_wait_time',
        arguments: {
          party_size: 4
        }
      });

      logTest('get_wait_time', 'PASS', result.content);
    } catch (error) {
      logTest('get_wait_time', 'FAIL', null, error.message);
    }

    // Test 6: get_host_dashboard_data
    try {
      console.log('\n🧪 Test 6: get_host_dashboard_data');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'get_host_dashboard_data',
        arguments: {}
      });

      logTest('get_host_dashboard_data', 'PASS', result.content);
    } catch (error) {
      logTest('get_host_dashboard_data', 'FAIL', null, error.message);
    }

    // Test 7: seat_party
    try {
      console.log('\n🧪 Test 7: seat_party');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'seat_party',
        arguments: {
          customer_name: 'MCP Seat Test',
          customer_phone: '+1 555 888 7777',
          party_size: 2,
          table_ids: [1],
          special_requests: 'Testing seat_party tool'
        }
      });

      // Extract service ID from response
      const responseText = result.content[0]?.text || '';
      const match = responseText.match(/SVC-\d+-\d+/);
      if (match) {
        testServiceId = match[0];
        console.log(`📝 Stored service ID: ${testServiceId}`);
      }

      logTest('seat_party', 'PASS', result.content);
    } catch (error) {
      logTest('seat_party', 'FAIL', null, error.message);
    }

    // Test 8: complete_service
    if (testServiceId) {
      try {
        console.log('\n🧪 Test 8: complete_service');
        console.log('==========================================');

        const result = await client.callTool({
          name: 'complete_service',
          arguments: {
            service_id: testServiceId
          }
        });

        logTest('complete_service', 'PASS', result.content);
      } catch (error) {
        logTest('complete_service', 'FAIL', null, error.message);
      }
    } else {
      logTest('complete_service', 'SKIP', null, 'No service ID from previous test');
    }

    // Test 9: mark_table_clean
    try {
      console.log('\n🧪 Test 9: mark_table_clean');
      console.log('==========================================');

      const result = await client.callTool({
        name: 'mark_table_clean',
        arguments: {
          table_ids: [1]
        }
      });

      logTest('mark_table_clean', 'PASS', result.content);
    } catch (error) {
      logTest('mark_table_clean', 'FAIL', null, error.message);
    }

    // Test 10: cancel_reservation
    if (testReservationId) {
      try {
        console.log('\n🧪 Test 10: cancel_reservation');
        console.log('==========================================');

        const result = await client.callTool({
          name: 'cancel_reservation',
          arguments: {
            reservation_id: testReservationId
          }
        });

        logTest('cancel_reservation', 'PASS', result.content);
      } catch (error) {
        logTest('cancel_reservation', 'FAIL', null, error.message);
      }
    } else {
      logTest('cancel_reservation', 'SKIP', null, 'No reservation ID from previous test');
    }

    // Print summary
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
      console.log(`${index + 1}. ${emoji} ${test.test} - ${test.status}`);
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

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    // Cleanup
    await client.close();
    serverProcess.kill();
    console.log('\n✅ Cleanup complete');
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});
