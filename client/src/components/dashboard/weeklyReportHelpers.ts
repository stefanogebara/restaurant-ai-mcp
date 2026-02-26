import { colors } from '../../utils/colors';
import type { WeeklyReportData } from './weeklyReport.types';

export function getBarColor(covers: number, maxTimeCovers: number): string {
  const ratio = covers / maxTimeCovers;
  if (ratio > 0.85) return colors.burgundy;
  if (ratio > 0.6) return colors.stoneGray;
  if (ratio > 0.35) return colors.mutedStone;
  return '#D6D3D1';
}

export function getBarTextColor(covers: number, maxTimeCovers: number): string {
  const ratio = covers / maxTimeCovers;
  return ratio > 0.35 ? '#fff' : colors.warmStone;
}

export function buildDemoRows(demographics: WeeklyReportData['demographics']) {
  const { tourist_count, local_count, tourist_percentage, first_time_visitors, repeat_customers } = demographics;
  return [
    { rank: 1, label: 'Tourists', detail: `${tourist_count} visitors`, pct: tourist_percentage, count: null, color: colors.burgundy },
    { rank: 2, label: 'Locals', detail: `${local_count} residents`, pct: tourist_count + local_count > 0 ? Math.round((local_count / (tourist_count + local_count)) * 100) : 0, count: null, color: colors.deepCharcoal },
    { rank: 3, label: 'First-Time', detail: `${first_time_visitors} new customers`, pct: null, count: first_time_visitors, color: '#3b82f6' },
    { rank: 4, label: 'Repeat', detail: `${repeat_customers} returning`, pct: null, count: repeat_customers, color: '#7c3aed' },
  ];
}

export function buildPreferencePills(preferences: WeeklyReportData['preferences']) {
  return [
    ...Object.entries(preferences.seating).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.dietary_restrictions).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.occasions).map(([k, v]) => ({ label: k, count: v })),
  ].sort((a, b) => b.count - a.count);
}
