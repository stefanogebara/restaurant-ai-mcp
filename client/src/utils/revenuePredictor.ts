export interface PartySizeRevenue {
  range: string;
  avg_per_cover: number;
  avg_total: number;
  count: number;
}

const MIN_BUCKET_DATA_POINTS = 3;

const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in']);

export function getPartySizeBucket(partySize: number): string {
  if (partySize <= 2) return '1-2';
  if (partySize <= 4) return '3-4';
  if (partySize <= 6) return '5-6';
  return '7+';
}

export function predictReservationRevenue(
  partySize: number,
  avgSpendPerCover: number,
  byPartySize?: PartySizeRevenue[],
): number {
  if (partySize === 0) return 0;

  const bucket = getPartySizeBucket(partySize);
  const match = byPartySize?.find(b => b.range === bucket);

  const perCover =
    match && match.count >= MIN_BUCKET_DATA_POINTS
      ? match.avg_per_cover
      : avgSpendPerCover;

  return partySize * perCover;
}

export function predictDailyRevenue(
  reservations: { party_size: number; status: string }[],
  avgSpendPerCover: number,
  byPartySize?: PartySizeRevenue[],
): number {
  return reservations.reduce((sum, r) => {
    if (!ACTIVE_STATUSES.has(r.status)) return sum;
    return sum + predictReservationRevenue(r.party_size, avgSpendPerCover, byPartySize);
  }, 0);
}
