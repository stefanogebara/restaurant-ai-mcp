import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { colors } from '../../utils/colors';
import ChartPanel from './ChartPanel';

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
  const serviceTotal = dailyTrend.reduce((sum, day) => sum + day.completed_services, 0);
  const hasActivity = reservationTotal > 0 || serviceTotal > 0;
  const peakDay = dailyTrend.reduce<(typeof dailyTrend)[number] | null>(
    (peak, day) => day.reservations > 0 && (!peak || day.reservations > peak.reservations) ? day : peak,
    null,
  );
  const peakDate = peakDay && new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${peakDay.date}T12:00:00Z`));

  // A rolling month needs dates, not repeated weekday abbreviations.
  const localizedTrend = dailyTrend.map(d => ({
    ...d,
    dayLabel: new Date(d.date + 'T12:00:00Z').toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
  }));
  const peakDayLabel = localizedTrend.find(day => day.date === peakDay?.date)?.dayLabel;
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
      title={t('analytics.dailyReservationsAndServices')}
      description={peakDay && peakDate
        ? t('analytics.dailyPeakTitle', { count: peakDay.reservations, date: peakDate })
        : undefined}
      ariaLabel={hasActivity ? t('analytics.charts.reservationTrendAria', { reservations: reservationTotal, services: serviceTotal }) : undefined}
      badge={hasActivity ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-deep-charcoal" role="group" aria-label={t('analytics.charts.reservationTrendLegend', 'Chart series')}>
          <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 bg-burgundy" aria-hidden="true" />{t('analytics.reservations')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-stone-gray" aria-hidden="true" />{t('analytics.completedServices')}</span>
        </div>
      ) : undefined}
      emphasis
    >
      {!hasActivity ? (
        <p className="py-12 text-center text-[14px] text-muted-stone">{t('analytics.noDailyActivity')}</p>
      ) : (
        <div className="h-[214px] sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={localizedTrend}
            margin={{ top: 8, right: 8, left: -8, bottom: 8 }}
          >
            <CartesianGrid vertical={false} stroke={colors.borderGray} opacity={0.55} />
            <XAxis
              dataKey="dayLabel"
              tick={{ fill: colors.mutedStone, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={35}
            />
            <YAxis
              tick={{ fill: colors.mutedStone, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="linear"
              dataKey="reservations"
              name={t('analytics.reservations')}
              stroke={colors.burgundy}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="completed_services"
              name={t('analytics.completedServices')}
              stroke={colors.stoneGray}
              strokeWidth={1.5}
              strokeOpacity={0.58}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {peakDay && peakDayLabel && (
              <ReferenceDot
                x={peakDayLabel}
                y={peakDay.reservations}
                r={4.5}
                fill={colors.burgundy}
                stroke="white"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}
