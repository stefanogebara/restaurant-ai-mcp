import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';

interface AnalyticsStatsProps {
  overview: {
    total_reservations: number;
    total_completed_services: number;
    avg_party_size: number;
    avg_service_time_minutes: number;
    total_capacity: number;
    current_occupancy: number;
    current_occupancy_percentage: string;
  };
}

interface CompareData {
  period_a: { reservations: number; covers: number; no_shows: number; avg_party_size: number };
  period_b: { reservations: number; covers: number; no_shows: number; avg_party_size: number };
  delta: { covers: number; reservations: number; covers_pct: number | null; reservations_pct: number | null };
}

function formatDelta(pct: number | null): string {
  if (pct === null || pct === undefined) return '';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function DeltaBadge({ pct, invertColor = false }: { pct: number | null; invertColor?: boolean }) {
  if (pct === null || pct === undefined) return null;
  const isPositive = pct > 0;
  const isNeutral = Math.abs(pct) < 0.1;
  // invertColor: for no-show rate, positive = bad (red), negative = good (green)
  const colorClass = isNeutral
    ? 'text-[#9CA3AF]'
    : (isPositive !== invertColor ? 'text-green-600' : 'text-red-600');
  const arrow = isNeutral ? '' : (isPositive ? '\u2191' : '\u2193');
  return (
    <span className={`text-xs font-semibold ${colorClass} ml-1`}>
      {arrow}{formatDelta(pct)}
    </span>
  );
}

export default function AnalyticsStats({ overview }: AnalyticsStatsProps) {
  const { t } = useTranslation();

  // FIX 5: Fetch period-over-period comparison data
  const { data: compare } = useQuery<CompareData>({
    queryKey: ['analytics-compare'],
    queryFn: async () => {
      const res = await authFetch('/api/analytics/compare?period_a=last_week&period_b=this_week');
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? json : null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // FIX 1: No-show rate — null when no completed services (misleading 100%)
  const MIN_SAMPLE_SIZE = 5;
  const hasEnoughData = overview.total_reservations >= MIN_SAMPLE_SIZE;
  const hasCompletedServices = overview.total_completed_services > 0;
  const noShowRate = (hasEnoughData && hasCompletedServices)
    ? ((1 - overview.total_completed_services / overview.total_reservations) * 100).toFixed(1)
    : null;
  const noShowTooltip = !hasCompletedServices
    ? t('analytics.noShowNoData', 'Complete a service to track no-show rate')
    : (!hasEnoughData ? t('analytics.noShowNotEnoughData', 'Need at least 5 reservations') : undefined);

  // Compute no-show delta from compare data
  const noShowDelta = (() => {
    if (!compare?.period_a || !compare?.period_b) return null;
    const rateA = compare.period_a.reservations > 0
      ? (compare.period_a.no_shows / compare.period_a.reservations) * 100 : null;
    const rateB = compare.period_b.reservations > 0
      ? (compare.period_b.no_shows / compare.period_b.reservations) * 100 : null;
    if (rateA === null || rateB === null) return null;
    return Math.round((rateB - rateA) * 10) / 10;
  })();

  // Occupancy has no period comparison (it's real-time), so no delta
  const stats = [
    {
      value: overview.total_reservations,
      label: t('analytics.totalReservations'),
      delta: compare?.delta?.reservations_pct ?? null,
      invertColor: false,
    },
    {
      value: noShowRate !== null ? `${noShowRate}%` : '\u2014',
      label: t('analytics.noShowRate'),
      color: noShowRate !== null && parseFloat(noShowRate) > 5 ? 'text-red-600' : undefined,
      tooltip: noShowTooltip,
      delta: noShowDelta,
      invertColor: true, // lower no-show = good = green
    },
    {
      value: overview.avg_party_size.toFixed(1),
      label: t('analytics.averagePartySize'),
      delta: null,
      invertColor: false,
    },
    {
      value: `${overview.current_occupancy_percentage}%`,
      label: t('analytics.occupancyRate'),
      color: 'text-burgundy',
      delta: null,
      invertColor: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 border-b border-[#E5E7EB] pb-5">
      {stats.map((stat) => (
        <div key={stat.label} className="py-5">
          <div className="text-[13px] font-semibold uppercase tracking-widest text-[#9CA3AF] mb-2">
            {stat.label}
          </div>
          <div className={`text-[32px] font-bold tracking-tight leading-none ${stat.color || 'text-deep-charcoal'}`} title={stat.tooltip}>
            {stat.value}
          </div>
          {stat.delta !== null && (
            <div className="mt-1">
              <DeltaBadge pct={stat.delta} invertColor={stat.invertColor} />
              <span className="text-[10px] text-[#9CA3AF] ml-1">{t('analytics.vsPrevWeek')}</span>
            </div>
          )}
          {stat.tooltip && stat.value === '\u2014' && (
            <p className="text-[10px] text-[#9CA3AF] mt-1">{stat.tooltip}</p>
          )}
        </div>
      ))}
    </div>
  );
}
