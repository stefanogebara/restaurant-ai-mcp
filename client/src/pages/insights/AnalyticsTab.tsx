import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, type AnalyticsData } from '../../hooks/useAnalytics';
import { SkeletonAnalytics } from '../../components/common/Skeleton';
import AnalyticsStats from '../../components/analytics/AnalyticsStats';
import ReservationTrendChart from '../../components/analytics/ReservationTrendChart';
import PeakHoursChart from '../../components/analytics/PeakHoursChart';
import DayOfWeekChart from '../../components/analytics/DayOfWeekChart';
import TableUtilizationHeatmap from '../../components/analytics/TableUtilizationHeatmap';
import StatusBreakdownPie from '../../components/analytics/StatusBreakdownPie';
import NoShowPredictions from '../../components/analytics/NoShowPredictions';
import DateRangePicker, { presetToRange, type DateRangeValue } from '../../components/analytics/DateRangePicker';
import ExportDropdown from '../../components/analytics/ExportDropdown';
import RevenueOpportunities from '../../components/analytics/RevenueOpportunities';
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
  const dateLabel = (date: string) => new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));

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

  return (
    <div className="space-y-8 sm:space-y-10">
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

      {/* One period summary, with filters immediately alongside it. */}
      <div className="space-y-4 border-b hairline pb-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-serif text-[26px] sm:text-[30px] leading-none text-deep-charcoal">
            {t('analytics.title')}
          </h2>
          <div className="shrink-0">
            <ExportDropdown
              data={{ ...data, raw_reservations: data.raw_reservations ?? exportReservations }}
              dateLabel={`${dateRange.startDate}_${dateRange.endDate}`}
              onExportAll={() => setIncludeExport(true)}
              isExporting={isLoading && includeExport}
            />
          </div>
        </div>
        <p className="text-[14px] leading-snug text-muted-stone">
          <span className="font-medium text-deep-charcoal">{dateLabel(dateRange.startDate)} — {dateLabel(dateRange.endDate)}</span>
          <span className="hidden md:inline"> · {t('analytics.selectedPeriodDesc', 'Reservation dates and recorded bills in this range.')}</span>
        </p>
        <DateRangePicker value={dateRange} onChange={range => {
          setDateRange(range);
          setExportReservations(undefined);
          setIncludeExport(false);
        }} />
      </div>

      {/* Stats */}
      <AnalyticsStats overview={data.overview} reservationsByStatus={data.reservations_by_status} />

      {/* Trend establishes the period; comparisons follow it. */}
      <div>
        <ReservationTrendChart dailyTrend={data.daily_trend} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DayOfWeekChart reservationsByDay={data.reservations_by_day} />
        <PeakHoursChart reservationsByTimeSlot={data.reservations_by_time_slot} />
      </div>

      <StatusBreakdownPie reservationsByStatus={data.reservations_by_status} />

      <div className="border-b hairline pb-4 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {t('analytics.outsidePeriodSection', 'Other timeframes')}
        </p>
        <h3 className="font-serif text-[26px] sm:text-[30px] leading-tight text-deep-charcoal mt-1">
          {t('analytics.additionalSignals', 'Signals beyond the date filter')}
        </h3>
        <p className="text-[13px] text-muted-stone mt-1 max-w-2xl">
          {t('analytics.additionalSignalsDesc', 'Table-use history, upcoming risk and revenue hypotheses use their own timeframes. Changing the period above does not update them.')}
        </p>
      </div>

      <TableUtilizationHeatmap tableUtilization={data.table_utilization ?? []} />
      <NoShowPredictions />
      <RevenueOpportunities />
    </div>
  );
}
