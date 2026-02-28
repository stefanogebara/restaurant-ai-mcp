import { describe, it, expect } from 'vitest';
import { presetToRange } from '../DateRangePicker';

describe('presetToRange', () => {
  it('today: same start and end', () => {
    const { startDate, endDate } = presetToRange('today');
    expect(startDate).toBe(endDate);
  });

  it('7d: 7-day gap', () => {
    const { startDate, endDate } = presetToRange('7d');
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    expect(diff).toBe(7);
  });

  it('30d: 30-day gap', () => {
    const { startDate, endDate } = presetToRange('30d');
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    expect(diff).toBe(30);
  });

  it('this_month: starts on day 1', () => {
    expect(presetToRange('this_month').startDate.endsWith('-01')).toBe(true);
  });

  it('last_month: start before end', () => {
    const { startDate, endDate } = presetToRange('last_month');
    expect(new Date(startDate) < new Date(endDate)).toBe(true);
  });
});
