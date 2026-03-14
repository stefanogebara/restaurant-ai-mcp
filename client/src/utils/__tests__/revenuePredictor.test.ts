import { describe, it, expect } from 'vitest';
import {
  predictReservationRevenue,
  predictDailyRevenue,
  getPartySizeBucket,
  type PartySizeRevenue,
} from '../revenuePredictor';

const sampleBuckets: PartySizeRevenue[] = [
  { range: '1-2', avg_per_cover: 65.5, avg_total: 131.0, count: 10 },
  { range: '3-4', avg_per_cover: 78.9, avg_total: 315.6, count: 8 },
  { range: '5-6', avg_per_cover: 82.1, avg_total: 410.5, count: 5 },
  { range: '7+', avg_per_cover: 95.0, avg_total: 475.0, count: 1 },
];

describe('getPartySizeBucket', () => {
  it('maps party sizes to correct bucket ranges', () => {
    expect(getPartySizeBucket(1)).toBe('1-2');
    expect(getPartySizeBucket(2)).toBe('1-2');
    expect(getPartySizeBucket(3)).toBe('3-4');
    expect(getPartySizeBucket(4)).toBe('3-4');
    expect(getPartySizeBucket(5)).toBe('5-6');
    expect(getPartySizeBucket(6)).toBe('5-6');
    expect(getPartySizeBucket(7)).toBe('7+');
    expect(getPartySizeBucket(12)).toBe('7+');
  });
});

describe('predictReservationRevenue', () => {
  const flatAvg = 80;

  it('uses party-size bucket avg when available with enough data (>=3)', () => {
    // Party of 4 → bucket "3-4" → avg_per_cover 78.9
    const result = predictReservationRevenue(4, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(4 * 78.9, 1); // 315.6
  });

  it('falls back to flat avg when bucket has <3 data points', () => {
    // Party of 8 → bucket "7+" → count=1 (<3), falls back to flat avg
    const result = predictReservationRevenue(8, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(8 * flatAvg, 1); // 640
  });

  it('falls back to flat avg when byPartySize is undefined', () => {
    const result = predictReservationRevenue(4, flatAvg, undefined);
    expect(result).toBeCloseTo(4 * flatAvg, 1); // 320
  });

  it('falls back to flat avg when byPartySize is empty', () => {
    const result = predictReservationRevenue(4, flatAvg, []);
    expect(result).toBeCloseTo(4 * flatAvg, 1); // 320
  });

  it('returns 0 when party size is 0', () => {
    expect(predictReservationRevenue(0, flatAvg, sampleBuckets)).toBe(0);
  });

  it('uses bucket avg for party of 2 in 1-2 range', () => {
    const result = predictReservationRevenue(2, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(2 * 65.5, 1); // 131
  });
});

describe('predictDailyRevenue', () => {
  const flatAvg = 80;

  const makeRes = (party_size: number, status: string) => ({
    party_size,
    status,
  });

  it('sums predictions for confirmed reservations', () => {
    const reservations = [
      makeRes(4, 'confirmed'),
      makeRes(2, 'confirmed'),
    ];
    const result = predictDailyRevenue(reservations, flatAvg, sampleBuckets);
    // party 4 → bucket 3-4 (78.9/cover) = 315.6
    // party 2 → bucket 1-2 (65.5/cover) = 131.0
    expect(result).toBeCloseTo(315.6 + 131.0, 0);
  });

  it('includes checked_in reservations', () => {
    const reservations = [
      makeRes(4, 'checked_in'),
      makeRes(2, 'confirmed'),
    ];
    const result = predictDailyRevenue(reservations, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(315.6 + 131.0, 0);
  });

  it('excludes cancelled reservations', () => {
    const reservations = [
      makeRes(4, 'confirmed'),
      makeRes(2, 'cancelled'),
    ];
    const result = predictDailyRevenue(reservations, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(4 * 78.9, 0); // only the confirmed one
  });

  it('excludes no-show reservations', () => {
    const reservations = [
      makeRes(4, 'confirmed'),
      makeRes(6, 'no_show'),
    ];
    const result = predictDailyRevenue(reservations, flatAvg, sampleBuckets);
    expect(result).toBeCloseTo(4 * 78.9, 0);
  });

  it('returns 0 for empty reservations', () => {
    expect(predictDailyRevenue([], flatAvg, sampleBuckets)).toBe(0);
  });

  it('returns 0 when avgSpendPerCover is 0', () => {
    const reservations = [makeRes(4, 'confirmed')];
    expect(predictDailyRevenue(reservations, 0, undefined)).toBe(0);
  });

  it('uses flat avg when no bucket data', () => {
    const reservations = [makeRes(4, 'confirmed'), makeRes(2, 'confirmed')];
    const result = predictDailyRevenue(reservations, flatAvg, undefined);
    expect(result).toBeCloseTo(4 * 80 + 2 * 80, 0); // 480
  });
});
