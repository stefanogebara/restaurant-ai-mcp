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
