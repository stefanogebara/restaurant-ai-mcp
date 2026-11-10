import { describe, expect, it } from 'vitest';
import { normalizeCallToolActivities } from '../callToolActivities';
import type { ToolUsed } from '../callTrackingTypes';

const parameters = { date: '2026-11-11', time: '19:00', phone: '+5511999990000', party_size: 2,
  customer_name: 'Teste Onix104', customer_phone: '+5511999990000', restaurant_name: 'Seatable CI Sandbox', conversation_started: true };
const start = { tool_name: 'create_reservation', success: null, parameters, timestamp: '2026-11-10T11:07:32.374Z' };
const finish = { tool_name: 'create_reservation', success: true, parameters: { ...parameters },
  timestamp: '2026-11-10T11:07:34.689Z', result: { reservation_id: 'RES-EXAMPLE' } };

describe('call activity lifecycle projection', () => {
  it('projects the real start/result pair as one completed activity without changing raw evidence', () => {
    const check = { tool_name: 'check_availability', success: true, parameters: { date: '2026-11-11', time: '19:00', party_size: 2 } };
    const source = Object.freeze([check, Object.freeze(start), Object.freeze(finish)]);
    const before = JSON.stringify(source);
    expect(normalizeCallToolActivities(source)).toEqual([check, finish]);
    expect(JSON.stringify(source)).toBe(before); expect(source).toHaveLength(3);
  });
  it('compares nested parameter objects structurally, independent of object key order', () => {
    const a = { ...start, parameters: { filter: { date: parameters.date, guests: [2, 4] }, time: parameters.time } };
    const b = { ...finish, parameters: { time: parameters.time, filter: { guests: [2, 4], date: parameters.date } } };
    expect(normalizeCallToolActivities([a, b])).toEqual([b]);
  });
  it('retains a genuine failure as the terminal activity', () => {
    const failed = { ...finish, success: false };
    expect(normalizeCallToolActivities([start, failed])).toEqual([failed]);
  });
  it('keeps every repeated terminal result, even with identical parameters and reservation code', () => {
    const retry = { ...finish, timestamp: '2026-11-10T11:07:36Z' };
    expect(normalizeCallToolActivities([start, finish, retry])).toEqual([finish, retry]);
  });
  it('keeps separately completed repeated invocations', () => {
    expect(normalizeCallToolActivities([start, finish, start, finish])).toEqual([finish, finish]);
  });
  it.each([
    { ...finish, parameters: { ...parameters, party_size: 3 } },
    { ...finish, parameters: { ...parameters, party_size: '2' } },
    { ...finish, tool_name: 'lookup_reservation' },
    { ...finish, success: null },
    { ...finish, success: undefined },
  ])('does not collapse mismatched or unknown terminal records: %j', terminal => {
    expect(normalizeCallToolActivities([start, terminal])).toEqual([start, terminal]);
  });
  it('does not treat an availability result with unknown status as a known start marker', () => {
    const unknown = { ...start, tool_name: 'check_availability' }; const completed = { ...finish, tool_name: 'check_availability' };
    expect(normalizeCallToolActivities([unknown, completed])).toEqual([unknown, completed]);
  });
  it('retains an unresolved start and a nonadjacent terminal', () => {
    const other = { tool_name: 'get_current_datetime', success: true };
    expect(normalizeCallToolActivities([start, other, finish])).toEqual([start, other, finish]);
  });
  it('keeps all records when concurrent matching starts make pairing ambiguous', () => {
    expect(normalizeCallToolActivities([start, start, finish, finish])).toEqual([start, start, finish, finish]);
    expect(normalizeCallToolActivities([start, start, finish])).toEqual([start, start, finish]);
  });
  it('does not let a different unresolved start prevent an otherwise unambiguous adjacent pair', () => {
    const other = { ...start, parameters: { ...parameters, time: '20:00' } };
    expect(normalizeCallToolActivities([other, start, finish])).toEqual([other, finish]);
  });
  it('retains unknown results with missing or malformed parameters', () => {
    for (const params of [undefined, null, [], 'same']) {
      const a = { ...start, parameters: params } as unknown as ToolUsed;
      const b = { ...finish, parameters: params } as unknown as ToolUsed;
      expect(normalizeCallToolActivities([a, b])).toEqual([a, b]);
    }
  });
  it('preserves unknown starts which are not explicitly null lifecycle markers', () => {
    const unknown = { ...start, success: undefined };
    expect(normalizeCallToolActivities([unknown, finish])).toEqual([unknown, finish]);
  });
});


function withoutRestaurantName(params: Record<string, unknown> = parameters) {
  const copy = { ...params };
  delete copy.restaurant_name;
  return copy;
}

describe('historical creation logs with an omitted restaurant-name decoration', () => {
  it('projects the PT110 six-event sequence to availability, success, availability, failure without changing raw evidence', () => {
    // Reproduce the reported PT110 event shape with synthetic guest parameters.
    const check = { tool_name: 'check_availability', success: true, parameters: { date: parameters.date, time: parameters.time, party_size: 2 } };
    const secondCheck = { ...check };
    const failed = { ...finish, success: false, parameters: Object.freeze(withoutRestaurantName()), result: { error: 'Reservation failed' } };
    const source = Object.freeze([check, start, finish, secondCheck, { ...start }, failed].map(event => Object.freeze(event)));
    const before = JSON.stringify(source);
    const activities = normalizeCallToolActivities(source);
    expect(activities).toEqual([check, finish, secondCheck, failed]);
    expect(activities.map(({ tool_name, success }) => [tool_name, success])).toEqual([
      ['check_availability', true], ['create_reservation', true], ['check_availability', true], ['create_reservation', false],
    ]);
    activities.forEach((event, index) => expect(event).toBe(source[[0, 2, 3, 5][index]]));
    expect(JSON.stringify(source)).toBe(before);
    expect(source).toHaveLength(6);
  });

  it.each([true, false])('pairs an adjacent %s result when only its restaurant name is omitted', success => {
    const result = { ...finish, success, parameters: withoutRestaurantName() };
    expect(normalizeCallToolActivities([start, result])).toEqual([result]);
  });

  it('also pairs when only the start omits the restaurant name', () => {
    const undecoratedStart = { ...start, parameters: withoutRestaurantName() };
    expect(normalizeCallToolActivities([undecoratedStart, finish])).toEqual([finish]);
  });

  it('retains two explicitly different restaurant names', () => {
    const result = { ...finish, parameters: { ...parameters, restaurant_name: 'Another restaurant' } };
    expect(normalizeCallToolActivities([start, result])).toEqual([start, result]);
  });

  it.each([
    { ...withoutRestaurantName(), time: '20:00' },
    { ...withoutRestaurantName(), party_size: '2' },
    { ...withoutRestaurantName(), customer_phone: '+5511999990001' },
    { ...withoutRestaurantName(), extra: true },
    withoutRestaurantName({ ...parameters, conversation_started: undefined }),
  ])('does not ignore any additional parameter difference: %j', resultParameters => {
    const result = { ...finish, parameters: resultParameters };
    expect(normalizeCallToolActivities([start, result])).toEqual([start, result]);
  });

  it('does not ignore a nested restaurant-name omission', () => {
    const nestedStart = { ...start, parameters: { booking: parameters } };
    const nestedResult = { ...finish, parameters: { booking: withoutRestaurantName() } };
    expect(normalizeCallToolActivities([nestedStart, nestedResult])).toEqual([nestedStart, nestedResult]);
  });

  it.each([null, undefined, '', 2])('does not treat a malformed name (%s) as a removable decoration', restaurant_name => {
    const malformedStart = { ...start, parameters: { ...parameters, restaurant_name } };
    const result = { ...finish, parameters: withoutRestaurantName() };
    expect(normalizeCallToolActivities([malformedStart, result])).toEqual([malformedStart, result]);
  });

  it('keeps distinct adjacent attempts and every repeated terminal record', () => {
    const failed = { ...finish, success: false, parameters: withoutRestaurantName() };
    const repeatedFailure = { ...failed, timestamp: '2026-11-10T11:08:01Z' };
    expect(normalizeCallToolActivities([start, finish, start, failed, repeatedFailure])).toEqual([finish, failed, repeatedFailure]);
  });

  it('retains an unknown nonadjacent start even when only the result omits its restaurant name', () => {
    const check = { tool_name: 'check_availability', success: true };
    const result = { ...finish, parameters: withoutRestaurantName() };
    expect(normalizeCallToolActivities([start, check, result])).toEqual([start, check, result]);
  });

  it.each([
    [start, start, { ...finish, parameters: withoutRestaurantName() }],
    [start, { ...start, parameters: withoutRestaurantName() }, finish],
    [{ ...start, parameters: withoutRestaurantName() }, start, finish],
    [start, { ...start, parameters: { ...parameters, restaurant_name: 'Another restaurant' } }, { ...finish, parameters: withoutRestaurantName() }],
  ])('keeps all records when the name omission leaves multiple possible starts: %j', (...source) => {
    expect(normalizeCallToolActivities(source)).toEqual(source);
  });

  it('does not let completed identical ambiguous starts block a later distinct attempt', () => {
    const source = [start, start, finish, finish, start, finish];
    expect(normalizeCallToolActivities(source)).toEqual([start, start, finish, finish, finish]);
  });

  it('does not clear an arbitrary pending start after an ambiguous nameless result', () => {
    const anotherStart = { ...start, parameters: { ...parameters, restaurant_name: 'Another restaurant' } };
    const ambiguousResult = { ...finish, parameters: withoutRestaurantName() };
    const source = [start, anotherStart, ambiguousResult, start, finish];
    expect(normalizeCallToolActivities(source)).toEqual(source);
  });

  it('keeps a differently named pending attempt separate when the terminal name disambiguates the adjacent pair', () => {
    const undecoratedStart = { ...start, parameters: withoutRestaurantName() };
    const result = { ...finish, parameters: { ...parameters, restaurant_name: 'Another restaurant' } };
    expect(normalizeCallToolActivities([start, undecoratedStart, result])).toEqual([start, result]);
  });

  it('lets an unrelated pending attempt remain separate from an adjacent historical pair', () => {
    const other = { ...start, parameters: { ...parameters, time: '20:00' } };
    const result = { ...finish, parameters: withoutRestaurantName() };
    expect(normalizeCallToolActivities([other, start, result])).toEqual([other, result]);
  });
});
