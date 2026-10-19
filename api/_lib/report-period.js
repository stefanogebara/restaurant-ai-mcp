const DAY_MS = 86_400_000;

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

function calendarDate(value, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: validTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(iso, days) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isValidDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    !Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) &&
    new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso;
}

/** Explicit ranges require both dates; scheduled reports use the last 7 completed local days. */
function resolveReportRange(input, timeZone, now = new Date()) {
  const hasStart = input?.start_date != null;
  const hasEnd = input?.end_date != null;
  if (hasStart !== hasEnd) throw new RangeError('Both start_date and end_date are required');
  const end = hasEnd ? input.end_date : shiftDate(calendarDate(now, timeZone), -1);
  const start = hasStart ? input.start_date : shiftDate(end, -6);
  if (!isValidDate(start) || !isValidDate(end) || start > end ||
      (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS > 30) {
    throw new RangeError('Choose a valid period of up to 31 days');
  }
  return { start, end };
}

/** A timestamp belongs to the period iff its restaurant-local calendar day does. */
function servicesInLocalRange(rows, range, timeZone) {
  return (rows || []).filter(row => {
    if (!row.seated_at || Number.isNaN(Date.parse(row.seated_at))) return false;
    const day = calendarDate(new Date(row.seated_at), timeZone);
    return day >= range.start && day <= range.end;
  });
}

module.exports = { validTimeZone, calendarDate, shiftDate, resolveReportRange, servicesInLocalRange };
