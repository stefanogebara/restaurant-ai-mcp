'use strict';

// Voice check_availability asks the booking rule (check_guest_slots: the slot
// checks of book_guest_reservation) and keeps only the physical table check
// (canAccommodateParty). The rule itself is tested against Postgres in
// scripts/auditoria-reservas (r8, r9). Here: input guards, what is asked, and
// how each answer of the rule is spoken.
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
const mockRpc = jest.fn();
jest.mock('../_lib/supabase', () => ({
  canAccommodateParty: jest.fn(),
  supabaseAdmin: { rpc: (...args) => mockRpc(...args) },
}));

const { canAccommodateParty } = require('../_lib/supabase');
const { checkAvailability } = require('../_lib/tool-handlers');
const restaurant = {
  id: 'sandbox', restaurant_name: 'Sandbox', timezone: 'UTC',
  reservation_settings: { advance_booking_days: 30, max_party_size: 6 },
};
const input = { date: '2026-11-11', time: '20:00', party_size: 3 };
const check = (overrides = {}, config = {}) => checkAvailability('sandbox', { ...restaurant, ...config }, { ...input, ...overrides });

// The rule's answer for each start; 'ok' unless a test says otherwise.
let mockStatus;
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') });
  mockStatus = () => 'ok';
  mockRpc.mockImplementation(async (_, args) => ({
    data: { status: 'ok', slots: args.p_starts.map(start => ({
      date: start.slice(0, 10), time: start.slice(11), status: mockStatus(start), seats_available: 5,
    })) },
    error: null,
  }));
  canAccommodateParty.mockResolvedValue({ success: true, can_accommodate: true });
});
afterEach(() => { jest.useRealTimers(); });

function expectNothingAsked() {
  expect(mockRpc).not.toHaveBeenCalled();
  expect(canAccommodateParty).not.toHaveBeenCalled();
}

test.each([
  ['an impossible calendar date', { date: '2026-11-31' }],
  ['an unresolved relative date', { date: 'tomorrow' }],
  ['fractional guests', { party_size: 3.5 }],
  ['a fractional guest string', { party_size: '3.5' }],
  ['numeric-prefix junk', { party_size: '3people' }],
  ['negative guests', { party_size: -3 }],
  ['zero guests', { party_size: 0 }],
  ['boolean guests', { party_size: true }],
  ['an invalid clock time', { time: '25:00' }],
])('refuses %s before asking the rule or suggesting a time', async (_label, invalid) => {
  const result = await check(invalid);
  expectNothingAsked();
  expect(result.success).toBe(false);
  expect(result.available).not.toBe(true);
  expect(result.alternative_times || []).toHaveLength(0);
  expect(result.message).not.toMatch(/we have space|is available/i);
});

test('an invalid leap day is refused before asking the rule; a valid one is asked', async () => {
  expect(await check({ date: '2027-02-29' })).toMatchObject({ success: false, error: 'INVALID_DATE' });
  expectNothingAsked();
  expect(await check({ date: '2028-02-29' })).toMatchObject({ success: true, available: true });
});

test('asks the rule for the requested start first, then two hours either side every 30 minutes', async () => {
  await check();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  const [fn, args] = mockRpc.mock.calls[0];
  expect(fn).toBe('check_guest_slots');
  expect(args).toMatchObject({ p_restaurant_id: 'sandbox', p_party_size: 3 });
  expect(args.p_starts).toEqual(['20:00', '18:00', '18:30', '19:00', '19:30', '20:30', '21:00', '21:30', '22:00']
    .map(time => `2026-11-11T${time}`));
});

test('near midnight, no start outside the day is asked', async () => {
  await check({ time: '23:30' });
  expect(mockRpc.mock.calls[0][1].p_starts).toEqual(['23:30', '21:30', '22:00', '22:30', '23:00'].map(t => `2026-11-11T${t}`));
});

test.each([3, '3', '03'])('a slot the rule accepts, with tables that fit, is available (party %j)', async party_size => {
  const result = await check({ party_size });
  expect(result).toMatchObject({ success: true, available: true });
  expect(canAccommodateParty).toHaveBeenCalledWith('sandbox', 3, { date: input.date, time: input.time, durationMinutes: 90 });
});

test('the restaurant dining duration is used for the table check, kept between 30 and 360 minutes', async () => {
  await check({}, { average_dining_duration_minutes: 500 });
  expect(canAccommodateParty).toHaveBeenCalledWith('sandbox', 3, expect.objectContaining({ durationMinutes: 360 }));
});

test.each([
  ['past_slot', 'PAST_DATE', false, /^The requested date and time is in the past\. Today at the restaurant is Tuesday, 2026-11-10/],
  ['too_far', 'TOO_FAR', false, /up to 30 days in advance\. Today at the restaurant is Tuesday, 2026-11-10/],
  ['party_too_large', 'PARTY_TOO_LARGE', false, /up to 6 guests/],
  ['outside_hours', 'CLOSED', true, /closed at that time/],
  ['too_late', 'TOO_LATE', true, /after the last seating/],
  ['unavailable', 'FULLY_BOOKED', true, /20:00 is fully booked for 3 guests/],
])('the rule answer %s is spoken as %s, with no table check', async (status, code, success, message) => {
  mockStatus = start => (start.endsWith('T20:00') ? status : 'ok');
  const result = await check();
  expect(result).toMatchObject({ success, available: false, error: code });
  expect(result.message).toMatch(message);
  expect(canAccommodateParty).not.toHaveBeenCalled();
});

test('the guessed 2023 date of a live call is asked and refused as past', async () => {
  mockStatus = start => (start < '2026-11-10' ? 'past_slot' : 'ok');
  const result = await check({ date: '2023-11-11' });
  expect(result).toMatchObject({ success: false, available: false, error: 'PAST_DATE' });
  expect(result.alternative_times).toEqual([]);
});

test('alternatives are the starts the rule accepts nearest the request, at most three', async () => {
  const accepted = ['19:30', '21:00', '18:00', '22:00'];
  mockStatus = start => (accepted.includes(start.slice(11)) ? 'ok' : 'unavailable');
  const result = await check();
  expect(result.available).toBe(false);
  expect(result.alternative_times.map(a => a.time)).toEqual(['19:30', '21:00', '18:00']);
});

test('tables that cannot combine for the party are a no, with the alternatives', async () => {
  canAccommodateParty.mockResolvedValue({ success: true, can_accommodate: false, max_capacity: 4 });
  mockStatus = start => (start.endsWith('T21:00') ? 'unavailable' : 'ok');
  const result = await check();
  expect(result).toMatchObject({ success: true, available: false });
  expect(result.message).toMatch(/largest party we can seat is 4/);
  expect(result.alternative_times.map(a => a.time)).toEqual(['19:30', '20:30', '19:00']);
});

test('a failed rule check is an error, never an availability', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'down' } });
  const result = await check();
  expect(result).toMatchObject({ success: false, error: true });
  expect(result.available).toBeUndefined();
  expect(canAccommodateParty).not.toHaveBeenCalled();
});

test('without a timezone the date hint uses São Paulo', async () => {
  mockStatus = () => 'past_slot';
  const result = await check({}, { timezone: undefined });
  expect(result.message).toMatch(/\(America\/Sao_Paulo\)/);
});

test('without stored limits, a too-far answer still names today', async () => {
  mockStatus = () => 'too_far';
  const result = await check({}, { reservation_settings: undefined });
  expect(result).toMatchObject({ error: 'TOO_FAR' });
  expect(result.message).toMatch(/further ahead than the restaurant takes bookings\. Today at the restaurant is/);
});
