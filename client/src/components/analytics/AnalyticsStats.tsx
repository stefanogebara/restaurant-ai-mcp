import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useRevenueStats } from '../../hooks/useRevenueStats';
import { formatCurrency } from '../../utils/currency';

interface AnalyticsStatsProps {
  overview: {
    total_reservations: number;
    total_completed_services: number;
    total_revenue?: number;
    avg_party_size: number;
    avg_service_time_minutes: number;
    total_capacity: number;
    current_occupancy: number;
    current_occupancy_percentage: string;
  };
  reservationsByStatus: Record<string, number>;
}

interface CompareData {
  period_a: { reservations: number; covers: number; no_shows: number; cancelled: number; avg_party_size: number };
  period_b: { reservations: number; covers: number; no_shows: number; cancelled: number; avg_party_size: number };
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

export default function AnalyticsStats({ overview, reservationsByStatus }: AnalyticsStatsProps) {
  const { t } = useTranslation();
  const { data: revenueStats } = useRevenueStats();

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

  // No-show rate
  const MIN_SAMPLE_SIZE = 5;
  const hasEnoughData = overview.total_reservations >= MIN_SAMPLE_SIZE;
  const hasCompletedServices = overview.total_completed_services > 0;
  const noShowRate = (hasEnoughData && hasCompletedServices)
    ? ((1 - overview.total_completed_services / overview.total_reservations) * 100).toFixed(1)
    : null;
  const noShowTooltip = !hasCompletedServices
    ? t('analytics.noShowNoData', 'Complete a service to track no-show rate')
    : (!hasEnoughData ? t('analytics.noShowNotEnoughData', 'Need at least 5 reservations') : undefined);

  const noShowDelta = (() => {
    if (!compare?.period_a || !compare?.period_b) return null;
    const rateA = compare.period_a.reservations > 0
      ? (compare.period_a.no_shows / compare.period_a.reservations) * 100 : null;
    const rateB = compare.period_b.reservations > 0
      ? (compare.period_b.no_shows / compare.period_b.reservations) * 100 : null;
    if (rateA === null || rateB === null) return null;
    return Math.round((rateB - rateA) * 10) / 10;
  })();

  // Cancellation rate from status breakdown
  const cancelled = reservationsByStatus['cancelled'] ?? 0;
  const cancellationRate = overview.total_reservations >= MIN_SAMPLE_SIZE
    ? ((cancelled / overview.total_reservations) * 100).toFixed(1)
    : null;

  const cancellationDelta = (() => {
    if (!compare?.period_a || !compare?.period_b) return null;
    const rateA = compare.period_a.reservations > 0
      ? (compare.period_a.cancelled / compare.period_a.reservations) * 100 : null;
    const rateB = compare.period_b.reservations > 0
      ? (compare.period_b.cancelled / compare.period_b.reservations) * 100 : null;
    if (rateA === null || rateB === null) return null;
    return Math.round((rateB - rateA) * 10) / 10;
  })();

  // Prefer server-reported actual revenue from service_records total_bill;
  // fall back to estimated revenue from avg_spend_per_cover when no bills recorded.
  const actualRevenue = overview.total_revenue;
  const estimatedRevenue = (actualRevenue && actualRevenue > 0)
    ? actualRevenue
    : (revenueStats && overview.total_completed_services > 0
        ? revenueStats.avg_spend_per_cover * overview.total_completed_services * overview.avg_party_size
        : null);

  const stats = [
    {
      value: overview.total_reservations,
      label: t('analytics.totalReservations'),
      delta: compare?.delta?.reservations_pct ?? null,
      invertColor: false,
      subtitle: undefined as string | undefined,
    },
    {
      value: noShowRate !== null ? `${noShowRate}%` : '\u2014',
      label: t('analytics.noShowRate'),
      color: noShowRate !== null && parseFloat(noShowRate) > 5 ? 'text-red-600' : undefined,
      tooltip: noShowTooltip,
      delta: noShowDelta,
      invertColor: true,
      subtitle: undefined,
    },
    {
      value: cancellationRate !== null ? `${cancellationRate}%` : '\u2014',
      label: t('analytics.cancellationRate', 'Cancellation Rate'),
      color: cancellationRate !== null && parseFloat(cancellationRate) > 15 ? 'text-amber-600' : undefined,
      tooltip: cancellationRate === null
        ? t('analytics.noShowNotEnoughData', 'Need at least 5 reservations')
        : undefined,
      delta: cancellationDelta,
      invertColor: true,
      subtitle: cancelled > 0 ? t('analytics.cancellationCount', '{{n}} cancelled', { n: cancelled }) : undefined,
    },
    {
      value: estimatedRevenue !== null
        ? formatCurrency(estimatedRevenue)
        : '\u2014',
      label: t('analytics.estimatedRevenue', 'Est. Revenue'),
      color: 'text-burgundy',
      delta: null,
      invertColor: false,
      subtitle: revenueStats?.using_default
        ? t('analytics.revenueEstimate', 'Based on avg spend')
        : undefined,
    },
    {
      value: overview.avg_party_size.toFixed(1),
      label: t('analytics.averagePartySize'),
      delta: null,
      invertColor: false,
      subtitle: undefined,
    },
    {
      value: `${overview.current_occupancy_percentage}%`,
      label: t('analytics.occupancyRate'),
      color: 'text-burgundy',
      delta: null,
      invertColor: false,
      subtitle: undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 border-b border-[#E5E7EB] pb-5">
      {stats.map((stat) => (
        <div key={stat.label} className="py-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[#9CA3AF] mb-2">
            {stat.label}
          </div>
          <div
            className={`text-[26px] font-bold tracking-tight leading-none ${stat.color || 'text-deep-charcoal'}`}
            title={stat.tooltip}
          >
            {stat.value}
          </div>
          {stat.delta !== null && (
            <div className="mt-1">
              <DeltaBadge pct={stat.delta} invertColor={stat.invertColor} />
              <span className="text-[10px] text-[#9CA3AF] ml-1">{t('analytics.vsPrevWeek')}</span>
            </div>
          )}
          {stat.subtitle && (
            <p className="text-[10px] text-[#9CA3AF] mt-1">{stat.subtitle}</p>
          )}
          {stat.tooltip && stat.value === '\u2014' && (
            <p className="text-[10px] text-[#9CA3AF] mt-1">{stat.tooltip}</p>
          )}
        </div>
      ))}
    </div>
  );
}
