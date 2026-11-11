'use strict';

// Audit 2026-11-11, F3: the validator parsed the requested slot with
// new Date(`${date}T${time}:00`), i.e. in the SERVER's zone. Production runs in
// UTC (measured live), so at 17:00 in São Paulo the voice agent refused 19:00
// tonight as "in the past" and 20:30 as "too soon". The slot is a wall-clock
// time in the restaurant's zone; the result must not depend on process.env.TZ.

const { validateReservation } = require('../_lib/reservation-validator');
const { localSlotToInstant } = require('../_lib/timezone');

const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const saoPaulo = { business_hours: hours, timezone: 'America/Sao_Paulo' };
const codes = r => (r.errors || []).map(e => e.code);
const originalTz = process.env.TZ;

afterAll(() => {
  jest.useRealTimers();
  if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz;
});

describe.each(['UTC', 'Asia/Tokyo', 'America/Sao_Paulo'])('server zone %s, clock 17:00 in São Paulo', serverTz => {
  beforeEach(() => {
    process.env.TZ = serverTz;
    jest.useFakeTimers({ now: new Date('2026-11-24T20:00:00Z') }); // Tue 17:00 in São Paulo
  });

  test.each([['19:00'], ['20:30'], ['21:30']])('accepts %s tonight', time => {
    const r = validateReservation({ date: '2026-11-24', time, party_size: 2 }, saoPaulo);
    expect(codes(r)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  test('refuses 17:30 tonight as too soon (under one hour)', () => {
    expect(codes(validateReservation({ date: '2026-11-24', time: '17:30', party_size: 2 }, saoPaulo))).toContain('TOO_SOON');
  });

  test('refuses 16:00 tonight as past', () => {
    expect(codes(validateReservation({ date: '2026-11-24', time: '16:00', party_size: 2 }, saoPaulo))).toContain('PAST_DATE');
  });

  test('the weekday is the local one for an early-morning slot', () => {
    // Wed 00:30 in São Paulo. Read as UTC it was Tue 21:30 local -> "closed on tuesdays".
    const r = validateReservation({ date: '2026-11-25', time: '00:30', party_size: 2 },
      { ...saoPaulo, business_hours: { ...hours, tuesday: { is_open: false }, wednesday: { is_open: true, open_time: '00:00', close_time: '23:59' } } });
    expect(codes(r)).toEqual([]);
  });
});

describe('localSlotToInstant', () => {
  test.each([
    ['2026-11-24', '19:00', 'America/Sao_Paulo', '2026-11-24T22:00:00.000Z'],
    ['2026-07-01', '19:00', 'Europe/Madrid', '2026-07-01T17:00:00.000Z'],
    ['2026-07-01', '19:00:00', 'Europe/Madrid', '2026-07-01T17:00:00.000Z'],
    ['2026-07-01', '12:00', 'UTC', '2026-07-01T12:00:00.000Z'],
  ])('%s %s in %s is %s', (date, time, zone, iso) => {
    expect(localSlotToInstant(date, time, zone).toISOString()).toBe(iso);
  });

  test.each([
    ['2026-03-29', '02:30', 'Europe/Madrid', 'does not exist (daylight-saving gap)'],
    ['2026-07-01', '24:00', 'UTC', 'is not a time'],
    ['2026-07-01', '7pm', 'UTC', 'is not HH:MM'],
    ['2026-07-01', '19:00', 'Mars/Base', 'has an unknown zone'],
  ])('%s %s in %s is refused: it %s', (date, time, zone) => {
    expect(localSlotToInstant(date, time, zone)).toBeNull();
  });

  test('an invalid time is a validation error, not an accepted booking', () => {
    const r = validateReservation({ date: '2026-12-01', time: '25:00', party_size: 2 }, saoPaulo);
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(['INVALID_TIME']);
  });
});
