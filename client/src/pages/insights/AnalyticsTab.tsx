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
        <h3 className="font-serif text-[26px] text-deep-charcoal">{t('analytics.errorTitle')}</h3>
        <p className="text-[15px] text-muted-stone mt-1 mb-6 max-w-sm">{t('analytics.errorDescription')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-[100px] transition-colors"
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
    <div className="space-y-6 sm:space-y-8">
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
            className="px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-[100px] transition-colors whitespace-nowrap"
          >
            {t('analytics.upgradePlan', 'Upgrade Plan')}
          </a>
        </div>
      )}

      {/* The active tab already names the page; lead with the report's actual scope. */}
      <div className="space-y-3 xl:flex xl:items-end xl:justify-between xl:gap-6 xl:space-y-0">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('analytics.selectedPeriod')}</p>
          <h2 className="mt-1 font-serif text-[26px] leading-tight text-deep-charcoal sm:text-[34px]">
            {periodLabel}
          </h2>
        </div>
        <div className="flex min-w-0 items-center gap-3 xl:flex-1 xl:justify-end">
          <div className="min-w-0 flex-1 xl:flex-none">
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
        <AnalyticsStats overview={data.overview} reservationsByStatus={data.reservations_by_status} reservationsByDay={data.reservations_by_day} />
        <ReservationTrendChart dailyTrend={data.daily_trend} />

        <details className="group border-y hairline py-4 sm:py-5">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy">
            <span>
              <span className="block font-serif text-[23px] leading-tight text-deep-charcoal sm:text-[26px]">{t('analytics.demandPatterns', 'Demand patterns')}</span>
              <span className="mt-1 block text-[13px] text-muted-stone">{t('analytics.demandPatternsDesc', 'Bookings by weekday and time of day')}</span>
            </span>
            <ThiingsIcon name="chevron-down" pxSize={20} className="shrink-0 text-deep-charcoal transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <DayOfWeekChart reservationsByDay={data.reservations_by_day} />
            <PeakHoursChart reservationsByTimeSlot={data.reservations_by_time_slot} />
          </div>
        </details>

        <StatusBreakdownPie reservationsByStatus={data.reservations_by_status} />
      </> : (
        <section className="grid items-end gap-6 border-y hairline py-9 sm:grid-cols-[minmax(0,1fr)_auto] sm:py-12" aria-live="polite">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('analytics.periodOverview', 'Period overview')}</p>
            <h3 className="mt-3 font-serif text-[31px] leading-tight text-deep-charcoal sm:text-[38px]">
              {t('analytics.emptyPeriodTitle', 'No activity recorded.')}
            </h3>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-stone">
              {t('analytics.emptyPeriodDescription', 'There are no bookings or completed services in this range. Try a wider period to find the history.')}
            </p>
          </div>
          {dateRange.preset !== '90d' && (
            <button
              type="button"
              onClick={() => setDateRange({ preset: '90d', ...presetToRange('90d') })}
              className="min-h-[44px] justify-self-start rounded-[100px] border border-deep-charcoal/20 px-5 py-2.5 text-[13px] font-medium text-deep-charcoal hover:bg-deep-charcoal/[0.04] sm:justify-self-end"
            >
              {t('analytics.viewNinetyDays', 'View last 90 days')}
            </button>
          )}
        </section>
      )}

      <section className="pt-2 sm:pt-3">
        <h3 className="font-serif text-[26px] sm:text-[30px] leading-tight text-deep-charcoal">
          {t('analytics.additionalSignals', 'Now and coming days')}
        </h3>
        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] lg:gap-12">
          <div className="border-b hairline pb-6 lg:border-b-0 lg:border-r lg:pr-9">
            <LiveOccupancySignal
              occupiedSeats={data.overview.current_occupancy}
              totalSeats={data.overview.total_capacity}
            />
          </div>
          <NoShowPredictions />
        </div>
      </section>
    </div>
  );
}
