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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sm:border-l sm:first:border-l-0 border-[#E7E5E4] sm:px-8 first:sm:pl-0">
            <div className="h-10 w-16 bg-[#E7E5E4] rounded-lg animate-pulse mb-2" />
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
      {/* Tables */}
      <div className="sm:border-l sm:first:border-l-0 border-[#E7E5E4] sm:px-8 first:sm:pl-0">
        <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums">
          {occupiedTables}<span className="text-[#A8A29E]">/{totalTables}</span>
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.tables}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{occupancyPercent}% {t.occupied}</div>
      </div>

      {/* Reservations */}
      <div className="sm:border-l border-[#E7E5E4] sm:px-8">
        <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums">
          {reservationsToday}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.reservations}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{seatedReservations} {t.seated}</div>
      </div>

      {/* Waiting */}
      <div className="sm:border-l border-[#E7E5E4] sm:px-8">
        <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums">
          {waitlistCount}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.waiting}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{waitSublabel}</div>
      </div>

      {/* Active */}
      <div className="sm:border-l border-[#E7E5E4] sm:px-8">
        <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums">
          {activeParties}
        </div>
        <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">{t.active}</div>
        <div className="text-sm text-[#A8A29E] mt-0.5">{guestsSublabel}</div>
      </div>
    </div>
  );
}
