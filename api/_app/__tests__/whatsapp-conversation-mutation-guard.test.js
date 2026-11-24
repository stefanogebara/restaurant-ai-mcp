'use strict';

const mockCreate = jest.fn();
const mockExecute = jest.fn();
let mockConfig;
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: mockCreate } }), AI_MODEL: 'test', AI_MODEL_FAST: 'test-fast',
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {
  schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockConfig }) }) }) }) }),
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [] }), then: resolve => resolve({ data: [] }) }) }) }),
} }));
jest.mock('../_services/guestMemory', () => ({ buildGuestContext: async () => '' }));
const mockGetSession = jest.fn();
jest.mock('../_lib/whatsapp-sessions', () => ({ getSessionByPhone: (...args) => mockGetSession(...args) }));
jest.mock('../_services/whatsapp/handoff', () => ({ isHandoffEnabled: () => false }));
jest.mock('../_services/whatsapp/reservation-tools', () => ({
  RESERVATION_TOOLS: ['check_availability', 'lookup_reservation', 'create_reservation', 'modify_reservation', 'cancel_reservation']
    .map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } })),
  executeTool: (...args) => mockExecute(...args),
  getCurrentDateTime: () => ({ date: '2026-11-10', dayOfWeek: 'Tuesday', formatted: '10 November 2026 12:00' }),
}));

const { processWithAI } = require('../_services/whatsapp/conversation');
const code = 'RES-20261110-aB_cD-eF9G12';
const session = { sender_phone: '+34600000001', restaurant: { id: 'tenant-a', language: 'en' } };
const inbound = { providerMessageId: 'inbound-1', provider: 'meta', receiver: 'receiver-a' };
const text = value => ({ content: [{ type: 'text', text: value }] });
const call = (name = 'modify_reservation', input = { reservation_id: code, new_time: '20:00' }) => ({
  type: 'tool_use', id: `call-${name}`, name, input,
});
const tools = (...calls) => ({ content: calls });
const run = message => processWithAI(message || 'Yes, apply that change.', session, [], inbound);

beforeEach(() => {
  jest.resetAllMocks();
  mockConfig = { id: 'tenant-a', restaurant_name: 'Test restaurant', timezone: 'Europe/Madrid', agent_language: 'en' };
  mockCreate.mockResolvedValue(text('Current reservation verified.'));
  mockExecute.mockResolvedValue({ success: true, changed: true, reservation: { reservation_id: code } });
});

test('stops a perpetual read-only tool loop after six rounds', async () => {
  let requests = 0;
  mockCreate.mockImplementation(async () => ++requests <= 10 ? tools(call('lookup_reservation')) : text('Unexpected extra work'));
  const response = await run('Check my reservation.');
  expect(mockExecute).toHaveBeenCalledTimes(6);
  expect(mockCreate).toHaveBeenCalledTimes(7);
  expect(response).toMatch(/restaurant|verify/i);
});

test.each(['create_reservation', 'modify_reservation', 'cancel_reservation', 'join_waitlist', 'handoff_to_human'])(
  'never restarts the conversation after executing %s and a later AI failure', async name => {
    mockCreate.mockResolvedValueOnce(tools(call(name))).mockRejectedValueOnce(new Error('AI timeout'));
    const response = await run();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(response).not.toContain('[DEBUG]');
    if (name.endsWith('_reservation')) expect(response).not.toMatch(/try again|unchanged|could not/i);
  },
);

test('a throwing mutation is uncertain and is not retried', async () => {
  mockCreate.mockResolvedValueOnce(tools(call())).mockResolvedValue(text('Changed!'));
  mockExecute.mockRejectedValue(new Error('Response lost after commit'));
  const response = await run();
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(response).toMatch(/verify|verified/i);
  expect(response).not.toMatch(/unchanged|Changed!|try again/i);
});

test.each([undefined, null, {}, { success: 'true' }, { success: false, error: { code: 'mutation_unavailable' } }])(
  'stops on an absent or ambiguous mutation result %j, including later tools in the same batch', async result => {
    mockCreate.mockResolvedValueOnce(tools(call(), call('cancel_reservation'))).mockResolvedValue(text('Cancelled!'));
    mockExecute.mockResolvedValue(result);
    const response = await run();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(response).toMatch(/verify|verified/i);
    expect(response).not.toMatch(/unchanged|Cancelled!|try again/i);
  },
);

test('missing final assistant text after a successful mutation reports the known success without replay', async () => {
  mockCreate.mockResolvedValueOnce(tools(call('cancel_reservation'))).mockResolvedValueOnce({ content: [] });
  expect(await run()).toMatch(/cancelled/i);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test('does not execute another booking mutation in the same inbound turn', async () => {
  mockCreate.mockResolvedValueOnce(tools(call())).mockResolvedValueOnce(tools(call()));
  expect(await run()).toMatch(/applied|updated/i);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test('passes changed:false to the model and reports no additional change if the response fails', async () => {
  mockExecute.mockResolvedValue({ success: true, changed: false, reservation: { reservation_id: code } });
  mockCreate.mockResolvedValueOnce(tools(call('cancel_reservation'))).mockRejectedValueOnce(new Error('AI timeout'));
  const response = await run();
  const request = mockCreate.mock.calls[1][0];
  expect(JSON.parse(request.messages.at(-1).content[0].content)).toMatchObject({ success: true, changed: false });
  expect(response).toMatch(/no additional change/i);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test('deterministic refusal can be explained but cannot trigger a second mutation without a new user turn', async () => {
  mockExecute.mockResolvedValue({ success: false, error: { code: 'outside_hours', message: 'Restaurant is closed.' } });
  mockCreate.mockResolvedValueOnce(tools(call())).mockResolvedValueOnce(text('The restaurant is closed at that time. Which time would you prefer?'));
  expect(await run()).toContain('restaurant is closed');
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test('preserves authenticated cancellation-button execution and transport context without an extra consent gate', async () => {
  const button = `[BUTTON_ACTION: cancel_reservation id=${code}]`;
  mockCreate.mockResolvedValueOnce(tools(call('cancel_reservation', { reservation_id: code })))
    .mockResolvedValueOnce(text('Your reservation was cancelled.'));
  expect(await run(button)).toBe('Your reservation was cancelled.');
  expect(mockExecute).toHaveBeenCalledWith('cancel_reservation', { reservation_id: code }, session,
    expect.objectContaining({ ...inbound, timezone: 'Europe/Madrid', language: 'en' }));
  expect(mockCreate.mock.calls[0][0].messages.at(-1)).toEqual({ role: 'user', content: button });
});

test('read-only AI failures can still retry once before any mutation', async () => {
  mockCreate.mockResolvedValueOnce(tools(call('lookup_reservation'))).mockRejectedValueOnce(new Error('AI timeout'))
    .mockResolvedValueOnce(text('Please confirm the new time.'));
  expect(await run()).toBe('Please confirm the new time.');
  expect(mockExecute).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledTimes(3);
});

test('tool-round budget spans read-only retries and refuses a mutation requested beyond the limit', async () => {
  mockCreate.mockResolvedValueOnce(tools(call('lookup_reservation')))
    .mockResolvedValueOnce(tools(call('lookup_reservation')))
    .mockRejectedValueOnce(new Error('AI timeout'));
  let followups = 0;
  mockCreate.mockImplementation(async () => ++followups <= 4
    ? tools(call('lookup_reservation')) : tools(call('modify_reservation')));
  await run();
  expect(mockExecute).toHaveBeenCalledTimes(6);
  expect(mockExecute.mock.calls.every(([name]) => name === 'lookup_reservation')).toBe(true);
  expect(mockCreate).toHaveBeenCalledTimes(8);
});

test('restaurant identification preserves its found:true contract and refreshes the routed session', async () => {
  const unbound = { sender_phone: session.sender_phone };
  mockExecute.mockResolvedValue({ found: true, restaurant: session.restaurant });
  mockGetSession.mockResolvedValue(session);
  mockCreate.mockResolvedValueOnce(tools(call('identify_restaurant', { restaurant_name: 'Test restaurant' })))
    .mockResolvedValueOnce(text('How can I help?'));
  expect(await processWithAI('Test restaurant', unbound)).toBe('How can I help?');
  expect(mockGetSession).toHaveBeenCalledWith(session.sender_phone, null);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test('a later read-only failure retains confirmed booking evidence without restarting a mutation', async () => {
  mockCreate.mockResolvedValueOnce(tools(call('modify_reservation')))
    .mockResolvedValueOnce(tools(call('lookup_reservation')));
  mockExecute.mockResolvedValueOnce({ success: true, changed: true }).mockRejectedValueOnce(new Error('lookup unavailable'));
  expect(await run()).toMatch(/applied|updated/i);
  expect(mockExecute.mock.calls.map(([name]) => name)).toEqual(['modify_reservation', 'lookup_reservation']);
  expect(mockCreate).toHaveBeenCalledTimes(2);
});

test.each(['en', 'es', 'pt-BR'])('uncertainty responses use the session language %s', async language => {
  mockCreate.mockResolvedValueOnce(tools(call()));
  mockExecute.mockResolvedValue(null);
  const response = await processWithAI('Yes', { ...session, restaurant: { ...session.restaurant, language } });
  expect(response).toMatch(language === 'en' ? /verify/i : language === 'es' ? /verificar/i : /verificar/i);
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

test.each([true, false])('confirmation and proof policy reaches the model with restaurant config=%s', async withConfig => {
  if (!withConfig) mockConfig = null;
  await run('Move my reservation to 20:00.');
  const prompt = mockCreate.mock.calls[0][0].system;
  expect(prompt).toMatch(/full.*readback|read back.*complete/i);
  expect(prompt).toMatch(/subsequent user.*yes/i);
  expect(prompt).toMatch(/changed=false/);
  expect(prompt).toMatch(/mutation_unavailable/);
  expect(prompt).toMatch(/complete confirmation code/i);
});
