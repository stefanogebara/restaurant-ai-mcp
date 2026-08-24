import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { colors } from '../../utils/colors';
import ChartPanel from './ChartPanel';

interface PeakHoursChartProps {
  reservationsByTimeSlot: Record<string, number>;
}

// Translate backend-generated time slot labels on the frontend
const TIME_SLOT_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Lunch (11AM-2PM)': 'Almoço (11h-14h)',
    'Early Dinner (5PM-7PM)': 'Jantar Cedo (17h-19h)',
    'Prime Dinner (7PM-10PM)': 'Jantar Principal (19h-22h)',
    'Late Night (10PM+)': 'Noite (22h+)',
    'Other': 'Outros',
  },
  es: {
    'Lunch (11AM-2PM)': 'Almuerzo (11-14h)',
    'Early Dinner (5PM-7PM)': 'Cena Temprana (17-19h)',
    'Prime Dinner (7PM-10PM)': 'Cena Principal (19-22h)',
    'Late Night (10PM+)': 'Noche (22h+)',
    'Other': 'Otros',
  },
};

export default function PeakHoursChart({ reservationsByTimeSlot }: PeakHoursChartProps) {
  const { t, i18n } = useTranslation();
  const tSlot = (slot: string) => TIME_SLOT_I18N[i18n.language]?.[slot] ?? slot;

  // Transform object data into array for Recharts
  const chartData = Object.entries(reservationsByTimeSlot).map(([time, count]) => ({
    time: tSlot(time),
    count,
  }));

  // Find max value to determine color intensity. Math.max() of an empty array
  // is -Infinity, which makes every `count / maxCount` ratio NaN/-0 below.
  const maxCount = chartData.length > 0 ? Math.max(...chartData.map(d => d.count)) : 0;

  // Custom tooltip with shadcn/ui styling
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-glass-modal backdrop-blur-glass-modal border border-glass-border-dark rounded-2xl p-3 shadow-glass-modal">
          <p className="text-sm font-medium text-deep-charcoal mb-1">{payload[0].payload.time}</p>
          <p className="text-sm text-burgundy">
            {t('analytics.reservations')}: <span className="font-medium">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Dynamic color based on count (darker = more reservations)
  const getBarColor = (count: number) => {
    if (maxCount <= 0) return colors.warmStone;
    const intensity = count / maxCount;
    if (intensity > 0.7) return colors.burgundy;
    if (intensity > 0.4) return colors.stoneGray;
    return colors.warmStone;
  };

  return (
    <ChartPanel title={t('analytics.peakHoursLabel')} ariaLabel={t('analytics.charts.peakHoursAria')}>
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-sm text-muted-stone">
          {t('analytics.noData')}
        </div>
      ) : (
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
      )}

    </ChartPanel>
  );
}
