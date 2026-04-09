/**
 * DemoAnalyticsPanel — mock analytics view shown when clicking Analytics in the demo sidebar.
 * Displays realistic-looking weekly data tailored per preset.
 */

interface DemoAnalyticsPanelProps {
  restaurantName: string;
  lang: string;
  presetKey?: string;
}

// Week data: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
const PRESET_ANALYTICS = {
  makoto: {
    weekCoversByDay: [8, 14, 12, 16, 24, 28, 20],
    avgTicket: '€92',
    occupancy: '81%',
    noShowRate: '3%',
    peakHour: '21:30 – 22:30',
    topDishes: [
      { name: 'Menú Omakase', pct: 34 },
      { name: 'Wagyu con yema curada', pct: 22 },
      { name: 'Rock Shrimp', pct: 18 },
      { name: 'Nigiri Edomae', pct: 15 },
      { name: 'Fried Rice con foie', pct: 11 },
    ],
    weekRevenue: '€24.500',
    satisfaction: '4.6',
  },
};

const DEFAULT_ANALYTICS = {
  weekCoversByDay: [22, 30, 28, 35, 48, 56, 40],
  avgTicket: '€45',
  occupancy: '74%',
  noShowRate: '5%',
  peakHour: '20:00 – 21:30',
  topDishes: [
    { name: 'Dish 1', pct: 30 },
    { name: 'Dish 2', pct: 25 },
    { name: 'Dish 3', pct: 20 },
    { name: 'Dish 4', pct: 15 },
    { name: 'Dish 5', pct: 10 },
  ],
  weekRevenue: '€12.600',
  satisfaction: '4.3',
};

const I18N = {
  es: {
    heading: 'Análisis',
    period: 'Últimos 7 días',
    covers: 'Cubiertos por día',
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    avgTicket: 'Ticket medio',
    occupancy: 'Ocupación media',
    noShow: 'Tasa de no-show',
    peak: 'Hora punta',
    topDishes: 'Platos más pedidos',
    weekRevenue: 'Facturación semanal',
    satisfaction: 'Satisfacción',
    previewNote: 'Los datos reales estarán disponibles tras tu primer mes de servicio.',
  },
  'pt-BR': {
    heading: 'Análises',
    period: 'Últimos 7 dias',
    covers: 'Cobertos por dia',
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    avgTicket: 'Ticket médio',
    occupancy: 'Ocupação média',
    noShow: 'Taxa de no-show',
    peak: 'Horário de pico',
    topDishes: 'Pratos mais pedidos',
    weekRevenue: 'Faturamento semanal',
    satisfaction: 'Satisfação',
    previewNote: 'Os dados reais estarão disponíveis após o primeiro mês de serviço.',
  },
  en: {
    heading: 'Analytics',
    period: 'Last 7 days',
    covers: 'Covers per day',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    avgTicket: 'Avg ticket',
    occupancy: 'Avg occupancy',
    noShow: 'No-show rate',
    peak: 'Peak hour',
    topDishes: 'Most ordered',
    weekRevenue: 'Weekly revenue',
    satisfaction: 'Satisfaction',
    previewNote: 'Real data will be available after your first month of service.',
  },
};

export default function DemoAnalyticsPanel({ restaurantName, lang, presetKey }: DemoAnalyticsPanelProps) {
  const data = presetKey ? (PRESET_ANALYTICS[presetKey as keyof typeof PRESET_ANALYTICS] ?? DEFAULT_ANALYTICS) : DEFAULT_ANALYTICS;
  const ui = I18N[lang as keyof typeof I18N] ?? I18N.en;
  const maxCovers = Math.max(...data.weekCoversByDay);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-[22px] font-bold text-stone-900 tracking-tight">{restaurantName}</h1>
        <p className="text-stone-500 text-[13px] mt-0.5">{ui.heading} &mdash; {ui.period}</p>
      </div>

      {/* Preview badge */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 flex-shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-xs text-amber-700">{ui.previewNote}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Left: bar chart + KPIs */}
        <div className="space-y-6">
          {/* Bar chart */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <p className="text-sm font-semibold text-stone-700 mb-4">{ui.covers}</p>
            <div className="flex items-end gap-2 h-36">
              {data.weekCoversByDay.map((covers, i) => {
                const heightPct = maxCovers > 0 ? (covers / maxCovers) * 100 : 0;
                const isFri = i === 4;
                const isSat = i === 5;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] text-stone-400">{covers}</span>
                    <div className="w-full rounded-t-sm transition-all" style={{
                      height: `${heightPct}%`,
                      backgroundColor: isFri || isSat ? '#9F1239' : '#E5E7EB',
                      minHeight: 4,
                    }} />
                    <span className="text-[10px] text-stone-400">{ui.days[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: ui.avgTicket, value: data.avgTicket },
              { label: ui.occupancy, value: data.occupancy },
              { label: ui.noShow, value: data.noShowRate },
              { label: ui.peak, value: data.peakHour },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                <p className="text-[11px] text-stone-400 mb-1">{label}</p>
                <p className="text-lg font-bold text-stone-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: top dishes + revenue */}
        <div className="space-y-4">
          {/* Revenue + satisfaction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <p className="text-[11px] text-stone-400 mb-1">{ui.weekRevenue}</p>
              <p className="text-xl font-bold text-stone-900">{data.weekRevenue}</p>
            </div>
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <p className="text-[11px] text-stone-400 mb-1">{ui.satisfaction}</p>
              <p className="text-xl font-bold text-stone-900">{data.satisfaction} <span className="text-sm text-stone-400">/5</span></p>
            </div>
          </div>

          {/* Top dishes */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <p className="text-sm font-semibold text-stone-700 mb-4">{ui.topDishes}</p>
            <div className="space-y-3">
              {data.topDishes.map((dish) => (
                <div key={dish.name}>
                  <div className="flex justify-between text-[12px] text-stone-600 mb-1">
                    <span>{dish.name}</span>
                    <span className="font-medium">{dish.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-burgundy"
                      style={{ width: `${dish.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
