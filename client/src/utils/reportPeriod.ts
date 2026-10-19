import { formatLocalDate } from './timeFormatting';

const DAY_MS = 86_400_000;

export interface ReportPeriod { start: string; end: string }

function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function isValidReportPeriod({ start, end }: ReportPeriod): boolean {
  return validDay(start) && validDay(end) && start <= end &&
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS <= 30;
}

function shiftDay(value: string, days: number): string {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function shiftReportPeriod(period: ReportPeriod, direction: -1 | 1): ReportPeriod {
  const length = (Date.parse(`${period.end}T12:00:00Z`) - Date.parse(`${period.start}T12:00:00Z`)) / DAY_MS + 1;
  return { start: shiftDay(period.start, direction * length), end: shiftDay(period.end, direction * length) };
}

export function initialReportPeriod(search: string, now = new Date()): ReportPeriod {
  const params = new URLSearchParams(search);
  const linked = { start: params.get('start_date') || '', end: params.get('end_date') || '' };
  if (isValidReportPeriod(linked)) return linked;
  const end = shiftDay(formatLocalDate(now), -1);
  return { start: shiftDay(end, -6), end };
}
