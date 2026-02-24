import type { DashboardSummary } from '../../types/host.types';
import { SkeletonStatCard } from '../common/Skeleton';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

interface DashboardStatsProps {
  summary: DashboardSummary;
  isLoading?: boolean;
}

export default function DashboardStats({ summary, isLoading }: DashboardStatsProps) {
  // Format wait time display
  const waitTimeDisplay = summary.estimated_wait_time !== undefined
    ? summary.estimated_wait_time === 0
      ? 'No Wait'
      : `${summary.estimated_wait_time} min`
    : 'N/A';

  // Show skeleton loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4" role="status" aria-label="Loading statistics...">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <StatCard
        label="Total Capacity"
        value={summary.total_capacity}
        iconName="users"
        color="slate"
      />
      <StatCard
        label="Available Seats"
        value={summary.available_seats}
        iconName="check"
        color="emerald"
      />
      <StatCard
        label="Occupied Seats"
        value={summary.occupied_seats}
        iconName="user"
        color="red"
      />
      <StatCard
        label="Occupancy"
        value={`${summary.occupancy_percentage}%`}
        iconName="bar-chart"
        color="blue"
      />
      <StatCard
        label="Active Parties"
        value={summary.active_parties}
        iconName="dining"
        color="violet"
      />
      <StatCard
        label="Est. Wait Time"
        value={waitTimeDisplay}
        iconName="clock"
        color="amber"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  iconName: IconName;
  color: 'slate' | 'emerald' | 'red' | 'blue' | 'violet' | 'amber';
}

function StatCard({ label, value, iconName, color }: StatCardProps) {
  const colorConfig = {
    slate: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-stone-gray',
    },
    emerald: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-green-600',
    },
    red: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-burgundy',
    },
    blue: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-burgundy',
    },
    violet: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-violet-600',
    },
    amber: {
      bg: 'bg-white border border-border-gray',
      iconBg: 'bg-amber-600',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} rounded-2xl p-5 shadow-md transition-all duration-200 hover:shadow-lg hover:bg-soft-gray`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 ${config.iconBg} rounded-lg flex items-center justify-center`}>
          <ThiingsIcon name={iconName} size="sm" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-stone-gray mb-1">{label}</p>
        <p className="text-2xl font-bold text-deep-charcoal">{value}</p>
      </div>
    </div>
  );
}
