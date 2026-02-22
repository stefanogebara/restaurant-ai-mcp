import { useState, useEffect } from 'react';
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
              <svg className="w-8 h-8 text-[#dc2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">Error loading analytics</h3>
            <p className="text-sm text-warm-stone mb-6">{error}</p>
            <button
              onClick={() => fetchAnalytics()}
              className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors"
            >
              Retry
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
          <p className="text-warm-stone">No analytics data available</p>
        </div>
      </DashboardLayout>
    );
  }

  const dateRangeLabel = dateRange === '30d' ? 'Last 30 days' : dateRange === '7d' ? 'Last 7 days' : 'Today';

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              Analytics <span className="font-light text-warm-stone">/ {dateRangeLabel}</span>
            </h1>
            <div className="flex items-center gap-2.5">
              {(['30d', '7d', 'today'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-deep-charcoal text-white border border-deep-charcoal'
                      : 'bg-white border border-[#D6D3D1] text-stone-gray hover:border-muted-stone'
                  }`}
                >
                  {range === '30d' ? '30 days' : range === '7d' ? '7 days' : 'Today'}
                </button>
              ))}
              <button
                onClick={() => fetchAnalytics()}
                className="px-4 py-2 bg-white border border-[#D6D3D1] text-stone-gray hover:border-muted-stone rounded-[10px] text-[13px] font-medium transition-colors"
              >
                Export
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
