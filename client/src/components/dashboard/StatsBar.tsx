interface StatsBarProps {
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  seatedReservations: number;
  waitlistCount: number;
  estimatedWaitTime?: number;
  activeParties: number;
  totalGuests: number;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

const translations = {
  en: {
    tables: 'Tables',
    reservations: 'Reservations',
    waiting: 'Waiting',
    active: 'Active',
    occupied: 'occupied',
    seated: 'seated',
    avgWait: '~%d min avg',
    noWait: 'No wait',
    guests: '%d guests',
  },
  es: {
    tables: 'Mesas',
    reservations: 'Reservas',
    waiting: 'En Espera',
    active: 'Activas',
    occupied: 'ocupación',
    seated: 'sentados',
    avgWait: '~%d min prom',
    noWait: 'Sin espera',
    guests: '%d comensales',
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
  language = 'en',
  isLoading,
}: StatsBarProps) {
  const t = translations[language];
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E5E4]/50">
            <div className="h-1 w-12 bg-[#E7E5E4] rounded-full mb-3 animate-pulse" />
            <div className="h-9 w-16 bg-[#E7E5E4] rounded-lg animate-pulse mb-2" />
            <div className="h-3 w-20 bg-[#F5F5F4] rounded animate-pulse mb-1" />
            <div className="h-3 w-24 bg-[#F5F5F4] rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const waitSublabel = estimatedWaitTime
    ? t.avgWait.replace('%d', String(estimatedWaitTime))
    : t.noWait;

  const guestsSublabel = t.guests.replace('%d', String(totalGuests));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {/* Tables */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E5E4]/50 hover:shadow-md transition-shadow">
        <div className="h-1 w-12 rounded-full mb-3 bg-[#22c55e]" />
        <div className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">
          {occupiedTables}<span className="text-[#A8A29E]">/{totalTables}</span>
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.tables}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{occupancyPercent}% {t.occupied}</div>
        <div className="mt-2 h-1.5 bg-[#F5F5F4] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#22c55e] rounded-full transition-all"
            style={{ width: `${occupancyPercent}%` }}
          />
        </div>
      </div>

      {/* Reservations */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E5E4]/50 hover:shadow-md transition-shadow">
        <div className="h-1 w-12 rounded-full mb-3 bg-[#9F1239]" />
        <div className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">
          {reservationsToday}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.reservations}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{seatedReservations} {t.seated}</div>
      </div>

      {/* Waiting */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E5E4]/50 hover:shadow-md transition-shadow">
        <div className="h-1 w-12 rounded-full mb-3 bg-[#d97706]" />
        <div className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">
          {waitlistCount}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.waiting}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{waitSublabel}</div>
      </div>

      {/* Active */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E7E5E4]/50 hover:shadow-md transition-shadow">
        <div className="h-1 w-12 rounded-full mb-3 bg-[#1C1917]" />
        <div className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">
          {activeParties}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.active}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{guestsSublabel}</div>
      </div>
    </div>
  );
}
