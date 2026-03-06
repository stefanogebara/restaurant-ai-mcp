import { useTranslation } from 'react-i18next';

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

export default function AnalyticsStats({ overview }: AnalyticsStatsProps) {
  const { t } = useTranslation();
  const MIN_SAMPLE_SIZE = 5;
  const hasEnoughData = overview.total_reservations >= MIN_SAMPLE_SIZE;
  const noShowRate = hasEnoughData
    ? ((1 - overview.total_completed_services / overview.total_reservations) * 100).toFixed(1)
    : null;

  const stats = [
    { value: overview.total_reservations, label: t('analytics.totalReservations'), change: null },
    { value: noShowRate !== null ? `${noShowRate}%` : '—', label: t('analytics.noShowRate'), color: noShowRate !== null && parseFloat(noShowRate) > 5 ? 'text-red-600' : undefined },
    { value: overview.avg_party_size.toFixed(1), label: t('analytics.averagePartySize'), change: null },
    { value: `${overview.current_occupancy_percentage}%`, label: t('analytics.occupancyRate'), color: 'text-burgundy' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-2xl p-6 border border-border-gray">
          <div className="text-xs font-medium text-muted-stone mb-2 tracking-wide">
            {stat.label}
          </div>
          <div className={`text-[32px] font-bold tracking-tight leading-none ${stat.color || 'text-deep-charcoal'}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
