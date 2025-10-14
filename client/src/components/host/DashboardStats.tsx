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
      bg: 'bg-gray-500/10 border-gray-500/20 hover:border-gray-500/40',
      icon: 'bg-gray-500/20 text-gray-300',
      text: 'text-white',
      label: 'text-gray-400',
    },
    emerald: {
      bg: 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40',
      icon: 'bg-emerald-500/20 text-emerald-400',
      text: 'text-white',
      label: 'text-gray-400',
    },
    red: {
      bg: 'bg-red-500/10 border-red-500/20 hover:border-red-500/40',
      icon: 'bg-red-500/20 text-red-400',
      text: 'text-white',
      label: 'text-gray-400',
    },
    blue: {
      bg: 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40',
      icon: 'bg-blue-500/20 text-blue-400',
      text: 'text-white',
      label: 'text-gray-400',
    },
    purple: {
      bg: 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40',
      icon: 'bg-purple-500/20 text-purple-400',
      text: 'text-white',
      label: 'text-gray-400',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} border-2 rounded-xl p-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-12 h-12 ${config.icon} rounded-xl flex items-center justify-center text-2xl`}>
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
