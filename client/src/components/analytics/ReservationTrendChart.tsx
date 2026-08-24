import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { colors } from '../../utils/colors';
import ChartPanel, { ChartBadge } from './ChartPanel';

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

  // FIX 2: Calculate real trend from last 7 vs previous 7 days
  const trendInfo = (() => {
    if (dailyTrend.length < 2) return { key: 'analytics.trendStable', tone: 'muted' as const };
    const len = dailyTrend.length;
    const splitIdx = Math.max(0, len - 7);
    const recent = dailyTrend.slice(splitIdx);
    const previous = dailyTrend.slice(Math.max(0, splitIdx - 7), splitIdx);
    const recentTotal = recent.reduce((s, d) => s + d.reservations, 0);
    const prevTotal = previous.reduce((s, d) => s + d.reservations, 0);
    if (prevTotal === 0 && recentTotal === 0) return { key: 'analytics.trendStable', tone: 'muted' as const };
    if (prevTotal === 0) return { key: 'analytics.trendingUp', tone: 'up' as const };
    const change = ((recentTotal - prevTotal) / prevTotal) * 100;
    if (change > 10) return { key: 'analytics.trendingUp', tone: 'up' as const };
    if (change < -10) return { key: 'analytics.trendingDown', tone: 'down' as const };
    return { key: 'analytics.trendStable', tone: 'muted' as const };
  })();

  // Format day labels using browser locale instead of server-hardcoded English
  const localizedTrend = dailyTrend.map(d => ({
    ...d,
    dayLabel: new Date(d.date + 'T12:00:00Z').toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' }),
  }));
  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ name: string; value: number; color: string }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-glass-modal backdrop-blur-glass-modal border border-glass-border-dark rounded-2xl p-3 shadow-glass-modal">
          <p className="text-sm font-medium text-deep-charcoal mb-2">{label}</p>
          {payload.map((entry, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-medium">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ChartPanel
      title={t('analytics.reservationsOverTime')}
      ariaLabel={t('analytics.charts.reservationTrendAria')}
      badge={<ChartBadge tone={trendInfo.tone}>{t(trendInfo.key)}</ChartBadge>}
    >

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
    </ChartPanel>
  );
}
