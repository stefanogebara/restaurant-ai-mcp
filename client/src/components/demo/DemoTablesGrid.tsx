import type { DemoTable } from '../../hooks/useDemoState';

interface DemoTablesGridProps {
  tables: DemoTable[];
  lang: string;
}

const labels = {
  en: { title: 'Tables', seats: 'seats', available: 'Available', occupied: 'Occupied', reserved: 'Reserved' },
  'pt-BR': { title: 'Mesas', seats: 'lugares', available: 'Disponível', occupied: 'Ocupada', reserved: 'Reservada' },
} as const;

const LOCATION_LABELS: Record<string, Record<string, string>> = {
  'pt-BR': { window: 'Janela', indoor: 'Salão', terrace: 'Terraço', patio: 'Pátio', bar: 'Bar', Window: 'Janela', Indoor: 'Salão', Terrace: 'Terraço', Patio: 'Pátio', Bar: 'Bar' },
};

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  Available: { dot: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
  Occupied:  { dot: 'bg-rose-600',    text: 'text-rose-700',    bg: 'bg-rose-50' },
  Reserved:  { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50' },
};

export default function DemoTablesGrid({ tables, lang }: DemoTablesGridProps) {
  const t = labels[lang === 'pt-BR' ? 'pt-BR' : 'en'];

  // Group tables by location
  const grouped = tables.reduce<Record<string, DemoTable[]>>((acc, table) => {
    const loc = table.location || 'Indoor';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(table);
    return acc;
  }, {});

  const available = tables.filter(tb => tb.status === 'Available').length;
  const occupied = tables.filter(tb => tb.status === 'Occupied').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-deep-charcoal tracking-tight">{t.title}</h2>
          <p className="text-sm text-warm-stone mt-0.5">
            {available} {t.available.toLowerCase()} · {occupied} {t.occupied.toLowerCase()}
          </p>
        </div>
      </div>

      {/* Table Grid by Location */}
      {Object.entries(grouped).map(([location, locationTables]) => (
        <div key={location}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-warm-stone">{LOCATION_LABELS[lang]?.[location] || location}</span>
            <span className="text-[11px] font-semibold bg-stone-100 text-warm-stone px-2 py-0.5 rounded-full">
              {locationTables.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {locationTables.map((table) => {
              const style = STATUS_STYLES[table.status] || STATUS_STYLES.Available;
              const statusLabel = t[table.status.toLowerCase() as keyof typeof t] || table.status;
              return (
                <div
                  key={table.id}
                  className={`rounded-lg border border-[#E5E7EB] p-4 transition-shadow hover:shadow-sm ${style.bg}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-deep-charcoal">#{table.table_number}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                  </div>
                  <div className="text-xs text-muted-stone mb-1">
                    {table.capacity} {t.seats}
                  </div>
                  <div className={`text-xs font-medium ${style.text}`}>
                    {statusLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
