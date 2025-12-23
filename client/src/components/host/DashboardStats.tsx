import type { DashboardSummary } from '../../types/host.types';
import { SkeletonStatCard } from '../common/Skeleton';

// SVG Icon Components
const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const OccupiedIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
  </svg>
);

const DiningIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
  </svg>
);

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
        Icon={UsersIcon}
        color="slate"
      />
      <StatCard
        label="Available Seats"
        value={summary.available_seats}
        Icon={CheckIcon}
        color="emerald"
      />
      <StatCard
        label="Occupied Seats"
        value={summary.occupied_seats}
        Icon={OccupiedIcon}
        color="red"
      />
      <StatCard
        label="Occupancy"
        value={`${summary.occupancy_percentage}%`}
        Icon={ChartIcon}
        color="blue"
      />
      <StatCard
        label="Active Parties"
        value={summary.active_parties}
        Icon={DiningIcon}
        color="violet"
      />
      <StatCard
        label="Est. Wait Time"
        value={waitTimeDisplay}
        Icon={ClockIcon}
        color="amber"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  Icon: React.ComponentType<{ className?: string }>;
  color: 'slate' | 'emerald' | 'red' | 'blue' | 'violet' | 'amber';
}

function StatCard({ label, value, Icon, color }: StatCardProps) {
  const colorConfig = {
    slate: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#57534E]',
    },
    emerald: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#16a34a]',
    },
    red: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#9F1239]',
    },
    blue: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#9F1239]',
    },
    violet: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#7c3aed]',
    },
    amber: {
      bg: 'bg-white border border-[#E7E5E4]',
      iconBg: 'bg-[#d97706]',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} rounded-xl p-5 shadow-md transition-all duration-200 hover:shadow-lg hover:bg-[#F5F5F4]`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 ${config.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-[#57534E] mb-1">{label}</p>
        <p className="text-2xl font-bold text-[#1C1917]">{value}</p>
      </div>
    </div>
  );
}
