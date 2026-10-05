import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, type AnalyticsData } from '../../hooks/useAnalytics';
import { SkeletonAnalytics } from '../../components/common/Skeleton';
import AnalyticsStats, { LiveOccupancySignal } from '../../components/analytics/AnalyticsStats';
import ReservationTrendChart from '../../components/analytics/ReservationTrendChart';
import PeakHoursChart from '../../components/analytics/PeakHoursChart';
import DayOfWeekChart from '../../components/analytics/DayOfWeekChart';
import StatusBreakdownPie from '../../components/analytics/StatusBreakdownPie';
import NoShowPredictions from '../../components/analytics/NoShowPredictions';
import DateRangePicker, { formatPeriodLabel, presetToRange, type DateRangeValue } from '../../components/analytics/DateRangePicker';
import ExportDropdown from '../../components/analytics/ExportDropdown';
import ThiingsIcon from '../../components/common/ThiingsIcon';

const LOADING_TIMEOUT_MS = 10_000;
const init30d = presetToRange('30d');

export default function AnalyticsTab() {
  const { t, i18n } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: '30d', ...init30d });
  const [includeExport, setIncludeExport] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isError, refetch } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    includeExport,
  });
  const periodLabel = formatPeriodLabel(dateRange.startDate, dateRange.endDate, i18n.language);

  // Once the export-enriched payload (raw_reservations) has arrived, capture
  // it into separate state and drop the includeExport flag — otherwise it
  // stays in the query key forever and every 30s poll keeps re-fetching the
  // heavy raw_reservations array for the rest of the session.
  const [exportReservations, setExportReservations] = useState<AnalyticsData['raw_reservations']>(undefined);
  useEffect(() => {
    if (includeExport && data?.raw_reservations) {
      setExportReservations(data.raw_reservations);
      setIncludeExport(false);
    }
  }, [includeExport, data?.raw_reservations]);

  // Timeout fallback: if loading takes > 10s, stop showing skeleton
  useEffect(() => {
    if (isLoading) {
      setLoadingTimedOut(false);
      timeoutRef.current = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoadingTimedOut(false);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [isLoading]);

  if (isLoading && !loadingTimedOut) {
    return <SkeletonAnalytics />;
  }

  if ((isError || loadingTimedOut) && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-6 text-center">
        <ThiingsIcon name="alert-circle" pxSize={28} className="text-red-700 mb-3" />
        <h3 className="font-brand text-[26px] text-brand-ink">{t('analytics.errorTitle')}</h3>
        <p className="text-[15px] text-brand-muted mt-1 mb-6 max-w-sm">{t('analytics.errorDescription')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-6 py-2.5 bg-brand-action hover:bg-brand-ink text-brand-paper text-sm font-medium rounded-[100px] transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[15px] text-muted-stone">{t('analytics.noData')}</p>
      </div>
    );
  }

  const hasPeriodActivity = data.overview.total_reservations > 0
    || (data.overview.total_revenue ?? 0) > 0
    || data.daily_trend.some(day => day.reservations > 0 || day.completed_services > 0);

  return (
    <div className="space-y-4 text-brand-ink max-[359px]:space-y-3 sm:space-y-6">
      {/* Upgrade banner for canceled/expired subscriptions */}
      {(data.upgrade_required || data.no_restaurant) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ThiingsIcon name="lightning" pxSize={20} className="text-amber-700 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              {t('analytics.upgradeRequired', 'Upgrade your plan to unlock full analytics with real-time data, trends, and AI insights.')}
            </p>
          </div>
          <a
            href="/subscription/manage"
            className="rounded-[100px] bg-brand-action px-5 py-2 text-sm font-medium text-brand-paper transition-colors hover:bg-brand-ink whitespace-nowrap"
          >
            {t('analytics.upgradePlan', 'Upgrade Plan')}
          </a>
        </div>
      )}

      {/* The active tab names the page; the actual reporting scope leads. */}
      <div className="grid gap-0 sm:gap-3 sm:border-b sm:border-brand-line sm:pb-3 xl:grid-cols-[minmax(180px,1fr)_auto] xl:items-end xl:gap-8">
        <div className="sr-only min-w-0 sm:not-sr-only">
          <p className="sr-only sm:not-sr-only sm:mb-1.5 sm:text-[11px] sm:font-medium sm:uppercase sm:tracking-[0.14em] sm:text-brand-muted">{t('analytics.selectedPeriod')}</p>
          <h2 className="font-brand text-[18px] leading-tight tracking-[-0.025em] text-brand-ink sm:text-[24px]">
            {periodLabel}
          </h2>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 xl:justify-end">
          <div className={`min-w-0 ${hasPeriodActivity ? 'flex-1 xl:flex-none' : 'w-36 flex-none sm:w-auto'}`}>
            <DateRangePicker value={dateRange} onChange={range => {
              setDateRange(range);
              setExportReservations(undefined);
              setIncludeExport(false);
            }} />
          </div>
          {hasPeriodActivity && <div className="shrink-0">
            <ExportDropdown
              data={{ ...data, raw_reservations: data.raw_reservations ?? exportReservations }}
              dateLabel={`${dateRange.startDate}_${dateRange.endDate}`}
              onExportAll={() => setIncludeExport(true)}
              isExporting={isLoading && includeExport}
            />
          </div>}
        </div>
      </div>

      {hasPeriodActivity ? <>
        {/* Historical measures are meaningful only when the period has activity. */}
        <AnalyticsStats compact compactPart="lead" overview={data.overview} reservationsByStatus={data.reservations_by_status} reservationsByDay={data.reservations_by_day} />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] xl:gap-9">
          <div className="hidden xl:block">
            <AnalyticsStats overview={data.overview} reservationsByStatus={data.reservations_by_status} reservationsByDay={data.reservations_by_day} />
          </div>
          <div className="min-w-0 xl:border-l xl:border-brand-line xl:pl-9">
            <ReservationTrendChart dailyTrend={data.daily_trend} />
          </div>
        </div>

        <AnalyticsStats compact compactPart="detail" overview={data.overview} reservationsByStatus={data.reservations_by_status} reservationsByDay={data.reservations_by_day} />

        <StatusBreakdownPie reservationsByStatus={data.reservations_by_status} />

        <details className="group border-y border-brand-line py-1.5">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
            <span className="font-brand text-[16px] leading-tight text-brand-ink">{t('analytics.demandPatterns', 'By day and time')}</span>
            <ThiingsIcon name="chevron-down" pxSize={20} className="shrink-0 text-deep-charcoal transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-5 grid grid-cols-1 gap-7 pb-4 lg:grid-cols-2 lg:gap-9 lg:divide-x lg:divide-brand-line">
            <DayOfWeekChart reservationsByDay={data.reservations_by_day} />
            <div className="lg:pl-9"><PeakHoursChart reservationsByTimeSlot={data.reservations_by_time_slot} /></div>
          </div>
        </details>
      </> : (
        <section className="py-2 sm:py-7" aria-live="polite">
          <div>
            <p className="text-[14px] font-medium text-brand-muted">{t('analytics.periodOverview', 'Period overview')}</p>
            <h3 className="mt-1 font-brand text-[24px] leading-[1.15] tracking-tight text-brand-ink sm:text-[34px]">
              {t('analytics.emptyPeriodTitle', 'No activity in this period.')}
            </h3>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-brand-muted">
              {t('analytics.emptyPeriodDescription', 'No bookings or completed services on the selected dates.')}
            </p>
          </div>
          {dateRange.preset !== '90d' && (
            <button
              type="button"
              onClick={() => setDateRange({ preset: '90d', ...presetToRange('90d') })}
              className="mt-1 inline-flex min-h-[40px] items-center gap-2 px-0.5 py-1 text-[15px] font-medium text-brand-action underline-offset-4 hover:underline"
            >
              {t('analytics.viewNinetyDays', 'View last 90 days')}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </section>
      )}

      <section className={`border-t border-brand-line ${hasPeriodActivity ? 'pt-4 sm:pt-8' : 'pt-3 sm:pt-6'}`}>
        <h3 className={`font-brand leading-tight text-brand-ink ${hasPeriodActivity ? 'text-[26px] tracking-tight sm:text-[30px]' : 'text-[16px] font-medium sm:text-[24px]'}`}>
          {t('analytics.additionalSignals', 'Now and coming days')}
        </h3>
        <div className={`grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] lg:gap-12 ${hasPeriodActivity ? 'mt-4 gap-7' : 'mt-2 gap-3 sm:mt-4 sm:gap-7'}`}>
          <div className={`border-b hairline lg:border-b-0 lg:border-r lg:pr-9 ${hasPeriodActivity ? 'pb-6' : 'pb-3 sm:pb-6'}`}>
            <LiveOccupancySignal
              occupiedSeats={data.overview.current_occupancy}
              totalSeats={data.overview.total_capacity}
              compact={!hasPeriodActivity}
            />
          </div>
          <NoShowPredictions />
        </div>
      </section>
    </div>
  );
}
