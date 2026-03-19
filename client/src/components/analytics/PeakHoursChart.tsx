import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { colors } from '../../utils/colors';

interface PeakHoursChartProps {
  reservationsByTimeSlot: Record<string, number>;
}

export default function PeakHoursChart({ reservationsByTimeSlot }: PeakHoursChartProps) {
  const { t } = useTranslation();
  // Transform object data into array for Recharts
  const chartData = Object.entries(reservationsByTimeSlot).map(([time, count]) => ({
    time,
    count,
  }));

  // Find max value to determine color intensity
  const maxCount = Math.max(...chartData.map(d => d.count));

  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-border-gray/50 rounded-2xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{payload[0].payload.time}</p>
          <p className="text-sm text-burgundy">
            {t('analytics.reservations')}: <span className="font-bold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Dynamic color based on count (darker = more reservations)
  const getBarColor = (count: number) => {
    const intensity = count / maxCount;
    if (intensity > 0.7) return colors.burgundy;
    if (intensity > 0.4) return colors.stoneGray;
    return colors.warmStone;
  };

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E5E7EB]">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('analytics.peakHoursLabel')}</span>
      </div>
      <div role="img" aria-label="Bar chart showing peak reservation hours" className="p-6">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} opacity={0.3} />
          <XAxis
            dataKey="time"
            stroke={colors.warmStone}
            style={{ fontSize: '11px' }}
            angle={-35}
            textAnchor="end"
            height={60}
            interval={0}
            tick={{ dy: 5 }}
          />
          <YAxis
            stroke={colors.warmStone}
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.count)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      </div>
    </div>
  );
}
