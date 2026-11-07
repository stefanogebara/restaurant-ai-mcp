jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {} }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));

const { buildToolDefinitions } = require('../_services/elevenlabsAgentService');

test('the date/time tool carries the restaurant ID required by its scoped Bearer secret', () => {
  const restaurantId = '36d38a62-d76e-4e32-8bc3-17f701cd7a0a';
  const secret = 'el_whsec_test-only';
  const tools = buildToolDefinitions('https://seatable.one', restaurantId, secret);
  const dateTool = tools.find(tool => tool.name === 'get_current_datetime');

  expect(dateTool.api_schema.request_headers.Authorization).toBe(`Bearer ${secret}`);
  const url = new URL(dateTool.api_schema.url);
  expect(url.pathname).toBe('/api/elevenlabs-webhook');
  expect(url.searchParams.get('action')).toBe('get_current_datetime');
  expect(url.searchParams.get('restaurant_id')).toBe(restaurantId);
});
