const { calculateStaffing, buildForecast } = require('../_services/staffingService');

const DEFAULT_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

it('rounds up fractional staff', () => {
  const result = calculateStaffing(16, DEFAULT_ROLES);
  expect(result.find(r => r.name === 'FOH').recommended).toBe(2); // ceil(16/15)
});

it('minimum 1 staff per role even with 0 covers', () => {
  const result = calculateStaffing(0, DEFAULT_ROLES);
  result.forEach(r => expect(r.recommended).toBe(1));
});

it('calculates each role independently', () => {
  const result = calculateStaffing(30, DEFAULT_ROLES);
  expect(result.find(r => r.name === 'FOH').recommended).toBe(2); // ceil(30/15)
  expect(result.find(r => r.name === 'BOH').recommended).toBe(2); // ceil(30/20)
  expect(result.find(r => r.name === 'Bar').recommended).toBe(2); // ceil(30/25)
});

it('returns empty array when roles config is empty', () => {
  const result = calculateStaffing(50, []);
  expect(result).toEqual([]);
});

it('buildForecast shapes output correctly', () => {
  const reservationsByDate = [{ date: '2026-03-02', covers: 42 }];
  const forecast = buildForecast(reservationsByDate, DEFAULT_ROLES);
  expect(forecast[0]).toMatchObject({
    date: '2026-03-02',
    expected_covers: 42,
    roles: expect.arrayContaining([
      expect.objectContaining({ name: 'FOH', recommended: 3 }),
    ]),
  });
});

it('buildForecast includes day abbreviation', () => {
  const forecast = buildForecast([{ date: '2026-03-02', covers: 10 }], DEFAULT_ROLES);
  expect(forecast[0].day).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
});
