import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import { authFetch } from '../services/api';
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
import ThiingsIcon from '../components/common/ThiingsIcon';

interface AnalyticsData {
  overview: {
    total_reservations: number;
    total_completed_services: number;
    avg_party_size: number;
    avg_service_time_minutes: number;
    total_capacity: number;
    current_occupancy: number;
    current_occupancy_percentage: string;
  };
  reservations_by_status: Record<string, number>;
  reservations_by_day: Record<string, number>;
  reservations_by_time_slot: Record<string, number>;
  table_utilization: Array<{
    table_number: number;
    capacity: number;
    location: string;
    times_used: number;
    utilization_rate: string;
  }>;
  daily_trend: Array<{
    date: string;
    dayName: string;
    reservations: number;
    completed_services: number;
  }>;
}

type DateRange = '30d' | '7d' | 'today';

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { can } = usePermission();

  if (!can('viewAnalytics')) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-stone-gray text-sm">You don't have permission to view analytics.</p>
      </div>
    );
  }

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch('/api/analytics');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch analytics');
      }

      setData(result.analytics);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <DashboardLayout><SkeletonAnalytics /></DashboardLayout>;
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white rounded-2xl p-8 border border-border-gray max-w-md text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('analytics.errorTitle')}</h3>
            <p className="text-sm text-warm-stone mb-6">{error}</p>
            <button
              type="button"
              onClick={() => fetchAnalytics()}
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

  const dateRangeLabel = dateRange === '30d' ? t('analytics.lastThirtyDays') : dateRange === '7d' ? t('analytics.lastSevenDays') : t('analytics.today');

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              {t('analytics.title')} <span className="font-light text-warm-stone">/ {dateRangeLabel}</span>
            </h1>
            <div className="flex items-center gap-2.5">
              {(['30d', '7d', 'today'] as const).map((range) => (
                <button
                  type="button"
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-deep-charcoal text-white border border-deep-charcoal'
                      : 'bg-white border border-border-gray text-stone-gray hover:border-muted-stone'
                  }`}
                >
                  {range === '30d' ? t('analytics.thirtyDays') : range === '7d' ? t('analytics.sevenDays') : t('analytics.today')}
                </button>
              ))}
              <button
                type="button"
                onClick={() => fetchAnalytics()}
                className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
              >
                {t('common.export')}
              </button>
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
