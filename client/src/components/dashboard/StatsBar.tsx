interface StatsBarProps {
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  seatedReservations: number;
  waitlistCount: number;
  estimatedWaitTime?: number;
  activeParties: number;
  totalGuests: number;
  isLoading?: boolean;
}

export default function StatsBar({
  occupiedTables,
  totalTables,
  reservationsToday,
  seatedReservations,
  waitlistCount,
  estimatedWaitTime,
  activeParties,
  totalGuests,
  isLoading,
}: StatsBarProps) {
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-[#E7E5E4] shadow-sm">
            <div className="h-3 w-20 bg-[#F5F5F4] rounded animate-pulse mb-3" />
            <div className="h-8 w-16 bg-[#E7E5E4] rounded-lg animate-pulse mb-1" />
            <div className="h-3 w-24 bg-[#F5F5F4] rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Occupied Tables */}
      <StatCard
        value={`${occupiedTables}/${totalTables}`}
        label="Tables Occupied"
        color="burgundy"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
      >
        <div className="h-1.5 bg-[#F5F5F4] rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-gradient-to-r from-[#9F1239] to-[#881337] rounded-full transition-all duration-500"
            style={{ width: `${occupancyPercent}%` }}
          />
        </div>
        <div className="text-[10px] text-[#A8A29E] mt-1">{occupancyPercent}% occupancy</div>
      </StatCard>

      {/* Reservations */}
      <StatCard
        value={reservationsToday}
        label="Reservations Today"
        color="green"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        <div className="text-[10px] text-[#A8A29E] mt-1">
          {seatedReservations}/{reservationsToday} seated
        </div>
      </StatCard>

      {/* Waiting */}
      <StatCard
        value={waitlistCount}
        label="Waiting"
        color="amber"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <div className="text-[10px] text-[#A8A29E] mt-1">
          {estimatedWaitTime ? `~${estimatedWaitTime} min avg` : 'No wait'}
        </div>
      </StatCard>

      {/* Active Parties */}
      <StatCard
        value={activeParties}
        label="Active Parties"
        color="violet"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        <div className="text-[10px] text-[#A8A29E] mt-1">{totalGuests} guests total</div>
      </StatCard>
    </div>
  );
}

// ---- Internal StatCard ----

const colorMap = {
  burgundy: { iconBg: 'bg-[#9F1239]/10', iconText: 'text-[#9F1239]', valueText: 'text-[#9F1239]' },
  green: { iconBg: 'bg-[#16a34a]/10', iconText: 'text-[#16a34a]', valueText: 'text-[#16a34a]' },
  amber: { iconBg: 'bg-[#d97706]/10', iconText: 'text-[#d97706]', valueText: 'text-[#d97706]' },
  violet: { iconBg: 'bg-[#7c3aed]/10', iconText: 'text-[#7c3aed]', valueText: 'text-[#7c3aed]' },
};

interface StatCardProps {
  value: number | string;
  label: string;
  color: keyof typeof colorMap;
  icon: React.ReactNode;
  children?: React.ReactNode;
}

function StatCard({ value, label, color, icon, children }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={`text-3xl font-bold ${c.valueText} tracking-tight`}>{value}</div>
        <div className={`p-2 ${c.iconBg} rounded-lg`}>
          <span className={c.iconText}>{icon}</span>
        </div>
      </div>
      <div className="text-xs font-semibold text-[#57534E]">{label}</div>
      {children}
    </div>
  );
}
