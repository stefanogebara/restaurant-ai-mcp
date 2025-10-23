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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Reservations"
        value={overview.total_reservations}
        icon="📅"
        subtitle="Last 30 days"
        color="primary"
      />
      <StatCard
        label="Completed Services"
        value={overview.total_completed_services}
        icon="✅"
        subtitle="Successfully served"
        color="accent"
      />
      <StatCard
        label="Avg Party Size"
        value={overview.avg_party_size.toFixed(1)}
        icon="👥"
        subtitle="Guests per reservation"
        color="muted"
      />
      <StatCard
        label="Avg Service Time"
        value={`${overview.avg_service_time_minutes} min`}
        icon="⏱️"
        subtitle="Table turnover"
        color="secondary"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  subtitle: string;
  color: 'primary' | 'accent' | 'muted' | 'secondary';
}

function StatCard({ label, value, icon, subtitle, color }: StatCardProps) {
  const colorConfig = {
    primary: {
      bg: 'bg-primary/10 border-primary/20 hover:border-primary/40',
      icon: 'bg-primary/20 text-primary',
      text: 'text-foreground',
      subtitle: 'text-muted-foreground',
    },
    accent: {
      bg: 'bg-accent border-border hover:border-accent-foreground/40',
      icon: 'bg-accent-foreground/20 text-accent-foreground',
      text: 'text-foreground',
      subtitle: 'text-muted-foreground',
    },
    muted: {
      bg: 'bg-muted border-border hover:border-muted-foreground/40',
      icon: 'bg-muted-foreground/20 text-muted-foreground',
      text: 'text-foreground',
      subtitle: 'text-muted-foreground',
    },
    secondary: {
      bg: 'bg-secondary border-border hover:border-secondary-foreground/40',
      icon: 'bg-secondary-foreground/20 text-secondary-foreground',
      text: 'text-foreground',
      subtitle: 'text-muted-foreground',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} border-2 rounded-lg p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${config.icon} rounded-lg flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
      <div>
        <p className={`text-sm font-medium ${config.subtitle} mb-1`}>{label}</p>
        <p className={`text-3xl font-bold ${config.text} mb-1`}>{value}</p>
        <p className={`text-xs ${config.subtitle}`}>{subtitle}</p>
      </div>
    </div>
  );
}
