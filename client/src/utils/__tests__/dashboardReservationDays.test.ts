import { describe, expect, it } from 'vitest';
import { getDashboardDateContext, getDashboardReservationDays } from '../dashboardReservationDays';

describe('restaurant dashboard reservation calendar', () => {
  it('uses the restaurant date when a host in Madrid is already on the next day', () => {
    const now = new Date('2026-11-09T23:30:00Z');
    expect(getDashboardReservationDays('America/Sao_Paulo', now)).toEqual({ today: '2026-11-09', tomorrow: '2026-11-10', weekEnd: '2026-11-16' });
    expect(getDashboardReservationDays('Europe/Madrid', now)).toEqual({ today: '2026-11-10', tomorrow: '2026-11-11', weekEnd: '2026-11-17' });
  });

  it('rolls forward at restaurant midnight, not browser midnight', () => {
    expect(getDashboardReservationDays('America/Sao_Paulo', new Date('2026-11-10T02:59:59Z')).today).toBe('2026-11-09');
    expect(getDashboardReservationDays('America/Sao_Paulo', new Date('2026-11-10T03:00:00Z'))).toEqual({ today: '2026-11-10', tomorrow: '2026-11-11', weekEnd: '2026-11-17' });
  });

  it.each([
    ['2026-03-28T22:30:00Z', '2026-03-28', '2026-03-29', '2026-04-04'],
    ['2026-03-28T23:30:00Z', '2026-03-29', '2026-03-30', '2026-04-05'],
    ['2026-10-24T22:30:00Z', '2026-10-25', '2026-10-26', '2026-11-01'],
  ])('adds calendar days across Madrid DST from %s', (instant, today, tomorrow, weekEnd) => {
    expect(getDashboardReservationDays('Europe/Madrid', new Date(instant))).toEqual({ today, tomorrow, weekEnd });
  });

  it.each([
    ['2026-12-31T23:30:00Z', '2026-12-31', '2027-01-01', '2027-01-07'],
    ['2028-02-28T23:30:00Z', '2028-02-28', '2028-02-29', '2028-03-06'],
  ])('handles month/year/leap-day rollover from %s', (instant, today, tomorrow, weekEnd) => {
    expect(getDashboardReservationDays('UTC', new Date(instant))).toEqual({ today, tomorrow, weekEnd });
  });

  it('handles restaurants on the positive side of the date line', () => {
    expect(getDashboardReservationDays('Pacific/Kiritimati', new Date('2026-11-09T12:30:00Z'))).toEqual({ today: '2026-11-10', tomorrow: '2026-11-11', weekEnd: '2026-11-17' });
  });

  it.each([undefined, null, '', '  ', 'not/a-zone'])('falls back to the API UTC calendar for a missing or invalid zone: %s', zone => {
    expect(getDashboardReservationDays(zone, new Date('2026-11-09T23:30:00Z'))).toEqual({ today: '2026-11-09', tomorrow: '2026-11-10', weekEnd: '2026-11-16' });
  });
});


describe('shared restaurant clock for header and greeting', () => {
  it.each([
    ['America/Sao_Paulo', '2026-11-09T23:30:00Z', 20, '2026-11-09', '2026-11-10', '2026-11-16'],
    ['America/Sao_Paulo', '2026-11-10T03:00:00Z', 0, '2026-11-10', '2026-11-11', '2026-11-17'],
    ['Europe/Madrid', '2026-03-29T01:30:00Z', 3, '2026-03-29', '2026-03-30', '2026-04-05'],
    ['Europe/Madrid', '2026-10-25T01:30:00Z', 2, '2026-10-25', '2026-10-26', '2026-11-01'],
  ] as const)('keeps the instant, validated zone, hour and days together for %s at %s', (timeZone, instant, hour, today, tomorrow, weekEnd) => {
    const now = new Date(instant);
    expect(getDashboardDateContext(timeZone, now)).toEqual({ now, timeZone, hour, today, tomorrow, weekEnd });
  });

  it.each([undefined, 'invalid/zone'])('shares UTC fallback with every header field for zone %s', zone => {
    const now = new Date('2026-11-09T23:30:00Z');
    expect(getDashboardDateContext(zone, now)).toEqual({
      now, timeZone: 'UTC', hour: 23, today: '2026-11-09', tomorrow: '2026-11-10', weekEnd: '2026-11-16',
    });
  });
});
