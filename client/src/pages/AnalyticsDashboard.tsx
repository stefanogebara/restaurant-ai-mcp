import { useState, useEffect } from 'react';
import AnalyticsStats from '../components/analytics/AnalyticsStats';
import ReservationTrendChart from '../components/analytics/ReservationTrendChart';
import PeakHoursChart from '../components/analytics/PeakHoursChart';
import DayOfWeekChart from '../components/analytics/DayOfWeekChart';
import TableUtilizationHeatmap from '../components/analytics/TableUtilizationHeatmap';
import StatusBreakdownPie from '../components/analytics/StatusBreakdownPie';

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

      const response = await fetch('/api/analytics');
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
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-xl text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <div className="bg-card rounded-lg p-8 border border-destructive/30 max-w-md">
          <div className="text-6xl mb-4 text-center">⚠️</div>
          <div className="text-xl text-destructive mb-6 text-center font-semibold">Error loading analytics</div>
          <p className="text-sm text-muted-foreground mb-6 text-center">{error}</p>
          <button
            onClick={() => fetchAnalytics()}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all shadow-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-xl text-muted-foreground">No analytics data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-[1600px] mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">📊 Analytics Dashboard</h1>
              <p className="text-muted-foreground text-sm">Restaurant performance insights and trends</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchAnalytics()}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <a
                href="/host-dashboard"
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all"
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
        <div className="bg-muted/50 border border-border rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Analytics data is calculated from the last 30 days of restaurant activity.
            <br />
            Data refreshes automatically every 5 minutes or manually via the Refresh button.
          </p>
        </div>
      </div>
    </div>
  );
}
