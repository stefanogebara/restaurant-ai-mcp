import type { DashboardSummary } from '../../types/host.types';

interface DashboardStatsProps {
  summary: DashboardSummary;
}

export default function DashboardStats({ summary }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        label="Total Capacity"
        value={summary.total_capacity}
        icon="👥"
        color="gray"
      />
      <StatCard
        label="Available Seats"
        value={summary.available_seats}
        icon="✅"
        color="emerald"
      />
      <StatCard
        label="Occupied Seats"
        value={summary.occupied_seats}
        icon="🔴"
        color="red"
      />
      <StatCard
        label="Occupancy"
        value={`${summary.occupancy_percentage}%`}
        icon="📊"
        color="blue"
      />
      <StatCard
        label="Active Parties"
        value={summary.active_parties}
        icon="🍽️"
        color="purple"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: 'gray' | 'emerald' | 'red' | 'blue' | 'purple';
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorConfig = {
    gray: {
      bg: 'bg-muted border-border hover:border-muted-foreground/40',
      icon: 'bg-muted-foreground/20 text-muted-foreground',
      text: 'text-foreground',
      label: 'text-muted-foreground',
    },
    emerald: {
      bg: 'bg-primary/10 border-primary/20 hover:border-primary/40',
      icon: 'bg-primary/20 text-primary',
      text: 'text-foreground',
      label: 'text-muted-foreground',
    },
    red: {
      bg: 'bg-destructive/10 border-destructive/20 hover:border-destructive/40',
      icon: 'bg-destructive/20 text-destructive',
      text: 'text-foreground',
      label: 'text-muted-foreground',
    },
    blue: {
      bg: 'bg-accent border-border hover:border-accent-foreground/40',
      icon: 'bg-accent-foreground/20 text-accent-foreground',
      text: 'text-foreground',
      label: 'text-muted-foreground',
    },
    purple: {
      bg: 'bg-primary/10 border-primary/30 hover:border-primary/50',
      icon: 'bg-primary/20 text-primary',
      text: 'text-foreground',
      label: 'text-muted-foreground',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} border-2 rounded-lg p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-12 h-12 ${config.icon} rounded-lg flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
      <div>
        <p className={`text-sm font-medium ${config.label} mb-1`}>{label}</p>
        <p className={`text-3xl font-bold ${config.text}`}>{value}</p>
      </div>
    </div>
  );
}
