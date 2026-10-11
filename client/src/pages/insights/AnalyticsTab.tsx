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
  // stays in the query key forever and every scheduled poll keeps re-fetching the
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

  if (isError || loadingTimedOut) {
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

  // The API uses a zero-filled payload for access gates. Those zeros are not
  // observed activity and must never flow into the empty-period report.
  if (data.upgrade_required || data.no_restaurant) {
    return (
      <section className="max-w-xl border-t border-brand-line pt-7 text-brand-ink sm:pt-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">{t('analytics.title')}</p>
        <h2 className="mt-3 font-brand text-[28px] leading-[1.1] tracking-[-0.035em] sm:text-[36px]">
          {data.no_restaurant ? t('analytics.noRestaurantTitle', 'Set up your restaurant first') : t('analytics.upgradeTitle', 'Analytics are not available on this plan')}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-brand-muted">
          {data.no_restaurant
            ? t('analytics.noRestaurantDescription', 'Finish setup to see your restaurant’s real activity here.')
            : t('analytics.upgradeRequired', 'Upgrade your plan to unlock full analytics with real-time data, trends, and AI insights.')}
        </p>
        <a
          href={data.no_restaurant ? '/onboarding' : '/subscription/manage'}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-action px-5 text-[13px] font-medium text-brand-paper transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {data.no_restaurant ? t('analytics.finishSetup', 'Finish setup') : t('analytics.upgradePlan', 'Upgrade Plan')}
          <ThiingsIcon name="arrow-right" pxSize={15} />
        </a>
      </section>
    );
  }

  const hasPeriodActivity = data.overview.total_reservations > 0
    || (data.overview.total_revenue ?? 0) > 0
    || data.daily_trend.some(day => day.reservations > 0 || day.completed_services > 0);

  return (
    <div className="space-y-4 text-brand-ink max-[359px]:space-y-3 sm:space-y-6">
      {/* The active tab names the page; the actual reporting scope leads. */}
      <div className="grid gap-0 sm:gap-3 sm:border-b sm:border-brand-line sm:pb-3 xl:grid-cols-[minmax(180px,1fr)_auto] xl:items-end xl:gap-8">
        <div className="sr-only min-w-0 sm:not-sr-only">
          <p className="sr-only sm:not-sr-only sm:mb-1.5 sm:text-[11px] sm:font-medium sm:uppercase sm:tracking-[0.14em] sm:text-brand-muted">{t('analytics.selectedPeriod')}</p>
          <h2 className="font-brand text-[18px] leading-tight tracking-[-0.025em] text-brand-ink sm:text-[24px]">
            {periodLabel}
          </h2>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3 xl:justify-end">
          <div className="min-w-0 flex-1 sm:flex-none">
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
        <section className="flex min-h-[48px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-brand-line pb-2 pt-1 sm:min-h-[56px] sm:pb-3 sm:pt-2" aria-live="polite" aria-label={t('analytics.periodOverview', 'Period overview')}>
          <h3 className="font-brand text-[14px] leading-snug text-brand-muted sm:text-[16px]">
            {t('analytics.emptyPeriodTitle', 'No bookings in this period.')}
          </h3>
          <p className="sr-only">{t('analytics.emptyPeriodDescription', 'No recorded revenue on the selected dates either.')}</p>
          {dateRange.preset !== '90d' && (
            <button
              type="button"
              onClick={() => setDateRange({ preset: '90d', ...presetToRange('90d') })}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-[12px] font-medium text-brand-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
            >
              {t('analytics.viewNinetyDaysAction', 'View 90 days')}
              <ThiingsIcon name="arrow-right" pxSize={14} />
            </button>
          )}
        </section>
      )}

      {hasPeriodActivity ? (
        <section className="border-t border-brand-line pt-4 sm:pt-8">
          <h3 className="font-brand text-[26px] leading-tight tracking-tight text-brand-ink sm:text-[30px]">
            {t('analytics.additionalSignals', 'Now and next 7 days')}
          </h3>
          <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] lg:gap-12">
            <div className="border-b hairline pb-6 lg:border-b-0 lg:border-r lg:pr-9">
              <LiveOccupancySignal occupiedSeats={data.overview.current_occupancy} totalSeats={data.overview.total_capacity} />
            </div>
            <NoShowPredictions />
          </div>
        </section>
      ) : (
        <section className="!mt-6 sm:!mt-9">
          <NoShowPredictions featured />
          <CompactLiveOccupancy occupiedSeats={data.overview.current_occupancy} totalSeats={data.overview.total_capacity} />
        </section>
      )}
    </div>
  );
}

function CompactLiveOccupancy({ occupiedSeats, totalSeats }: { occupiedSeats: number; totalSeats: number }) {
  const { t } = useTranslation();
  const hasSeatCount = Number.isFinite(occupiedSeats) && occupiedSeats >= 0
    && Number.isFinite(totalSeats) && totalSeats > 0;

  return (
    <section className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-[1.5] text-brand-muted max-[359px]:mt-2 sm:mt-7 sm:text-[13px]" aria-label={t('analytics.currentOccupancy', 'Occupancy now')}>
      <span>{t('analytics.currentOccupancy', 'Occupancy now')} ·</span>
      <span className="tabular-nums text-brand-ink">
        {hasSeatCount
          ? t('analytics.occupancyFooterCount', { occupied: occupiedSeats, capacity: totalSeats })
          : t('analytics.capacityUnavailable', 'Capacity not configured')}
      </span>
      <span className="sr-only">{t('analytics.outsideSelectedPeriod', 'Live · outside the date filter')}</span>
    </section>
  );
}
