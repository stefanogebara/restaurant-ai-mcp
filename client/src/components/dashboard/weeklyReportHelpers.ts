import { colors } from '../../utils/colors';
import type { WeeklyReportData } from './weeklyReport.types';

export function getBarColor(covers: number, maxTimeCovers: number): string {
  const ratio = covers / maxTimeCovers;
  if (ratio > 0.85) return '#9F1239';
  if (ratio > 0.6) return colors.stoneGray;
  if (ratio > 0.35) return colors.mutedStone;
  return '#D6D3D1';
}

export function getBarTextColor(covers: number, maxTimeCovers: number): string {
  const ratio = covers / maxTimeCovers;
  return ratio > 0.35 ? '#fff' : colors.warmStone;
}

export function buildDemoRows(demographics: WeeklyReportData['demographics'], t?: (key: string) => string) {
  const { tourist_count, local_count, tourist_percentage, first_time_visitors, repeat_customers } = demographics;
  const tr = (key: string, fallback: string) => t ? t(key) : fallback;
  return [
    { rank: 1, label: tr('analytics.tourists', 'Tourists'), detail: `${tourist_count} ${tr('analytics.visitors', 'visitors')}`, pct: tourist_percentage, count: null, color: '#9F1239' },
    { rank: 2, label: tr('analytics.locals', 'Locals'), detail: `${local_count} ${tr('analytics.residents', 'residents')}`, pct: tourist_count + local_count > 0 ? Math.round((local_count / (tourist_count + local_count)) * 100) : 0, count: null, color: colors.deepCharcoal },
    { rank: 3, label: tr('analytics.firstTime', 'First-Time'), detail: `${first_time_visitors} ${tr('analytics.newCustomers', 'new customers')}`, pct: null, count: first_time_visitors, color: '#3b82f6' },
    { rank: 4, label: tr('analytics.repeat', 'Repeat'), detail: `${repeat_customers} ${tr('analytics.returning', 'returning')}`, pct: null, count: repeat_customers, color: '#7c3aed' },
  ];
}

export function buildPreferencePills(preferences: WeeklyReportData['preferences']) {
  return [
    ...Object.entries(preferences.seating).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.dietary_restrictions).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.occasions).map(([k, v]) => ({ label: k, count: v })),
  ].sort((a, b) => b.count - a.count);
}
