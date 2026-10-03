import { useTranslation } from 'react-i18next';
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import ChartPanel from './ChartPanel';

const plotColors = { reservations: '#3F4E32', rules: '#CDD0C7', labels: '#586254' } as const;

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

  const reservationTotal = dailyTrend.reduce((sum, day) => sum + day.reservations, 0);
  const hasActivity = reservationTotal > 0;
  const peakDay = dailyTrend.reduce<(typeof dailyTrend)[number] | null>(
    (peak, day) => day.reservations > 0 && (!peak || day.reservations > peak.reservations) ? day : peak,
    null,
  );
  // A rolling month needs dates, not repeated weekday abbreviations.
  const localizedTrend = dailyTrend.map(d => ({
    ...d,
    dayLabel: new Date(d.date + 'T12:00:00Z').toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
  }));
  const peakDayLabel = localizedTrend.find(day => day.date === peakDay?.date)?.dayLabel;
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ name: string; value: number; color: string }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-brand-line bg-brand-paper p-3 shadow-sm">
          <p className="mb-2 font-brand text-sm font-medium text-brand-ink">{label}</p>
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
      title={t('analytics.reservationsByDay')}
      ariaLabel={hasActivity ? t('analytics.charts.reservationTrendSingleAria', { reservations: reservationTotal }) : undefined}
      emphasis
    >
      {!hasActivity ? (
        <p className="py-12 text-center text-[14px] text-brand-muted">{t('analytics.noDailyReservations')}</p>
      ) : (
        <div className="h-[180px] sm:h-[260px] xl:h-[310px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={localizedTrend}
            margin={{ top: 18, right: 24, left: -8, bottom: 4 }}
          >
            <CartesianGrid vertical={false} stroke={plotColors.rules} opacity={0.4} />
            <XAxis
              dataKey="dayLabel"
              tick={{ fill: plotColors.labels, fontSize: 13 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={35}
            />
            <YAxis
              tick={{ fill: plotColors.labels, fontSize: 13 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="linear"
              dataKey="reservations"
              name={t('analytics.reservations')}
              stroke={plotColors.reservations}
              strokeWidth={2.5}
              fill={plotColors.reservations}
              fillOpacity={0.055}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {peakDay && peakDayLabel && (
              <ReferenceDot
                x={peakDayLabel}
                y={peakDay.reservations}
                r={4.5}
                fill={plotColors.reservations}
                stroke="white"
                strokeWidth={2}
                label={{ value: `${peakDay.reservations} · ${peakDayLabel}`, position: 'top', offset: 9, fill: plotColors.reservations, fontSize: 12, fontWeight: 600 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}
