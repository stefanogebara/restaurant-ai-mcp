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
    reservations: "Today's Reservations",
    tables: 'Tables Available',
    guests: 'Guests Expected',
    aiCalls: 'Active Parties',
    seated: 'seated',
    capacity: 'capacity',
    vsAvg: 'vs avg',
    waiting: 'on waitlist',
  },
  es: {
    reservations: 'Reservas de Hoy',
    tables: 'Mesas Disponibles',
    guests: 'Comensales Esperados',
    aiCalls: 'Mesas Activas',
    seated: 'sentados',
    capacity: 'capacidad',
    vsAvg: 'vs prom',
    waiting: 'en espera',
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
  const availableTables = totalTables - occupiedTables;
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;
  const seatedPercent = reservationsToday > 0 ? Math.round((seatedReservations / reservationsToday) * 100) : 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-border-gray">
            <div className="h-3 w-20 bg-border-gray rounded-full animate-pulse mb-3" />
            <div className="h-9 w-16 bg-border-gray rounded-lg animate-pulse mb-2" />
            <div className="h-3 w-24 bg-soft-gray rounded animate-pulse mb-3" />
            <div className="h-1 w-full bg-soft-gray rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {/* Today's Reservations */}
      <StatCard
        label={t.reservations}
        value={String(reservationsToday)}
        change={`${seatedReservations} ${t.seated}`}
        changeColor="text-[#16a34a]"
        barPercent={seatedPercent}
        barColor="#9F1239"
      />

      {/* Tables Available */}
      <StatCard
        label={t.tables}
        value={String(availableTables)}
        valueSuffix={` / ${totalTables}`}
        valueColor="text-burgundy"
        change={`${occupancyPercent}% ${t.capacity}`}
        changeColor="text-[#16a34a]"
        barPercent={100 - occupancyPercent}
        barColor="#16a34a"
      />

      {/* Guests Expected */}
      <StatCard
        label={t.guests}
        value={String(totalGuests)}
        change={waitlistCount > 0
          ? `${waitlistCount} ${t.waiting}${estimatedWaitTime ? ` · ~${estimatedWaitTime} min avg` : ''}`
          : estimatedWaitTime ? `~${estimatedWaitTime} min avg` : ''}
        changeColor="text-[#d97706]"
        barPercent={totalGuests > 0 ? Math.min(Math.round((totalGuests / (reservationsToday * 3 || 1)) * 100), 100) : 0}
        barColor="#57534E"
      />

      {/* Active Parties */}
      <StatCard
        label={t.aiCalls}
        value={String(activeParties)}
        change={totalGuests > 0 ? `${totalGuests} guests seated` : ''}
        changeColor="text-stone-gray"
        barPercent={totalTables > 0 ? Math.round((activeParties / totalTables) * 100) : 0}
        barColor="#d97706"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  valueSuffix?: string;
  valueColor?: string;
  change: string;
  changeColor: string;
  barPercent: number;
  barColor: string;
}

function StatCard({ label, value, valueSuffix, valueColor, change, changeColor, barPercent, barColor }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-border-gray">
      <div className="text-xs font-medium text-muted-stone tracking-wide mb-2">
        {label}
      </div>
      <div className={`text-[32px] font-bold tracking-tight leading-none ${valueColor || 'text-deep-charcoal'}`}>
        {value}
        {valueSuffix && (
          <span className="text-base text-muted-stone font-normal">{valueSuffix}</span>
        )}
      </div>
      {change && (
        <div className={`text-xs font-medium mt-1.5 ${changeColor}`}>
          {change}
        </div>
      )}
      <div className="w-full h-1 bg-soft-gray rounded-full mt-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${barPercent}%`, background: barColor }}
        />
      </div>
    </div>
  );
}
