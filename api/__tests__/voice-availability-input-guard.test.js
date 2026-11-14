'use strict';

// Real availability handler and calculator, with every capacity read mocked.
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/supabase', () => ({
  getReservations: jest.fn(), canAccommodateParty: jest.fn(),
}));
jest.mock('../_lib/db/tables', () => ({ getAllTables: jest.fn() }));

const { getReservations, canAccommodateParty } = require('../_lib/supabase');
const { getAllTables } = require('../_lib/db/tables');
const { checkAvailability } = require('../_lib/tool-handlers');
const restaurant = { id: 'sandbox', restaurant_name: 'Sandbox', timezone: 'UTC' };
const input = { date: '2026-11-11', time: '20:00', party_size: 3 };
const check = (overrides = {}, config = {}) => checkAvailability('sandbox', { ...restaurant, ...config }, { ...input, ...overrides });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ now: new Date('2026-11-10T12:00:00Z') });
  getAllTables.mockResolvedValue({ success: true, tables: [{ capacity: 8, status: 'Available' }] });
  getReservations.mockResolvedValue({ success: true, data: { records: [] } });
  canAccommodateParty.mockResolvedValue({ can_accommodate: true });
});
afterEach(() => { jest.useRealTimers(); });

function expectNoCapacityRead() {
  expect(getAllTables).not.toHaveBeenCalled();
  expect(getReservations).not.toHaveBeenCalled();
  expect(canAccommodateParty).not.toHaveBeenCalled();
}

test.each([
  ['the live-call past date', { date: '2023-11-11' }],
  ['an impossible calendar date', { date: '2026-11-31' }],
  ['an unresolved relative date', { date: 'tomorrow' }],
  ['fractional guests', { party_size: 3.5 }],
  ['a fractional guest string', { party_size: '3.5' }],
  ['numeric-prefix junk', { party_size: '3people' }],
  ['negative guests', { party_size: -3 }],
  ['zero guests', { party_size: 0 }],
  ['boolean guests', { party_size: true }],
  ['an invalid clock time', { time: '25:00' }],
])('refuses %s before any capacity read or suggested time', async (_label, invalid) => {
  const result = await check(invalid);
  expectNoCapacityRead();
  expect(result.success).toBe(false);
  expect(result.available).not.toBe(true);
  expect(result.alternative_times || []).toHaveLength(0);
  expect(result.message).not.toMatch(/we have space|is available/i);
});

test.each([3, '3', '03'])('a valid future slot with party size %j still checks integer capacity', async party_size => {
  const result = await check({ party_size });
  expect(result).toMatchObject({ success: true, available: true });
  expect(getAllTables).toHaveBeenCalledWith('sandbox');
  expect(getReservations).toHaveBeenCalledWith('sandbox', { date: input.date, status: null });
  expect(canAccommodateParty).toHaveBeenCalledWith('sandbox', 3, {
    date: input.date, time: input.time, durationMinutes: 90,
  });
});

test.each([
  ['America/Los_Angeles', '2026-11-11T00:30:00Z', '2026-11-10', '17:00', true],
  ['Asia/Tokyo', '2026-11-10T23:30:00Z', '2026-11-10', '23:45', false],
  ['America/Sao_Paulo', '2026-11-11T01:30:00Z', '2026-11-10', '23:00', true],
  ['Europe/Madrid', '2026-11-10T19:30:00Z', '2026-11-10', '20:00', false],
  ['Asia/Kolkata', '2026-11-10T14:30:00Z', '2026-11-10', '20:30', true],
  ['UTC', '2026-11-11T00:30:00Z', '2026-11-11', '00:45', true],
])('uses the %s local clock at %s for %s %s', async (timezone, now, date, time, available) => {
  jest.setSystemTime(new Date(now));
  const result = await check({ date, time }, { timezone });
  if (available) {
    expect(result).toMatchObject({ success: true, available: true });
    expect(canAccommodateParty).toHaveBeenCalledTimes(1);
  } else {
    expect(result).toMatchObject({ success: false, available: false, error: 'PAST_DATE' });
    expectNoCapacityRead();
    expect(result.alternative_times || []).toHaveLength(0);
  }
});

test('missing timezone uses the existing create-validator default of Sao Paulo', async () => {
  jest.setSystemTime(new Date('2026-11-11T01:30:00Z'));
  expect(await check({ date: '2026-11-10', time: '23:00' }, { timezone: undefined }))
    .toMatchObject({ success: true, available: true });
});

test('a valid leap day remains available', async () => {
  jest.setSystemTime(new Date('2028-02-28T12:00:00Z'));
  expect(await check({ date: '2028-02-29' })).toMatchObject({ success: true, available: true });
});

test('an invalid leap day is rejected before capacity reads', async () => {
  jest.setSystemTime(new Date('2027-02-28T12:00:00Z'));
  expect(await check({ date: '2027-02-29' })).toMatchObject({ success: false, error: 'INVALID_DATE' });
  expectNoCapacityRead();
});

test.each([
  { wednesday: { is_open: false } },
  [{ day: 'Wednesday', is_open: false }],
])('keeps the closed-day response for business-hours configuration %j', async business_hours => {
  const result = await check({}, { business_hours });
  expect(result).toMatchObject({ success: true, available: false, details: { day: 'wednesday', is_closed: true } });
  expect(getReservations).not.toHaveBeenCalled();
  expect(canAccommodateParty).not.toHaveBeenCalled();
});

test('availability does not acquire the create-only advance-booking limits', async () => {
  expect(await check({}, { min_advance_hours: 48, max_advance_days: 0.5 }))
    .toMatchObject({ success: true, available: true });
});

describe("the restaurant's own booking limits (reservation_settings) are shared with creation", () => {
  const { validateReservation } = require('../_lib/reservation-validator');
  const settings = { reservation_settings: { advance_booking_days: 30, max_party_size: 6 } };
  // Fake clock: 2026-11-10T12:00Z, restaurant zone UTC -> the window ends 2026-12-10.

  test('availability refuses a date past the window, before any capacity read', async () => {
    const result = await check({ date: '2026-12-11' }, settings);
    expect(result).toMatchObject({ success: false, available: false, error: 'TOO_FAR' });
    expect(result.message).toMatch(/up to 30 days in advance\. Today at the restaurant is Tuesday, 2026-11-10/);
    expectNoCapacityRead();
  });

  test('availability refuses a party above the restaurant limit, before any capacity read', async () => {
    expect(await check({ party_size: 7 }, settings)).toMatchObject({ success: false, available: false, error: 'PARTY_TOO_LARGE' });
    expectNoCapacityRead();
  });

  test('the last day of the window is offered, and creation accepts the same day', async () => {
    expect(await check({ date: '2026-12-10' }, settings)).toMatchObject({ success: true, available: true });
    expect(validateReservation({ date: '2026-12-10', time: '20:00', party_size: 2 }, { ...restaurant, ...settings }).valid).toBe(true);
  });

  test('creation refuses the first day past the window and a party above the limit', () => {
    const far = validateReservation({ date: '2026-12-11', time: '20:00', party_size: 2 }, { ...restaurant, ...settings });
    expect(far.errors.map(e => e.code)).toContain('TOO_FAR');
    expect(far.message).toMatch(/up to 30 days in advance/);
    const big = validateReservation({ date: '2026-11-20', time: '20:00', party_size: 7 }, { ...restaurant, ...settings });
    expect(big.errors.map(e => e.code)).toContain('PARTY_TOO_LARGE');
  });

  test('without stored limits, availability has no window and creation keeps its 90-day default', async () => {
    expect(await check({ date: '2027-06-01' })).toMatchObject({ success: true, available: true });
    const far = validateReservation({ date: '2027-02-09', time: '20:00', party_size: 2 }, restaurant);
    expect(far.errors.map(e => e.code)).toContain('TOO_FAR');
    expect(validateReservation({ date: '2027-02-08', time: '20:00', party_size: 2 }, restaurant).valid).toBe(true);
  });

  test.each([[{ advance_booking_days: 'thirty' }], [{ advance_booking_days: -3 }], [{}]])(
    'an unreadable stored limit %p is no limit, as in the booking function', async stored => {
      expect(await check({ date: '2027-06-01' }, { reservation_settings: stored })).toMatchObject({ success: true, available: true });
    });
});
