/**
 * Weekly Report Page for Segovia Basic Plan
 *
 * Simple, actionable weekly metrics for small town restaurants:
 * - Covers comparison (up/down from last week)
 * - Busiest days and times
 * - Customer demographics (Tourist %)
 * - Dietary restrictions (for menu planning)
 * - Language distribution
 */

import { useState, useEffect } from 'react';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { SkeletonWeeklyReport } from '../components/common/Skeleton';
import { Link } from 'react-router-dom';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';
import DashboardLayout from '../components/layout/DashboardLayout';
import { authFetch } from '../services/api';
import { useSubscription } from '../hooks/useSubscription';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';

interface WeeklyReportData {
  period: {
    start: string;
    end: string;
    label: string;
  };
  summary: {
    total_covers: number;
    previous_covers: number;
    covers_change_percent: number;
    total_reservations: number;
    reservation_count: number;
    walk_in_count: number;
    avg_party_size: number;
    cancellation_rate: number;
    cancelled_count: number;
  };
  busiest: {
    days: Array<{ day: string; covers: number }>;
    times: Array<{ time: string; covers: number }>;
  };
  demographics: {
    tourist_count: number;
    local_count: number;
    tourist_percentage: number;
    first_time_visitors: number;
    repeat_customers: number;
  };
  preferences: {
    dietary_restrictions: Record<string, number>;
    languages: Record<string, number>;
    seating: Record<string, number>;
    occasions: Record<string, number>;
  };
}

export default function WeeklyReport() {
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || undefined;
  const hasAccess = currentPlan ? hasFeatureAccess(currentPlan, 'weeklyReports') : false;

  const [report, setReport] = useState<WeeklyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    // Set default to current week
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);

    fetchReport(start, end);
  }, []);

  const fetchReport = async (start?: Date, end?: Date) => {
    setIsLoading(true);
    try {
      const startParam = start ? start.toISOString().split('T')[0] : startDate;
      const endParam = end ? end.toISOString().split('T')[0] : endDate;

      const response = await authFetch(
        `/api/reports?action=weekly&start_date=${startParam}&end_date=${endParam}`
      );
      const result = await response.json();

      if (result.success) {
        setReport(result.data);
      }
    } catch (error) {
      console.error('Error fetching weekly report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateChange = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    fetchReport(start, end);
  };

  const handlePrint = () => {
    window.print();
  };

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.reports} className="mb-4" />
          <div className="flex items-center justify-center min-h-[50vh]">
            <Spinner size="lg" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.reports} className="mb-4" />
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-white rounded-2xl border border-[#E7E5E4] p-12 max-w-lg text-center">
              <ThiingsIcon name="lock" pxSize={32} className="mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-[#1C1917] mb-3">Weekly Reports</h2>
              <p className="text-[#57534E] mb-6">
                Detailed weekly analytics and performance reports. Available on the Professional plan.
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-[#9F1239] font-medium mb-6">
                <ThiingsIcon name="crown" size="xs" />
                Professional Plan Feature
              </div>
              <Link
                to="/welcome"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors font-medium"
              >
                Upgrade Plan
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Breadcrumb items={breadcrumbConfigs.reports} className="mb-4" />
          <SkeletonWeeklyReport />
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-foreground">No data available</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { summary, busiest, demographics, preferences } = report;

  return (
    <DashboardLayout>
    <div className="dashboard min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={breadcrumbConfigs.reports} className="mb-4 print:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between mb-8 print:mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Weekly Report</h1>
            <p className="text-muted-foreground">{report.period.label}</p>
          </div>

          <div className="flex gap-3 print:hidden">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-lg transition"
            >
              <ThiingsIcon name="download" size="xs" />
              Download/Print
            </button>
            <button
              onClick={() => fetchReport()}
              className="flex items-center gap-2 px-4 py-2 border border-[#E7E5E4] hover:border-[#A8A29E] text-[#57534E] rounded-lg transition"
            >
              <ThiingsIcon name="refresh" size="xs" />
              Refresh
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="mb-6 p-4 bg-card rounded-lg border border-border print:hidden">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              />
            </div>
            <button
              onClick={handleDateChange}
              className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-lg transition mt-6"
            >
              Update Report
            </button>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {/* Total Covers */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <ThiingsIcon name="users" pxSize={32} />
              {summary.previous_covers >= 3 ? (
                summary.covers_change_percent >= 0 ? (
                  <ThiingsIcon name="trending-up" pxSize={24} />
                ) : (
                  <ThiingsIcon name="trending-down" pxSize={24} />
                )
              ) : null}
            </div>
            <div className="text-4xl font-bold text-foreground mb-1">{summary.total_covers}</div>
            <div className="text-sm text-muted-foreground">Total Covers</div>
            {summary.previous_covers >= 3 ? (
              <div className={`text-sm font-semibold mt-2 ${summary.covers_change_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}% vs last week
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">
                First week of data
              </div>
            )}
          </div>

          {/* Reservations */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <ThiingsIcon name="calendar" pxSize={32} className="mb-2" />
            <div className="text-4xl font-bold text-foreground mb-1">{summary.total_reservations}</div>
            <div className="text-sm text-muted-foreground">Total Reservations</div>
            <div className="text-sm text-foreground mt-2">
              {summary.reservation_count} seated · {summary.walk_in_count} walk-ins
            </div>
          </div>

          {/* Average Party Size */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <ThiingsIcon name="users" pxSize={32} className="mb-2" />
            <div className="text-4xl font-bold text-foreground mb-1">{summary.avg_party_size}</div>
            <div className="text-sm text-muted-foreground">Avg Party Size</div>
            <div className="text-sm text-foreground mt-2">
              {summary.total_covers} guests total
            </div>
          </div>

          {/* Cancellation Rate */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <ThiingsIcon name="calendar" pxSize={32} />
              <span className="text-sm text-red-400">{summary.cancelled_count} cancelled</span>
            </div>
            <div className="text-4xl font-bold text-foreground mb-1">{summary.cancellation_rate}%</div>
            <div className="text-sm text-muted-foreground">Cancellation Rate</div>
          </div>
        </div>

        {/* Busiest Times */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Busiest Days */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-4">
              <ThiingsIcon name="calendar" size="sm" />
              <h2 className="text-xl font-bold text-foreground">Busiest Days</h2>
            </div>
            <div className="space-y-3">
              {busiest.days.map((day, index) => (
                <div key={day.day} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#78716C] w-5">#{index + 1}</span>
                    <span className="text-foreground font-medium">{day.day}</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">{day.covers}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Busiest Times */}
          <div className="bg-card p-6 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-4">
              <ThiingsIcon name="clock" size="sm" />
              <h2 className="text-xl font-bold text-foreground">Busiest Times</h2>
            </div>
            <div className="space-y-3">
              {busiest.times.map((time, index) => (
                <div key={time.time} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[#78716C] w-5">#{index + 1}</span>
                    <span className="text-foreground font-medium">{time.time}</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">{time.covers}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Customer Demographics */}
        <div className="bg-card p-6 rounded-lg border border-border mb-8">
          <div className="flex items-center gap-2 mb-6">
            <ThiingsIcon name="users" size="sm" />
            <h2 className="text-xl font-bold text-foreground">Customer Demographics</h2>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums mb-2">{demographics.tourist_percentage}%</div>
              <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider">Tourists</div>
              <div className="text-sm text-[#A8A29E] mt-1">{demographics.tourist_count} visitors</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums mb-2">
                {demographics.tourist_count + demographics.local_count > 0
                  ? Math.round((demographics.local_count / (demographics.tourist_count + demographics.local_count)) * 100)
                  : 0}%
              </div>
              <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider">Locals</div>
              <div className="text-sm text-[#A8A29E] mt-1">{demographics.local_count} residents</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums mb-2">{demographics.first_time_visitors}</div>
              <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider">First-Time</div>
              <div className="text-sm text-[#A8A29E] mt-1">New customers</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-semibold text-[#1C1917] tracking-tight tabular-nums mb-2">{demographics.repeat_customers}</div>
              <div className="text-xs font-medium text-[#78716C] uppercase tracking-wider">Repeat</div>
              <div className="text-sm text-[#A8A29E] mt-1">Returning guests</div>
            </div>
          </div>
        </div>

        {/* Preferences Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Dietary Restrictions */}
          {Object.keys(preferences.dietary_restrictions).length > 0 && (
            <div className="bg-card p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-4">
                <ThiingsIcon name="utensils" size="sm" />
                <h2 className="text-xl font-bold text-foreground">Dietary Restrictions</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(preferences.dietary_restrictions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([restriction, count]) => (
                    <div key={restriction} className="flex items-center justify-between p-2 bg-background rounded">
                      <span className="text-foreground">{restriction}</span>
                      <span className="text-xl font-semibold text-[#1C1917] tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {Object.keys(preferences.languages).length > 0 && (
            <div className="bg-card p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-4">
                <ThiingsIcon name="languages" size="sm" />
                <h2 className="text-xl font-bold text-foreground">Languages</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(preferences.languages)
                  .sort((a, b) => b[1] - a[1])
                  .map(([language, count]) => (
                    <div key={language} className="flex items-center justify-between p-2 bg-background rounded">
                      <span className="text-foreground">{language}</span>
                      <span className="text-xl font-semibold text-[#1C1917] tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Seating Preferences */}
          {Object.keys(preferences.seating).length > 0 && (
            <div className="bg-card p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-4">
                <ThiingsIcon name="map-pin" size="sm" />
                <h2 className="text-xl font-bold text-foreground">Seating Preferences</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(preferences.seating)
                  .sort((a, b) => b[1] - a[1])
                  .map(([seating, count]) => (
                    <div key={seating} className="flex items-center justify-between p-2 bg-background rounded">
                      <span className="text-foreground">{seating}</span>
                      <span className="text-xl font-semibold text-[#1C1917] tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Special Occasions */}
          {Object.keys(preferences.occasions).length > 0 && (
            <div className="bg-card p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-4">
                <ThiingsIcon name="calendar" size="sm" />
                <h2 className="text-xl font-bold text-foreground">Special Occasions</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(preferences.occasions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([occasion, count]) => (
                    <div key={occasion} className="flex items-center justify-between p-2 bg-background rounded">
                      <span className="text-foreground">{occasion}</span>
                      <span className="text-xl font-semibold text-[#1C1917] tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
