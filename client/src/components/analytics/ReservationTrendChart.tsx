import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { colors } from '../../utils/colors';

interface ReservationTrendChartProps {
  dailyTrend: Array<{
    date: string;
    dayName: string;
    reservations: number;
    completed_services: number;
  }>;
}

export default function ReservationTrendChart({ dailyTrend }: ReservationTrendChartProps) {
  const { t, i18n } = useTranslation();

  // Format day labels using browser locale instead of server-hardcoded English
  const localizedTrend = dailyTrend.map(d => ({
    ...d,
    dayLabel: new Date(d.date + 'T12:00:00Z').toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' }),
  }));
  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ name: string; value: number; color: string }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-border-gray/50 rounded-2xl p-3 shadow-lg">
          <p className="text-sm font-semibold text-deep-charcoal mb-2">{label}</p>
          {payload.map((entry, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between py-5 border-b border-[#E5E7EB]">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('analytics.reservationsOverTime')}</span>
        <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">{t('analytics.trendingUp')}</span>
      </div>
      <div role="img" aria-label="Line chart showing reservation trends over time" className="p-6">

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={localizedTrend}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderGray} opacity={0.3} />
          <XAxis
            dataKey="dayLabel"
            stroke={colors.warmStone}
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke={colors.warmStone}
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
              fontSize: '14px',
            }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="reservations"
            name={t('analytics.reservations')}
            stroke={colors.burgundy}
            strokeWidth={3}
            dot={{ fill: colors.burgundy, r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line
            type="monotone"
            dataKey="completed_services"
            name={t('analytics.completedServices')}
            stroke={colors.stoneGray}
            strokeWidth={3}
            dot={{ fill: colors.stoneGray, r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
