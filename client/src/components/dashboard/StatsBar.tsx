interface StatsBarProps {
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  seatedReservations: number;
  waitlistCount: number;
  estimatedWaitTime?: number;
  activeParties: number;
  totalGuests: number;
  avgDuration?: string;
  peakHours?: string;
  revenueToday?: string;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

const translations = {
  en: {
    tablesOccupied: 'Tables Occupied',
    occupancy: 'occupancy',
    reservationsToday: 'Reservations Today',
    seated: 'seated',
    waiting: 'Waiting',
    avgWait: 'Average wait',
    noWait: 'No wait',
    activeParties: 'Active Parties',
    guestsTotal: 'guests total',
    avgDuration: 'Avg Duration',
    peakHours: 'Peak Hours',
    revenueToday: 'Revenue Today',
    updatesWhenSeated: 'Updates when guests are seated',
    people: 'people',
  },
  es: {
    tablesOccupied: 'Mesas Ocupadas',
    occupancy: 'Ocupación',
    reservationsToday: 'Reservas Hoy',
    seated: 'sentados',
    waiting: 'Sin mesa (espera)',
    avgWait: 'Espera promedio',
    noWait: 'Sin espera',
    activeParties: 'Mesas Activas',
    guestsTotal: 'comensales totales',
    avgDuration: 'Duración Media',
    peakHours: 'Horas Pico',
    revenueToday: 'Ingresos Hoy',
    updatesWhenSeated: 'Se actualiza al sentar comensales',
    people: 'personas',
  },
};

export default function StatsBar({
  occupiedTables,
  totalTables,
  reservationsToday,
  seatedReservations,
  waitlistCount,
  estimatedWaitTime,
  activeParties,
  totalGuests,
  avgDuration,
  peakHours,
  revenueToday,
  language = 'en',
  isLoading,
}: StatsBarProps) {
  const t = translations[language];
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-[#E7E5E4] shadow-sm">
              <div className="h-3 w-20 bg-[#F5F5F4] rounded animate-pulse mb-3" />
              <div className="h-8 w-16 bg-[#E7E5E4] rounded-lg animate-pulse mb-1" />
              <div className="h-3 w-24 bg-[#F5F5F4] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupied Tables */}
        <StatCard
          value={<>{occupiedTables}<span className="text-[#A8A29E] text-2xl">/{totalTables}</span></>}
          label={t.tablesOccupied}
          color="burgundy"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        >
          <div className="h-2 bg-[#F5F5F4] rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-[#9F1239] to-[#881337] rounded-full transition-all duration-500"
              style={{ width: `${occupancyPercent}%` }}
            />
          </div>
          <div className="text-xs text-[#A8A29E] mt-1">{occupancyPercent}% {t.occupancy}</div>
        </StatCard>

        {/* Reservations */}
        <StatCard
          value={reservationsToday}
          label={t.reservationsToday}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        >
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <div className="flex-1 h-2 bg-[#16a34a] rounded-full" style={{ width: `${(seatedReservations / Math.max(reservationsToday, 1)) * 100}%` }} />
              <div className="flex-1 h-2 bg-[#F5F5F4] rounded-full" />
            </div>
            <div className="text-xs text-[#A8A29E]">{seatedReservations}/{reservationsToday} {t.seated}</div>
          </div>
        </StatCard>

        {/* Waiting */}
        <StatCard
          value={waitlistCount}
          label={t.waiting}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#d97706]">
              {estimatedWaitTime ? `~${estimatedWaitTime} min` : '-'}
            </div>
            <div className="text-xs text-[#A8A29E]">{t.avgWait}</div>
          </div>
        </StatCard>

        {/* Active Parties */}
        <StatCard
          value={activeParties}
          label={t.activeParties}
          color="violet"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#7c3aed]">{totalGuests} {t.people}</div>
            <div className="text-xs text-[#A8A29E]">{t.guestsTotal}</div>
          </div>
        </StatCard>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SecondaryStatCard
          label={t.avgDuration}
          value={avgDuration || '-'}
          color="burgundy"
          emptyHint={!avgDuration ? t.updatesWhenSeated : undefined}
          icon={
            <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SecondaryStatCard
          label={t.peakHours}
          value={peakHours || '-'}
          color="burgundy"
          emptyHint={!peakHours ? t.updatesWhenSeated : undefined}
          icon={
            <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <SecondaryStatCard
          label={t.revenueToday}
          value={revenueToday ? `€${revenueToday}` : '-'}
          valueColor="text-[#16a34a]"
          color="green"
          emptyHint={!revenueToday ? t.updatesWhenSeated : undefined}
          icon={
            <svg className="w-5 h-5 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>
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
  value: number | string | React.ReactNode;
  label: string;
  color: keyof typeof colorMap;
  icon: React.ReactNode;
  children?: React.ReactNode;
}

function StatCard({ value, label, color, icon, children }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`text-3xl md:text-4xl font-bold ${c.valueText} tracking-tight`}>{value}</div>
        <div className={`p-2 ${c.iconBg} rounded-lg`}>
          <span className={c.iconText}>{icon}</span>
        </div>
      </div>
      <div className="text-xs font-semibold text-[#57534E] mb-3">{label}</div>
      {children}
    </div>
  );
}

// ---- Secondary Stat Card ----

interface SecondaryStatCardProps {
  label: string;
  value: string;
  valueColor?: string;
  color: 'burgundy' | 'green';
  emptyHint?: string;
  icon: React.ReactNode;
}

function SecondaryStatCard({ label, value, valueColor, color, emptyHint, icon }: SecondaryStatCardProps) {
  const iconBg = color === 'burgundy' ? 'bg-[#9F1239]/10' : 'bg-[#16a34a]/10';
  return (
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 overflow-hidden min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 ${iconBg} rounded-lg shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold text-[#57534E] mb-0.5 truncate">{label}</div>
          <div className={`text-2xl font-bold tracking-tight ${valueColor || 'text-[#1C1917]'}`}>{value}</div>
          {emptyHint && <div className="text-[10px] text-[#A8A29E] mt-0.5">{emptyHint}</div>}
        </div>
      </div>
    </div>
  );
}
