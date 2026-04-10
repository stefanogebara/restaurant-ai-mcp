import { useState } from 'react';

/**
 * DemoAnalyticsPanel — mock analytics view shown when clicking Analytics in the demo sidebar.
 * Displays realistic-looking weekly/monthly data tailored per preset.
 */

interface DemoAnalyticsPanelProps {
  restaurantName: string;
  lang: string;
  presetKey?: string;
}

const PRESET_ANALYTICS = {
  makoto: {
    week: {
      coversByDay: [8, 14, 12, 16, 24, 28, 20],
      avgTicket: '€92',
      occupancy: '81%',
      noShowRate: '3%',
      peakHour: '21:30 – 22:30',
      revenue: '€24.500',
      satisfaction: '4.6',
    },
    month: {
      coversByDay: [28, 32, 24, 36, 44, 52, 38, 30, 26, 34, 42, 56, 48, 40, 22, 28, 36, 44, 52, 60, 50, 32, 28, 38, 46, 58, 54, 42, 36, 30],
      avgTicket: '€94',
      occupancy: '83%',
      noShowRate: '3%',
      peakHour: '21:30 – 22:30',
      revenue: '€98.400',
      satisfaction: '4.7',
    },
    topDishes: [
      { name: 'Menú Omakase', pct: 34 },
      { name: 'Wagyu con yema curada', pct: 22 },
      { name: 'Rock Shrimp', pct: 18 },
      { name: 'Nigiri Edomae', pct: 15 },
      { name: 'Fried Rice con foie', pct: 11 },
    ],
  },
};

const DEFAULT_ANALYTICS = {
  week: {
    coversByDay: [22, 30, 28, 35, 48, 56, 40],
    avgTicket: '€45',
    occupancy: '74%',
    noShowRate: '5%',
    peakHour: '20:00 – 21:30',
    revenue: '€12.600',
    satisfaction: '4.3',
  },
  month: {
    coversByDay: [20, 28, 24, 32, 44, 54, 38, 22, 26, 30, 40, 52, 46, 36, 20, 24, 32, 40, 48, 58, 44, 30, 24, 34, 42, 54, 50, 40, 32, 28],
    avgTicket: '€46',
    occupancy: '76%',
    noShowRate: '5%',
    peakHour: '20:00 – 21:30',
    revenue: '€51.200',
    satisfaction: '4.4',
  },
  topDishes: [
    { name: 'Plato del día', pct: 30 },
    { name: 'Menú degustación', pct: 25 },
    { name: 'Ensalada especial', pct: 20 },
    { name: 'Postre de temporada', pct: 15 },
    { name: 'Entrante de la casa', pct: 10 },
  ],
};

const I18N = {
  es: {
    heading: 'Análisis',
    period7: 'Últimos 7 días',
    period30: 'Últimos 30 días',
    covers: 'Cubiertos por día',
    weekDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    avgTicket: 'Ticket medio',
    occupancy: 'Ocupación media',
    noShow: 'Tasa de no-show',
    peak: 'Hora punta',
    topDishes: 'Platos más pedidos',
    revenue7: 'Facturación semanal',
    revenue30: 'Facturación mensual',
    satisfaction: 'Satisfacción',
    previewNote: 'Los datos reales estarán disponibles tras tu primer mes de servicio.',
  },
  'pt-BR': {
    heading: 'Análises',
    period7: 'Últimos 7 dias',
    period30: 'Últimos 30 dias',
    covers: 'Cobertos por dia',
    weekDays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    avgTicket: 'Ticket médio',
    occupancy: 'Ocupação média',
    noShow: 'Taxa de no-show',
    peak: 'Horário de pico',
    topDishes: 'Pratos mais pedidos',
    revenue7: 'Faturamento semanal',
    revenue30: 'Faturamento mensal',
    satisfaction: 'Satisfação',
    previewNote: 'Os dados reais estarão disponíveis após o primeiro mês de serviço.',
  },
  en: {
    heading: 'Analytics',
    period7: 'Last 7 days',
    period30: 'Last 30 days',
    covers: 'Covers per day',
    weekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    avgTicket: 'Avg ticket',
    occupancy: 'Avg occupancy',
    noShow: 'No-show rate',
    peak: 'Peak hour',
    topDishes: 'Most ordered',
    revenue7: 'Weekly revenue',
    revenue30: 'Monthly revenue',
    satisfaction: 'Satisfaction',
    previewNote: 'Real data will be available after your first month of service.',
  },
};

export default function DemoAnalyticsPanel({ restaurantName, lang, presetKey }: DemoAnalyticsPanelProps) {
  const [period, setPeriod] = useState<'7' | '30'>('7');
  const presetData = presetKey ? (PRESET_ANALYTICS[presetKey as keyof typeof PRESET_ANALYTICS] ?? DEFAULT_ANALYTICS) : DEFAULT_ANALYTICS;
  const ui = I18N[lang as keyof typeof I18N] ?? I18N.en;

  const periodData = period === '7' ? presetData.week : presetData.month;
  const covers = periodData.coversByDay;
  const maxCovers = Math.max(...covers);

  // For 30-day chart, group into weeks for readability (show 4 bars)
  const chartBars = period === '30'
    ? [0, 1, 2, 3].map(w => {
        const slice = covers.slice(w * 7, w * 7 + 7);
        return { value: Math.round(slice.reduce((a, b) => a + b, 0) / slice.length), isWeek: true, label: `S${w + 1}` };
      })
    : covers.map((v, i) => ({ value: v, isWeek: false, label: ui.weekDays[i % 7], isWeekend: i === 4 || i === 5 }));

  const chartMax = Math.max(...chartBars.map(b => b.value));
  const revenueLabel = period === '7' ? ui.revenue7 : ui.revenue30;

  return (
    <div className="space-y-6">
      {/* Header + period toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[22px] font-bold text-stone-900 tracking-tight">{restaurantName}</h1>
          <p className="text-stone-500 text-[13px] mt-0.5">{ui.heading}</p>
        </div>
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 flex-shrink-0">
          {(['7', '30'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                period === p
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {p === '7' ? ui.period7 : ui.period30}
            </button>
          ))}
        </div>
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
            <div className={`flex items-end gap-2 h-36 ${period === '30' ? 'gap-4' : 'gap-2'}`}>
              {chartBars.map((bar, i) => {
                const heightPct = chartMax > 0 ? (bar.value / chartMax) * 100 : 0;
                const isHighlight = (bar as { isWeekend?: boolean }).isWeekend || (period === '30' && (i === 1 || i === 2));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px] text-stone-400">{bar.value}</span>
                    <div
                      className="w-full rounded-t-sm transition-all duration-500"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: isHighlight ? '#9F1239' : '#9CA3AF',
                        minHeight: 4,
                      }}
                    />
                    <span className="text-[10px] text-stone-500">{bar.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: ui.avgTicket, value: periodData.avgTicket },
              { label: ui.occupancy, value: periodData.occupancy },
              { label: ui.noShow, value: periodData.noShowRate },
              { label: ui.peak, value: periodData.peakHour },
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
              <p className="text-[11px] text-stone-400 mb-1">{revenueLabel}</p>
              <p className="text-xl font-bold text-stone-900">{periodData.revenue}</p>
            </div>
            <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
              <p className="text-[11px] text-stone-400 mb-1">{ui.satisfaction}</p>
              <p className="text-xl font-bold text-stone-900">{periodData.satisfaction} <span className="text-sm text-stone-400">/5</span></p>
            </div>
          </div>

          {/* Top dishes */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
            <p className="text-sm font-semibold text-stone-700 mb-4">{ui.topDishes}</p>
            <div className="space-y-3">
              {presetData.topDishes.map((dish) => (
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
