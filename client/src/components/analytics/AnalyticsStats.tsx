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
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
      <StatBlock
        value={overview.total_reservations}
        label="Reservations"
        sublabel="Last 30 days"
      />
      <StatBlock
        value={overview.total_completed_services}
        label="Completed"
        sublabel="Successfully served"
        showDivider
      />
      <StatBlock
        value={overview.avg_party_size.toFixed(1)}
        label="Avg Party Size"
        sublabel="Guests per reservation"
        showDivider
      />
      <StatBlock
        value={`${overview.avg_service_time_minutes} min`}
        label="Avg Service Time"
        sublabel="Table turnover"
        showDivider
      />
    </div>
  );
}

interface StatBlockProps {
  value: number | string;
  label: string;
  sublabel: string;
  showDivider?: boolean;
}

function StatBlock({ value, label, sublabel, showDivider }: StatBlockProps) {
  return (
    <div className={`px-6 py-2 ${showDivider ? 'sm:border-l sm:border-[#E7E5E4]' : ''}`}>
      <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">
        {label}
      </div>
      <div className="text-sm text-[#A8A29E] mt-0.5">
        {sublabel}
      </div>
    </div>
  );
}
