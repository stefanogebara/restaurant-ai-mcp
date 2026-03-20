import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { Formatter as LegendFormatter, LegendPayload } from 'recharts/types/component/DefaultLegendContent';
import type { PieLabelRenderProps } from 'recharts';
import { colors } from '../../utils/colors';

interface StatusBreakdownPieProps {
  reservationsByStatus: Record<string, number>;
}

export default function StatusBreakdownPie({ reservationsByStatus }: StatusBreakdownPieProps) {
  const { t } = useTranslation();
  // FIX 4: Translate status labels using existing i18n keys
  const statusKeyMap: Record<string, string> = {
    confirmed: 'reservations.confirmed',
    pending: 'reservations.pending',
    cancelled: 'reservations.cancelled',
    completed: 'reservations.completed',
    'no-show': 'reservations.noShow',
    no_show: 'reservations.noShow',
    seated: 'reservations.seated',
  };

  // Transform object data into array for Recharts
  const chartData = Object.entries(reservationsByStatus).map(([status, count]) => {
    const i18nKey = statusKeyMap[status.toLowerCase()];
    const translatedName = i18nKey ? t(i18nKey) : (status.charAt(0).toUpperCase() + status.slice(1));
    return { name: translatedName, value: count, rawStatus: status };
  });

  // Color mapping for each status (by raw lowercase status key)
  const COLORS: Record<string, string> = {
    pending: colors.warmStone,
    confirmed: colors.stoneGray,
    seated: colors.burgundy,
    completed: '#22c55e',
    cancelled: '#ef4444',
    'no-show': '#f97316',
    no_show: '#f97316',
  };

  // Custom label to show percentage
  const renderLabel = (entry: PieLabelRenderProps) => {
    const entryValue = typeof entry.value === 'number' ? entry.value : 0;
    const percent = ((entryValue / chartData.reduce((sum, e) => sum + e.value, 0)) * 100).toFixed(0);
    return `${percent}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) => {
    if (active && payload && payload.length) {
      const total = chartData.reduce((sum, e) => sum + e.value, 0);
      const percent = ((payload[0].value / total) * 100).toFixed(1);
      return (
        <div className="bg-white border border-border-gray/50 rounded-2xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{payload[0].name}</p>
          <p className="text-sm" style={{ color: payload[0].payload.fill }}>
            {t('analytics.count')}: <span className="font-bold">{payload[0].value}</span>
          </p>
          <p className="text-xs text-warm-stone">
            {percent}% {t('analytics.ofTotalReservations')}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E5E7EB]">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('analytics.statusBreakdown')}</span>
      </div>
      <div role="img" aria-label="Pie chart showing reservation status breakdown" className="p-6">

      <div className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={100}
              innerRadius={60} // Makes it a donut chart
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.rawStatus.toLowerCase()] || colors.mutedStone} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={((value: string, entry: LegendPayload) => (
                <span className="text-sm text-deep-charcoal">
                  {value} ({entry.payload?.value})
                </span>
              )) as LegendFormatter}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      </div>
    </div>
  );
}
