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
        <div className="min-h-screen bg-[#F5F5F4] p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
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
        <div className="min-h-screen bg-[#F5F5F4] p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
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
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white rounded-full hover:bg-[#881337] transition-colors font-medium"
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
        <div className="min-h-screen bg-[#F5F5F4] p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <SkeletonWeeklyReport />
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#1C1917]">No data available</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { summary, busiest, demographics, preferences } = report;

  // Gather all preferences as pills
  const allPreferencePills = [
    ...Object.entries(preferences.seating).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.dietary_restrictions).map(([k, v]) => ({ label: k, count: v })),
    ...Object.entries(preferences.occasions).map(([k, v]) => ({ label: k, count: v })),
  ].sort((a, b) => b.count - a.count);

  const topPillThreshold = allPreferencePills.length > 3 ? allPreferencePills[2]?.count : 0;

  // Get max covers for bar width calculation
  const maxTimeCovers = Math.max(...busiest.times.map(t => t.covers), 1);

  // Bar color based on intensity
  const getBarColor = (covers: number) => {
    const ratio = covers / maxTimeCovers;
    if (ratio > 0.85) return '#9F1239';
    if (ratio > 0.6) return '#57534E';
    if (ratio > 0.35) return '#A8A29E';
    return '#D6D3D1';
  };
  const getBarTextColor = (covers: number) => {
    const ratio = covers / maxTimeCovers;
    return ratio > 0.35 ? '#fff' : '#78716C';
  };

  // Demographics ranked rows
  const demoRows = [
    { rank: 1, label: 'Tourists', detail: `${demographics.tourist_count} visitors`, pct: demographics.tourist_percentage, color: '#9F1239' },
    { rank: 2, label: 'Locals', detail: `${demographics.local_count} residents`, pct: demographics.tourist_count + demographics.local_count > 0 ? Math.round((demographics.local_count / (demographics.tourist_count + demographics.local_count)) * 100) : 0, color: '#1C1917' },
    { rank: 3, label: 'First-Time', detail: `${demographics.first_time_visitors} new customers`, pct: null, count: demographics.first_time_visitors, color: '#3b82f6' },
    { rank: 4, label: 'Repeat', detail: `${demographics.repeat_customers} returning`, pct: null, count: demographics.repeat_customers, color: '#7c3aed' },
  ];

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-[#F5F5F4] p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
          <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight">
            Reports <span className="font-light text-[#78716C]">/ Weekly</span>
          </h1>
          <div className="flex items-center gap-2.5 print:hidden">
            <div className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#D6D3D1] rounded-[10px] text-[13px] font-medium text-[#57534E]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-[13px] text-[#57534E] w-[110px] cursor-pointer"
              />
              <span className="text-[#A8A29E]">&ndash;</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 text-[13px] text-[#57534E] w-[110px] cursor-pointer"
              />
              <button onClick={handleDateChange} className="ml-1 text-[#9F1239] font-semibold text-xs">Go</button>
            </div>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-[#D6D3D1] text-[#57534E] hover:border-[#A8A29E] rounded-[10px] text-[13px] font-medium transition-colors"
            >
              Download PDF
            </button>
            <button
              onClick={() => fetchReport()}
              className="px-4 py-2 bg-[#9F1239] text-white hover:bg-[#881337] rounded-[10px] text-[13px] font-medium transition-colors"
            >
              Share Report
            </button>
          </div>
        </div>

        {/* Summary Metrics — 5 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-[#E7E5E4] text-center">
            <div className="text-[11px] font-medium text-[#A8A29E] mb-1.5 tracking-wide">Total Reservations</div>
            <div className="text-2xl font-bold tracking-tight">{summary.total_reservations}</div>
            {summary.previous_covers >= 3 && (
              <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}% vs prev week
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E7E5E4] text-center">
            <div className="text-[11px] font-medium text-[#A8A29E] mb-1.5 tracking-wide">Walk-ins</div>
            <div className="text-2xl font-bold tracking-tight">{summary.walk_in_count}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E7E5E4] text-center">
            <div className="text-[11px] font-medium text-[#A8A29E] mb-1.5 tracking-wide">Cancellations</div>
            <div className="text-2xl font-bold tracking-tight text-[#dc2626]">{summary.cancelled_count}</div>
            <div className="text-[11px] font-medium text-[#78716C] mt-1">{summary.cancellation_rate}% rate</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E7E5E4] text-center">
            <div className="text-[11px] font-medium text-[#A8A29E] mb-1.5 tracking-wide">Avg Party Size</div>
            <div className="text-2xl font-bold tracking-tight">{summary.avg_party_size}</div>
            <div className="text-[11px] font-medium text-[#78716C] mt-1">{summary.total_covers} covers total</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-[#E7E5E4] text-center">
            <div className="text-[11px] font-medium text-[#A8A29E] mb-1.5 tracking-wide">Total Covers</div>
            <div className="text-2xl font-bold tracking-tight text-[#9F1239]">{summary.total_covers}</div>
            {summary.previous_covers >= 3 && (
              <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}%
              </div>
            )}
          </div>
        </div>

        {/* Busiest Times — bar chart panel */}
        <div className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
            <span className="text-[15px] font-semibold tracking-tight">Busiest Times</span>
          </div>
          <div className="p-6 space-y-3">
            {busiest.times.map((time) => {
              const widthPct = Math.max((time.covers / maxTimeCovers) * 100, 5);
              return (
                <div key={time.time} className="flex items-center gap-3">
                  <div className="w-[50px] text-[13px] text-[#78716C] text-right flex-shrink-0">{time.time}</div>
                  <div className="flex-1 h-6 bg-[#F5F5F4] rounded-md overflow-hidden">
                    <div
                      className="h-full rounded-md flex items-center pl-2.5"
                      style={{ width: `${widthPct}%`, background: getBarColor(time.covers) }}
                    >
                      <span className="text-[11px] font-semibold" style={{ color: getBarTextColor(time.covers) }}>{time.covers}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Grid: Demographics + Preferences */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Guest Demographics */}
          <div className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
              <span className="text-[15px] font-semibold tracking-tight">Guest Demographics</span>
            </div>
            {demoRows.map((row) => (
              <div key={row.rank} className="flex items-center px-6 py-3.5 border-b border-[#F5F5F4] last:border-b-0 gap-3.5">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: `${row.color}12`, color: row.color }}
                >
                  {row.rank}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#1C1917]">{row.label}</div>
                  <div className="text-xs text-[#78716C]">{row.detail}</div>
                </div>
                <div className="text-base font-bold" style={{ color: row.rank <= 2 ? row.color : '#1C1917' }}>
                  {row.pct !== null ? `${row.pct}%` : row.count}
                </div>
              </div>
            ))}
          </div>

          {/* Top Guest Preferences */}
          <div className="bg-white rounded-2xl border border-[#E7E5E4] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
              <span className="text-[15px] font-semibold tracking-tight">Top Guest Preferences</span>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {allPreferencePills.map((pill) => (
                  <span
                    key={pill.label}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium border ${
                      pill.count >= topPillThreshold
                        ? 'bg-[rgba(159,18,57,0.06)] border-[rgba(159,18,57,0.15)] text-[#9F1239] font-semibold'
                        : 'bg-[#FAFAF9] border-[#E7E5E4] text-[#57534E]'
                    }`}
                  >
                    {pill.label} ({pill.count})
                  </span>
                ))}
                {allPreferencePills.length === 0 && (
                  <p className="text-sm text-[#A8A29E]">No preference data for this period</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
