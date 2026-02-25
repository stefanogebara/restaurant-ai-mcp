import type { RestaurantSize } from '../types/profile.types';

const TABLE_CAPACITIES = [2, 4, 6, 8];

/**
 * Calculate recommended table distribution based on restaurant size and total seats
 */
export function calculateTableDistribution(
  size: RestaurantSize,
  totalSeats: number
): { capacity: number; count: number }[] {
  const distributions: Record<RestaurantSize, { capacity: number; ratio: number }[]> = {
    small: [
      { capacity: 2, ratio: 0.50 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.15 },
    ],
    medium: [
      { capacity: 2, ratio: 0.35 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.20 },
      { capacity: 8, ratio: 0.10 },
    ],
    large: [
      { capacity: 2, ratio: 0.25 },
      { capacity: 4, ratio: 0.35 },
      { capacity: 6, ratio: 0.25 },
      { capacity: 8, ratio: 0.15 },
    ],
  };

  const dist = distributions[size] || distributions.medium;
  const avgSeatsPerTable = dist.reduce((sum, d) => sum + d.capacity * d.ratio, 0);
  const estimatedTables = Math.ceil(totalSeats / avgSeatsPerTable);

  let remainingSeats = totalSeats;
  const result: { capacity: number; count: number }[] = [];

  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    const isLast = i === dist.length - 1;
    if (isLast) {
      result.push({ capacity: d.capacity, count: Math.max(0, Math.ceil(remainingSeats / d.capacity)) });
    } else {
      const count = Math.round(estimatedTables * d.ratio);
      remainingSeats -= count * d.capacity;
      result.push({ capacity: d.capacity, count: Math.max(0, count) });
    }
  }

  // Ensure all capacities are represented
  TABLE_CAPACITIES.forEach(cap => {
    if (!result.find(r => r.capacity === cap)) {
      result.push({ capacity: cap, count: 0 });
    }
  });

  result.sort((a, b) => a.capacity - b.capacity);
  return result;
}
