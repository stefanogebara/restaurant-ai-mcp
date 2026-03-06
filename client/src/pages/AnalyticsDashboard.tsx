import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import { useAnalytics } from '../hooks/useAnalytics';
import { SkeletonAnalytics } from '../components/common/Skeleton';
import DashboardLayout from '../components/layout/DashboardLayout';
import AnalyticsStats from '../components/analytics/AnalyticsStats';
import ReservationTrendChart from '../components/analytics/ReservationTrendChart';
import PeakHoursChart from '../components/analytics/PeakHoursChart';
import DayOfWeekChart from '../components/analytics/DayOfWeekChart';
import TableUtilizationHeatmap from '../components/analytics/TableUtilizationHeatmap';
import StatusBreakdownPie from '../components/analytics/StatusBreakdownPie';
import NoShowPredictions from '../components/analytics/NoShowPredictions';
import RevenueOpportunities from '../components/analytics/RevenueOpportunities';
import DateRangePicker, { presetToRange, type DateRangeValue } from '../components/analytics/DateRangePicker';
import ExportDropdown from '../components/analytics/ExportDropdown';
import ThiingsIcon from '../components/common/ThiingsIcon';

const init30d = presetToRange('30d');

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { can } = usePermission();
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: '30d', ...init30d });
  const [includeExport, setIncludeExport] = useState(false);

  const { data, isLoading, isError, error, refetch } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    includeExport,
  });

  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-10 max-w-md text-center shadow-sm">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="bar-chart" pxSize={32} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-deep-charcoal mb-2">{t('analytics.upgradeTitle')}</h3>
            <p className="text-sm text-stone-gray mb-6 leading-relaxed">
              {t('analytics.upgradeDescription')}
            </p>
            <a
              href="/subscription/manage"
              className="inline-flex items-center gap-2 px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
            >
              <ThiingsIcon name="lightning" size="xs" />
              {t('analytics.upgradePlan')}
            </a>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return <DashboardLayout><SkeletonAnalytics /></DashboardLayout>;
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white rounded-2xl p-8 border border-border-gray max-w-md text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('analytics.errorTitle')}</h3>
            <p className="text-sm text-warm-stone mb-6">{t('analytics.errorDescription')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-warm-stone">{t('analytics.noData')}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              {t('analytics.title')}
            </h1>
            <div className="flex flex-col sm:items-end gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <div className="self-end">
                <ExportDropdown
                  data={data}
                  dateLabel={`${dateRange.startDate}_${dateRange.endDate}`}
                  onExportAll={() => setIncludeExport(true)}
                  isExporting={isLoading && includeExport}
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <AnalyticsStats overview={data.overview} />

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReservationTrendChart dailyTrend={data.daily_trend} />
            <DayOfWeekChart reservationsByDay={data.reservations_by_day} />
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TableUtilizationHeatmap tableUtilization={data.table_utilization} />
            <PeakHoursChart reservationsByTimeSlot={data.reservations_by_time_slot} />
          </div>

          {/* AI Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NoShowPredictions />
            <RevenueOpportunities />
          </div>

          {/* Status Breakdown */}
          <StatusBreakdownPie reservationsByStatus={data.reservations_by_status} />
        </div>
      </div>
    </DashboardLayout>
  );
}
