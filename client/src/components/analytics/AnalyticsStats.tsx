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
  const noShowRate = overview.total_reservations > 0
    ? ((1 - overview.total_completed_services / overview.total_reservations) * 100).toFixed(1)
    : '0.0';

  const stats = [
    { value: overview.total_reservations, label: 'Total Reservations', change: null },
    { value: `${noShowRate}%`, label: 'No-Show Rate', color: parseFloat(noShowRate) > 5 ? 'text-[#dc2626]' : undefined },
    { value: overview.avg_party_size.toFixed(1), label: 'Avg Party Size', change: null },
    { value: `${overview.current_occupancy_percentage}%`, label: 'Occupancy Rate', color: 'text-burgundy' },
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
