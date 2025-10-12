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
        color="green"
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
  color: 'gray' | 'green' | 'red' | 'blue' | 'purple';
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-900',
    green: 'bg-green-50 text-green-900',
    red: 'bg-red-50 text-red-900',
    blue: 'bg-blue-50 text-blue-900',
    purple: 'bg-purple-50 text-purple-900',
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg p-4 shadow`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}
