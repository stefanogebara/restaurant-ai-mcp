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

const statConfig = [
  { key: 'reservations', color: 'bg-[#9F1239]' },
  { key: 'completed', color: 'bg-[#22c55e]' },
  { key: 'partySize', color: 'bg-[#d97706]' },
  { key: 'serviceTime', color: 'bg-[#1C1917]' },
] as const;

export default function AnalyticsStats({ overview }: AnalyticsStatsProps) {
  const stats = [
    { value: overview.total_reservations, label: 'Reservations', sublabel: 'Last 30 days', color: statConfig[0].color },
    { value: overview.total_completed_services, label: 'Completed', sublabel: 'Successfully served', color: statConfig[1].color },
    { value: overview.avg_party_size.toFixed(1), label: 'Avg Party Size', sublabel: 'Guests per reservation', color: statConfig[2].color },
    { value: `${overview.avg_service_time_minutes} min`, label: 'Avg Service Time', sublabel: 'Table turnover', color: statConfig[3].color },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl p-4 border border-[#E7E5E4]/50 shadow-sm hover:shadow-md transition-shadow">
          <div className={`h-1 w-12 rounded-full mb-3 ${stat.color}`} />
          <div className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">
            {stat.value}
          </div>
          <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">
            {stat.label}
          </div>
          <div className="text-sm text-[#A8A29E] mt-0.5">
            {stat.sublabel}
          </div>
        </div>
      ))}
    </div>
  );
}
