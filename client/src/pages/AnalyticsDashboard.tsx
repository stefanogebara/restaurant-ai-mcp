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

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <div className="flex flex-col items-center justify-center h-screen bg-[#FAFAF9]">
          <div className="bg-white rounded-xl p-8 border border-red-500/20 shadow-sm max-w-md">
            <div className="text-xl text-red-600 mb-6 text-center font-semibold">Error loading analytics</div>
            <p className="text-sm text-[#78716C] mb-6 text-center">{error}</p>
            <button
              onClick={() => fetchAnalytics()}
              className="w-full px-6 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all"
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
        <div className="flex items-center justify-center h-screen bg-[#FAFAF9]">
          <div className="text-xl text-[#78716C]">No analytics data available</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="dashboard min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="bg-white/95 border-b border-[#E7E5E4] sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight mb-1">Analytics Dashboard</h1>
              <p className="text-[#78716C] text-sm">Restaurant performance insights and trends</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchAnalytics()}
                className="px-4 py-2 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-medium rounded-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <a
                href="/host-dashboard"
                className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white font-medium rounded-xl transition-all shadow-sm shadow-[#9F1239]/20"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <AnalyticsStats overview={data.overview} />
      </div>

      {/* Main Analytics Grid */}
      <div className="max-w-[1600px] mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reservation Trend - Full width on top */}
          <div className="lg:col-span-2">
            <ReservationTrendChart dailyTrend={data.daily_trend} />
          </div>

          {/* Peak Hours and Day of Week */}
          <PeakHoursChart reservationsByTimeSlot={data.reservations_by_time_slot} />
          <DayOfWeekChart reservationsByDay={data.reservations_by_day} />

          {/* No-Show Predictions - Full width */}
          <div className="lg:col-span-2">
            <NoShowPredictions />
          </div>

          {/* Revenue Optimization Opportunities - Full width */}
          <div className="lg:col-span-2">
            <RevenueOpportunities />
          </div>

          {/* Table Utilization Heatmap - Full width */}
          <div className="lg:col-span-2">
            <TableUtilizationHeatmap tableUtilization={data.table_utilization} />
          </div>

          {/* Status Breakdown Pie */}
          <div className="lg:col-span-2">
            <StatusBreakdownPie reservationsByStatus={data.reservations_by_status} />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-[1600px] mx-auto px-6 pb-8">
        <div className="bg-[#F5F5F4]/50 border border-[#E7E5E4]/50 rounded-xl p-4 text-center">
          <p className="text-xs text-[#78716C]">
            Analytics data is calculated from the last 30 days of restaurant activity.
            <br />
            Data refreshes automatically every 5 minutes or manually via the Refresh button.
          </p>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
