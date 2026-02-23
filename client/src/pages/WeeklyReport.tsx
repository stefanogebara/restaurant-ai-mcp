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
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { SkeletonWeeklyReport } from '../components/common/Skeleton';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import { authFetch } from '../services/api';
import { colors } from '../utils/colors';
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
  const { t } = useTranslation();
  const { can } = usePermission();
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

  const handlePrevious = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const newStart = new Date(newEnd.getTime() - diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
    fetchReport(newStart, newEnd);
  };

  const handleNext = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
    fetchReport(newStart, newEnd);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!can('viewAnalytics')) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-stone-gray text-sm">You don't have permission to view reports.</p>
      </div>
    );
  }

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
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
        <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="bg-white rounded-2xl border border-border-gray p-12 max-w-lg text-center">
              <ThiingsIcon name="lock" pxSize={32} className="mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-deep-charcoal mb-3">{t('analytics.weeklyReports')}</h2>
              <p className="text-stone-gray mb-6">
                {t('analytics.weeklyReportsDesc')}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-burgundy font-medium mb-6">
                <ThiingsIcon name="crown" size="xs" />
                {t('analytics.professionalPlanFeature')}
              </div>
              <Link
                to="/welcome"
                className="inline-flex items-center gap-2 px-6 py-3 bg-burgundy text-white rounded-full hover:bg-burgundy-dark transition-colors font-medium"
              >
                {t('analytics.upgradePlan')}
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
        <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <SkeletonWeeklyReport />
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-warm-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-deep-charcoal">No data available</p>
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
    if (ratio > 0.85) return colors.burgundy;
    if (ratio > 0.6) return colors.stoneGray;
    if (ratio > 0.35) return colors.mutedStone;
    return '#D6D3D1';
  };
  const getBarTextColor = (covers: number) => {
    const ratio = covers / maxTimeCovers;
    return ratio > 0.35 ? '#fff' : colors.warmStone;
  };

  // Demographics ranked rows
  const demoRows = [
    { rank: 1, label: 'Tourists', detail: `${demographics.tourist_count} visitors`, pct: demographics.tourist_percentage, color: colors.burgundy },
    { rank: 2, label: 'Locals', detail: `${demographics.local_count} residents`, pct: demographics.tourist_count + demographics.local_count > 0 ? Math.round((demographics.local_count / (demographics.tourist_count + demographics.local_count)) * 100) : 0, color: colors.deepCharcoal },
    { rank: 3, label: 'First-Time', detail: `${demographics.first_time_visitors} new customers`, pct: null, count: demographics.first_time_visitors, color: '#3b82f6' },
    { rank: 4, label: 'Repeat', detail: `${demographics.repeat_customers} returning`, pct: null, count: demographics.repeat_customers, color: '#7c3aed' },
  ];

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
          <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
            Reports <span className="font-light text-warm-stone">/ Weekly</span>
          </h1>
          <div className="flex items-center gap-2.5 print:hidden">
            <div className="flex items-center gap-1.5 px-2 py-2 bg-white border border-stone-300 rounded-[10px] text-[13px] font-medium text-stone-gray">
              <button
                onClick={handlePrevious}
                className="px-2 py-0.5 text-stone-gray hover:text-deep-charcoal transition-colors"
                title="Previous period"
              >
                ←
              </button>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-[13px] text-stone-gray w-[110px] cursor-pointer"
              />
              <span className="text-muted-stone">&ndash;</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 text-[13px] text-stone-gray w-[110px] cursor-pointer"
              />
              <button onClick={handleDateChange} className="ml-1 text-burgundy font-semibold text-xs">{t('common.apply')}</button>
              <button
                onClick={handleNext}
                className="px-2 py-0.5 text-stone-gray hover:text-deep-charcoal transition-colors"
                title="Next period"
              >
                →
              </button>
            </div>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-stone-300 text-stone-gray hover:border-muted-stone rounded-[10px] text-[13px] font-medium transition-colors"
            >
              {t('analytics.downloadPdf')}
            </button>
            <button
              onClick={() => fetchReport()}
              className="px-4 py-2 bg-burgundy text-white hover:bg-burgundy-dark rounded-[10px] text-[13px] font-medium transition-colors"
            >
              {t('analytics.shareReport')}
            </button>
          </div>
        </div>

        {/* Summary Metrics — 5 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-border-gray text-center">
            <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.totalReservations')}</div>
            <div className="text-2xl font-bold tracking-tight">{summary.total_reservations}</div>
            {summary.previous_covers >= 3 && (
              <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}% vs prev week
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-border-gray text-center">
            <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.walkIns')}</div>
            <div className="text-2xl font-bold tracking-tight">{summary.walk_in_count}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-border-gray text-center">
            <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.cancellations')}</div>
            <div className="text-2xl font-bold tracking-tight text-red-600">{summary.cancelled_count}</div>
            <div className="text-[11px] font-medium text-warm-stone mt-1">{summary.cancellation_rate}% rate</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-border-gray text-center">
            <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.avgPartySize')}</div>
            <div className="text-2xl font-bold tracking-tight">{summary.avg_party_size}</div>
            <div className="text-[11px] font-medium text-warm-stone mt-1">{summary.total_covers} covers total</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-border-gray text-center">
            <div className="text-[11px] font-medium text-muted-stone mb-1.5 tracking-wide">{t('analytics.totalCovers')}</div>
            <div className="text-2xl font-bold tracking-tight text-burgundy">{summary.total_covers}</div>
            {summary.previous_covers >= 3 && (
              <div className={`text-[11px] font-medium mt-1 ${summary.covers_change_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.covers_change_percent >= 0 ? '+' : ''}{summary.covers_change_percent}%
              </div>
            )}
          </div>
        </div>

        {/* Busiest Times — bar chart panel */}
        <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
            <span className="text-[15px] font-semibold tracking-tight">{t('analytics.busiestTimes')}</span>
          </div>
          <div className="p-6 space-y-3">
            {busiest.times.map((time) => {
              const widthPct = Math.max((time.covers / maxTimeCovers) * 100, 5);
              return (
                <div key={time.time} className="flex items-center gap-3">
                  <div className="w-[50px] text-[13px] text-warm-stone text-right flex-shrink-0">{time.time}</div>
                  <div className="flex-1 h-6 bg-soft-gray rounded-md overflow-hidden">
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
          <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
              <span className="text-[15px] font-semibold tracking-tight">{t('analytics.guestDemographics')}</span>
            </div>
            {demoRows.map((row) => (
              <div key={row.rank} className="flex items-center px-6 py-3.5 border-b border-soft-gray last:border-b-0 gap-3.5">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: `${row.color}12`, color: row.color }}
                >
                  {row.rank}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-deep-charcoal">{row.label}</div>
                  <div className="text-xs text-warm-stone">{row.detail}</div>
                </div>
                <div className="text-base font-bold" style={{ color: row.rank <= 2 ? row.color : colors.deepCharcoal }}>
                  {row.pct !== null ? `${row.pct}%` : row.count}
                </div>
              </div>
            ))}
          </div>

          {/* Top Guest Preferences */}
          <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
              <span className="text-[15px] font-semibold tracking-tight">{t('analytics.topGuestPreferences')}</span>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {allPreferencePills.map((pill) => (
                  <span
                    key={pill.label}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium border ${
                      pill.count >= topPillThreshold
                        ? 'bg-[rgba(159,18,57,0.06)] border-[rgba(159,18,57,0.15)] text-burgundy font-semibold'
                        : 'bg-warm-white border-border-gray text-stone-gray'
                    }`}
                  >
                    {pill.label} ({pill.count})
                  </span>
                ))}
                {allPreferencePills.length === 0 && (
                  <p className="text-sm text-muted-stone">{t('analytics.noPreferenceData')}</p>
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
