import { useTranslation } from 'react-i18next';
import ChartPanel from './ChartPanel';

interface ReservationTrendChartProps {
  dailyTrend: Array<{
    date: string;
    dayName: string;
    reservations: number;
    completed_services: number;
  }>;
}

/** One observed count per calendar day. No smoothing, aggregation, or fabricated values. */
export default function ReservationTrendChart({ dailyTrend }: ReservationTrendChartProps) {
  const { t, i18n } = useTranslation();
  const days = dailyTrend.map(day => {
    const date = new Date(`${day.date}T12:00:00Z`);
    return {
      ...day,
      count: Number.isFinite(day.reservations) && day.reservations > 0 ? day.reservations : 0,
      shortDate: date.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
      fullDate: date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
  });
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const peak = days.reduce<(typeof days)[number] | null>(
    (current, day) => day.count > 0 && (!current || day.count > current.count) ? day : current,
    null,
  );
  const axisMax = Math.max(2, Math.ceil((peak?.count ?? 0) / 2) * 2);
  const tickStep = days.length <= 14
    ? Math.max(1, Math.ceil((days.length - 1) / 4))
    : Math.max(7, Math.ceil((days.length - 1) / 35) * 7);
  const labels = days.filter((_, index) => index % tickStep === 0);
  const peakSummary = peak ? t('analytics.dailyPeakSummary', { count: peak.count, date: peak.shortDate }) : '';
  // Straight segments join only actual daily observations. The one visible
  // marker belongs to the measured peak; no curve smoothing invents a trend.
  const trendPoints = days.map((day, index) =>
    `${((index + 0.5) / days.length) * 1000},${100 - (day.count / axisMax) * 100}`,
  ).join(' ');

  return (
    <>
      <ChartPanel
        title={t('analytics.reservationsByDay')}
        badge={peak ? (
          <span aria-label={peakSummary} className="inline-flex items-baseline gap-1 whitespace-nowrap text-brand-ink sm:gap-1.5">
            <span className="font-brand text-[19px] leading-none tabular-nums sm:text-[22px]">{peak.count}</span>
            <span className="text-[12px] text-brand-muted">{t('analytics.dailyPeakDate', { date: peak.shortDate })}</span>
          </span>
        ) : undefined}
        ariaLabel={total > 0 ? `${t('analytics.charts.reservationTrendSingleAria', { reservations: total })} ${peakSummary}` : undefined}
        emphasis
      >
        {total === 0 ? (
          <p className="py-12 text-center text-[14px] text-brand-muted">{t('analytics.noDailyReservations')}</p>
        ) : (
          <div className="h-[148px] overflow-x-auto min-[360px]:h-[174px] sm:h-[260px] xl:h-[280px]" data-chart-scrollable={days.length > 45}>
            <div className="h-full" style={{ minWidth: days.length > 45 ? `${days.length * 9 + 36}px` : undefined }}>
            <div className="grid h-[calc(100%-24px)] grid-cols-[28px_minmax(0,1fr)] gap-2">
              <div aria-hidden="true" className="relative h-full text-right text-[11px] tabular-nums text-brand-muted">
                <span className="absolute right-0 top-3 -translate-y-1/2">{axisMax}</span>
                <span className="absolute right-0 top-[calc(50%+6px)] -translate-y-1/2">{axisMax / 2}</span>
                <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
              </div>
              <div className="relative h-full min-w-0">
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-3 border-y border-brand-line/70">
                  <span className="absolute inset-x-0 top-1/2 border-t border-brand-line/55" />
                </div>
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 top-3 grid"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.length > 1 && (
                    <svg data-trend-line="true" viewBox="0 0 1000 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-brand-action/80">
                      <polyline points={trendPoints} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  )}
                  {days.map(day => {
                    const position = `${(day.count / axisMax) * 100}%`;
                    const isPeak = day.date === peak?.date;
                    return (
                      <span key={day.date} className="relative block h-full min-w-0" data-date={day.date} data-count={day.count} title={`${day.fullDate}: ${day.count} ${t('analytics.reservations')}`}>
                        {isPeak && <span
                          data-day-point="true"
                          data-peak-point="true"
                          className="absolute left-1/2 block h-2 w-2 -translate-x-1/2 rounded-full bg-brand-action"
                          style={{ bottom: `calc(${position} - 4px)` }}
                        />}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="ml-[36px] flex justify-between pt-2 text-[11px] tabular-nums text-brand-muted sm:text-[12px]">
              {labels.map(day => <span key={day.date}>{day.shortDate}</span>)}
            </div>
            </div>
          </div>
        )}
      </ChartPanel>
      {total > 0 && (
        <table className="sr-only">
          <caption>{t('analytics.reservationsByDay')}</caption>
          <thead><tr><th>{t('common.date')}</th><th>{t('analytics.reservations')}</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date}><td>{day.fullDate}</td><td>{day.count}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
}
