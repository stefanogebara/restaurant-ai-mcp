/** Calendar boundaries for reservation dates returned by the restaurant dashboard. */
export function getDashboardReservationDays(timeZone?: string | null, now = new Date()) {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timeZone?.trim() || 'UTC' });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Match the dashboard API's UTC fallback, never the travelling host's zone.
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const calendarDay = (offset: number) => {
    // UTC is only a calendar arithmetic anchor here, not the restaurant instant.
    // Calendar +1/+7 must not become 24/168-hour jumps across daylight saving.
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    return date.toISOString().slice(0, 10);
  };
  return { today: calendarDay(0), tomorrow: calendarDay(1), weekEnd: calendarDay(7) };
}
