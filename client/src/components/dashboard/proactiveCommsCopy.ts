import type { ProactiveCommItem } from '../../hooks/useProactiveComms';

/** Old queue rows contain a persisted "N% churn risk" sentence. Prefer the
 * structured trigger data so switching language never repeats that false
 * probability claim. */
export function churnSummaryParts(item: ProactiveCommItem, language: string) {
  if (item.type !== 'churn_risk' && item.type !== 'long_absent') return null;
  const storedScore = item.trigger_data?.churn_risk;
  const storedVisits = item.trigger_data?.total_visits;
  const rawScore = Number(storedScore);
  const rawVisits = Number(storedVisits);
  const score = storedScore != null && Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 100 ? Math.round(rawScore) : null;
  const visits = storedVisits != null && Number.isInteger(rawVisits) && rawVisits >= 0 ? rawVisits : null;
  const rawDate = item.trigger_data?.last_visit;
  let lastVisit: string | null = null;
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const date = new Date(`${rawDate}T12:00:00Z`);
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === rawDate) {
      lastVisit = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
    }
  }
  return { score, visits, lastVisit };
}
