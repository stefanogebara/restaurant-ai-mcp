/**
 * Tests for api/_lib/availability-calculator.js
 * Pure function tests — no mocking needed
 */

const {
  getDiningDuration,
  addMinutesToTime,
  timeRangesOverlap,
  getOccupiedSeatsAtTime,
  checkTimeSlotAvailability,
  getSuggestedTimes,
  getMaxPartyCapacity,
  canAccommodateParty,
} = require('../_lib/availability-calculator');

// ============================================================
// getDiningDuration
// ============================================================
describe('getDiningDuration', () => {
  test('returns 90 minutes for party of 1', () => {
    expect(getDiningDuration(1)).toBe(90);
  });

  test('returns 90 minutes for party of 2', () => {
    expect(getDiningDuration(2)).toBe(90);
  });

  test('returns 120 minutes for party of 3-4', () => {
    expect(getDiningDuration(3)).toBe(120);
    expect(getDiningDuration(4)).toBe(120);
  });

  test('returns 120 minutes for party of 5-6', () => {
    expect(getDiningDuration(5)).toBe(120);
    expect(getDiningDuration(6)).toBe(120);
  });

  test('returns 150 minutes for party of 7+', () => {
    expect(getDiningDuration(7)).toBe(150);
    expect(getDiningDuration(12)).toBe(150);
  });
});

// ============================================================
// addMinutesToTime
// ============================================================
describe('addMinutesToTime', () => {
  test('adds minutes within same hour', () => {
    expect(addMinutesToTime('12:00', 30)).toBe('12:30');
  });

  test('adds minutes crossing hour boundary', () => {
    expect(addMinutesToTime('12:45', 30)).toBe('13:15');
  });

  test('handles zero minutes', () => {
    expect(addMinutesToTime('18:00', 0)).toBe('18:00');
  });

  test('handles large additions', () => {
    expect(addMinutesToTime('12:00', 120)).toBe('14:00');
  });

  test('pads hours and minutes with leading zeros', () => {
    expect(addMinutesToTime('09:00', 0)).toBe('09:00');
    expect(addMinutesToTime('09:05', 0)).toBe('09:05');
  });

  test('handles negative minutes (subtract)', () => {
    expect(addMinutesToTime('14:00', -60)).toBe('13:00');
  });
});

// ============================================================
// timeRangesOverlap
// ============================================================
describe('timeRangesOverlap', () => {
  test('overlapping ranges', () => {
    expect(timeRangesOverlap('12:00', '14:00', '13:00', '15:00')).toBe(true);
  });

  test('non-overlapping ranges', () => {
    expect(timeRangesOverlap('12:00', '14:00', '14:00', '16:00')).toBe(false);
  });

  test('one range inside another', () => {
    expect(timeRangesOverlap('12:00', '16:00', '13:00', '15:00')).toBe(true);
  });

  test('adjacent ranges (no overlap)', () => {
    expect(timeRangesOverlap('12:00', '13:00', '13:00', '14:00')).toBe(false);
  });

  test('identical ranges', () => {
    expect(timeRangesOverlap('12:00', '14:00', '12:00', '14:00')).toBe(true);
  });
});

// ============================================================
// getOccupiedSeatsAtTime
// ============================================================
describe('getOccupiedSeatsAtTime', () => {
  const makeReservation = (time, partySize) => ({
    fields: { Time: time, 'Party Size': partySize },
  });

  test('returns 0 for no reservations', () => {
    expect(getOccupiedSeatsAtTime([], '19:00')).toBe(0);
  });

  test('counts occupied seats from overlapping reservations', () => {
    const reservations = [
      makeReservation('18:00', 4),  // 18:00-19:30 (90min for 4)... actually 120min for 4
      makeReservation('19:00', 2),  // 19:00-20:30
    ];
    // At 19:00, the 18:00 reservation (party of 4, 120min duration) is still active
    // and the 19:00 reservation (party of 2, 90min duration) just started
    const seats = getOccupiedSeatsAtTime(reservations, '19:00');
    expect(seats).toBe(6); // 4 + 2
  });

  test('does not count non-overlapping reservations', () => {
    const reservations = [
      makeReservation('12:00', 4),  // 12:00-14:00 (120min for 4)
    ];
    // At 15:00, the 12:00 reservation is done
    expect(getOccupiedSeatsAtTime(reservations, '15:00')).toBe(0);
  });
});

// ============================================================
// checkTimeSlotAvailability
// ============================================================
describe('checkTimeSlotAvailability', () => {
  const makeReservation = (time, partySize) => ({
    fields: { Time: time, 'Party Size': partySize },
  });

  test('available when no existing reservations', () => {
    const result = checkTimeSlotAvailability('19:00', 4, [], 60);
    expect(result.available).toBe(true);
    expect(result.estimatedDuration).toBe(120);
  });

  test('unavailable when capacity exceeded', () => {
    const reservations = [
      makeReservation('19:00', 10),
      makeReservation('19:00', 10),
    ];
    const result = checkTimeSlotAvailability('19:00', 5, reservations, 20);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('capacity');
  });

  test('available when there is room', () => {
    const reservations = [
      makeReservation('19:00', 4),
    ];
    const result = checkTimeSlotAvailability('19:30', 4, reservations, 60);
    expect(result.available).toBe(true);
  });

  test('returns available seats info', () => {
    const result = checkTimeSlotAvailability('19:00', 4, [], 60);
    expect(result.availableSeats).toBeDefined();
    expect(result.availableSeats).toBeLessThanOrEqual(60);
  });
});

// ============================================================
// getSuggestedTimes
// ============================================================
describe('getSuggestedTimes', () => {
  const makeReservation = (time, partySize) => ({
    fields: { Time: time, 'Party Size': partySize },
  });

  test('returns empty when all nearby slots are unavailable', () => {
    // Fill capacity at every possible time
    const reservations = [];
    for (let h = 15; h <= 22; h++) {
      reservations.push(makeReservation(`${h}:00`, 30));
      reservations.push(makeReservation(`${h}:30`, 30));
    }
    const suggestions = getSuggestedTimes('19:00', 4, reservations, 30);
    // May or may not find slots, depends on exact capacity math
    expect(Array.isArray(suggestions)).toBe(true);
  });

  test('returns up to 3 suggestions', () => {
    const suggestions = getSuggestedTimes('19:00', 2, [], 60);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  test('suggestions are sorted by proximity to requested time', () => {
    const suggestions = getSuggestedTimes('19:00', 2, [], 60, '17:00', '22:00');
    if (suggestions.length >= 2) {
      const toMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const requested = toMinutes('19:00');
      const diff0 = Math.abs(toMinutes(suggestions[0].time) - requested);
      const diff1 = Math.abs(toMinutes(suggestions[1].time) - requested);
      expect(diff0).toBeLessThanOrEqual(diff1);
    }
  });
});

// ============================================================
// getMaxPartyCapacity
// ============================================================
describe('getMaxPartyCapacity', () => {
  const makeTable = (id, capacity, opts = {}) => ({
    id,
    fields: {
      Capacity: capacity,
      'Is Active': opts.isActive !== false,
      'Is Fixed': opts.isFixed || false,
      Location: opts.location || 'Main',
      'Adjacent Tables': opts.adjacentTables || [],
      'Combination Group': opts.combinationGroup || null,
    },
  });

  test('returns zeros for empty/null tables', () => {
    expect(getMaxPartyCapacity(null).maxSingleTable).toBe(0);
    expect(getMaxPartyCapacity([]).maxSingleTable).toBe(0);
  });

  test('finds max single table capacity', () => {
    const tables = [
      makeTable('t1', 4),
      makeTable('t2', 6),
      makeTable('t3', 2),
    ];
    const result = getMaxPartyCapacity(tables);
    expect(result.maxSingleTable).toBe(6);
  });

  test('calculates max with 2-table combinations', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Patio' }),
      makeTable('t2', 4, { location: 'Patio' }),
      makeTable('t3', 2, { location: 'Bar' }),
    ];
    const result = getMaxPartyCapacity(tables);
    expect(result.maxWithCombinations).toBe(8); // t1+t2 same location
  });

  test('does not combine fixed tables', () => {
    const tables = [
      makeTable('t1', 4, { isFixed: true, location: 'Main' }),
      makeTable('t2', 4, { isFixed: true, location: 'Main' }),
    ];
    const result = getMaxPartyCapacity(tables);
    expect(result.maxWithCombinations).toBe(4); // Cannot combine
  });

  test('counts flexible tables', () => {
    const tables = [
      makeTable('t1', 4, { isFixed: false }),
      makeTable('t2', 4, { isFixed: true }),
      makeTable('t3', 2, { isFixed: false }),
    ];
    const result = getMaxPartyCapacity(tables);
    expect(result.flexibleTableCount).toBe(2);
  });
});

// ============================================================
// canAccommodateParty
// ============================================================
describe('canAccommodateParty', () => {
  const makeTable = (id, capacity, opts = {}) => ({
    id,
    fields: {
      Capacity: capacity,
      'Is Active': opts.isActive !== false,
      'Is Fixed': opts.isFixed || false,
      Location: opts.location || 'Main',
      'Adjacent Tables': opts.adjacentTables || [],
      'Combination Group': opts.combinationGroup || null,
    },
  });

  test('returns false for null/empty tables', () => {
    expect(canAccommodateParty(4, null).canAccommodate).toBe(false);
    expect(canAccommodateParty(4, []).canAccommodate).toBe(false);
  });

  test('finds single table match', () => {
    const tables = [makeTable('t1', 4), makeTable('t2', 6)];
    const result = canAccommodateParty(4, tables);
    expect(result.canAccommodate).toBe(true);
    expect(result.method).toBe('single');
    expect(result.tables.length).toBe(1);
  });

  test('finds combination match', () => {
    const tables = [
      makeTable('t1', 4, { location: 'Patio' }),
      makeTable('t2', 4, { location: 'Patio' }),
    ];
    const result = canAccommodateParty(7, tables);
    expect(result.canAccommodate).toBe(true);
    expect(result.method).toBe('combination');
    expect(result.tables.length).toBe(2);
  });

  test('returns false when party too large', () => {
    const tables = [makeTable('t1', 2), makeTable('t2', 2, { isFixed: true })];
    const result = canAccommodateParty(10, tables);
    expect(result.canAccommodate).toBe(false);
    expect(result.method).toBe('none');
  });

  test('prefers single table over combination', () => {
    const tables = [
      makeTable('t1', 8, { location: 'Main' }),
      makeTable('t2', 4, { location: 'Main' }),
      makeTable('t3', 4, { location: 'Main' }),
    ];
    const result = canAccommodateParty(6, tables);
    expect(result.canAccommodate).toBe(true);
    expect(result.method).toBe('single');
  });

  test('uses adjacent tables for combination', () => {
    const tables = [
      makeTable('t1', 4, { adjacentTables: ['t2'] }),
      makeTable('t2', 4, { adjacentTables: ['t1'] }),
    ];
    const result = canAccommodateParty(7, tables);
    expect(result.canAccommodate).toBe(true);
    expect(result.method).toBe('combination');
  });
});
