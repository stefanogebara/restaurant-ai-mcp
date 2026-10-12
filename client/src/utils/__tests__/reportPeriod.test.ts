import { describe, expect, it } from 'vitest';
import { initialReportPeriod, isValidReportPeriod, shiftReportPeriod } from '../reportPeriod';

describe('report period', () => {
  it('accepts only complete real dates within 31 calendar days', () => {
    expect(isValidReportPeriod({ start: '2026-10-01', end: '2026-10-31' })).toBe(true);
    expect(isValidReportPeriod({ start: '2026-10-01', end: '2026-11-01' })).toBe(false);
    expect(isValidReportPeriod({ start: '2026-02-30', end: '2026-03-01' })).toBe(false);
    expect(isValidReportPeriod({ start: '2026-10-13', end: '2026-10-12' })).toBe(false);
  });

  it('keeps shared links on their exact selected period', () => {
    expect(initialReportPeriod('?tab=reports&start_date=2026-09-01&end_date=2026-09-07'))
      .toEqual({ start: '2026-09-01', end: '2026-09-07' });
  });

  it('defaults to seven completed calendar days, not eight including today', () => {
    expect(initialReportPeriod('', new Date('2026-10-12T12:00:00Z')))
      .toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('moves periods by calendar days without a DST-sized gap', () => {
    expect(shiftReportPeriod({ start: '2026-10-05', end: '2026-10-12' }, -1))
      .toEqual({ start: '2026-09-27', end: '2026-10-04' });
  });
});
