jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {} }));
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: jest.fn(), logCronError: jest.fn() }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: jest.fn() }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

const { analyzeConversation } = require('../_crons/validate-conversations');
const tool = (tool_name, success) => ({ tool_name, success });
const flagsFor = (tools_used, outcome = 'information_only') => analyzeConversation({ tools_used, outcome });

test('missing results do not become multiple tool failures', () => {
  expect(flagsFor([tool('check_availability', null), tool('lookup', undefined), tool('wait_time', 0)])).toEqual([]);
});

test('unknown results do not inflate the count of actual failures', () => {
  expect(flagsFor([tool('a', false), tool('b', false), tool('c', null), tool('d', undefined)])).toEqual([]);
});

test('three explicitly failed calls still trigger the failure warning', () => {
  expect(flagsFor([tool('a', false), tool('b', false), tool('c', false)])).toContainEqual(expect.objectContaining({
    type: 'multiple_tool_failures', details: expect.objectContaining({ failed_count: 3 }),
  }));
});

test('an availability invocation with an unknown result is not described as absent or failed', () => {
  expect(flagsFor([tool('check_availability', null), tool('create_reservation', null), tool('create_reservation', true)], 'reservation_created')).toEqual([]);
});

test('a confirmed booking without any availability invocation still gets flagged', () => {
  expect(flagsFor([tool('create_reservation', true)], 'reservation_created')).toContainEqual(expect.objectContaining({ type: 'no_availability_check' }));
});

test('a known availability failure before a booking still gets flagged', () => {
  expect(flagsFor([tool('check_availability', false), tool('create_reservation', true)], 'reservation_created')).toContainEqual(expect.objectContaining({ type: 'booking_after_errors' }));
});
