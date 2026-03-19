/**
 * Weekly Report Page for Segovia Basic Plan
 *
 * Orchestrator — manages data fetching and delegates rendering
 * to focused subcomponents in components/dashboard/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { SkeletonWeeklyReport } from '../components/common/Skeleton';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useSubscription } from '../hooks/useSubscription';
import { useWeeklyReport } from '../hooks/useWeeklyReport';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';
import WeeklyReportHeader from '../components/dashboard/WeeklyReportHeader';
import WeeklyReportSummaryCards from '../components/dashboard/WeeklyReportSummaryCards';
import WeeklyBusiestTimesChart from '../components/dashboard/WeeklyBusiestTimesChart';
import WeeklyDemographicsPanel from '../components/dashboard/WeeklyDemographicsPanel';
import WeeklyPreferencesPanel from '../components/dashboard/WeeklyPreferencesPanel';

export default function WeeklyReport() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.reports'));
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || undefined;
  const hasAccess = currentPlan ? hasFeatureAccess(currentPlan, 'weeklyReports') : false;

  const [startDate, setStartDate] = useState(weekAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const { data: report, isLoading, refetch } = useWeeklyReport(startDate, endDate);

  const handlePrevious = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const newStart = new Date(newEnd.getTime() - diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const newStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const newEnd = new Date(newStart.getTime() + diffMs);
    setStartDate(newStart.toISOString().split('T')[0]);
    setEndDate(newEnd.toISOString().split('T')[0]);
  };

  const [shareToast, setShareToast] = useState<string | null>(null);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t('analytics.weeklyReports')} ${startDate} – ${endDate}`, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(t('common.copiedToClipboard', 'Link copied!'));
      setTimeout(() => setShareToast(null), 2000);
    } catch {
      setShareToast(t('common.shareFailed', 'Could not copy link'));
      setTimeout(() => setShareToast(null), 2000);
    }
  };

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="border border-[#E5E7EB] rounded-lg p-12 max-w-lg text-center">
              <ThiingsIcon name="lock" pxSize={32} className="mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-deep-charcoal mb-3">{t('analytics.weeklyReports')}</h2>
              <p className="text-stone-gray mb-6">{t('analytics.weeklyReportsDesc')}</p>
              <div className="flex items-center justify-center gap-2 text-sm text-burgundy font-medium mb-6">
                <ThiingsIcon name="crown" size="xs" />
                {t('analytics.professionalPlanFeature')}
              </div>
              <Link to="/welcome" className="inline-flex items-center gap-2 px-6 py-3 bg-burgundy text-white rounded-full hover:bg-burgundy-dark transition-colors font-medium">
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
        <div className="min-h-screen bg-white p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <SkeletonWeeklyReport />
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
              <ThiingsIcon name="bar-chart" pxSize={28} />
            </div>
            <p className="font-semibold text-deep-charcoal">{t('analytics.noReportData')}</p>
            <p className="text-sm text-stone-gray mt-1">{t('analytics.selectDateRange')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-12">
          <WeeklyReportHeader
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onApply={() => refetch()}
            onPrint={() => window.print()}
            onShare={handleShare}
          />
          <WeeklyReportSummaryCards summary={report.summary} />
          <WeeklyBusiestTimesChart times={report.busiest.times} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeeklyDemographicsPanel demographics={report.demographics} />
            <WeeklyPreferencesPanel preferences={report.preferences} />
          </div>
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-deep-charcoal text-white text-sm rounded-xl shadow-lg">
          {shareToast}
        </div>
      )}
    </DashboardLayout>
  );
}
