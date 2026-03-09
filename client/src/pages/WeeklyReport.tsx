/**
 * Weekly Report Page for Segovia Basic Plan
 *
 * Orchestrator — manages data fetching and delegates rendering
 * to focused subcomponents in components/dashboard/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../hooks/usePermission';
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

const today = new Date();
const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

export default function WeeklyReport() {
  const { t } = useTranslation();
  const { can } = usePermission();
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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Weekly Report ${startDate} – ${endDate}`, url });
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // clipboard not available — silent fail
      }
    }
  };

  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-10 max-w-md text-center shadow-sm">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="file-text" pxSize={32} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-deep-charcoal mb-2">{t('analytics.weeklyReportsUpgradeTitle')}</h3>
            <p className="text-sm text-stone-gray mb-6 leading-relaxed">
              {t('analytics.weeklyReportsUpgradeDesc')}
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

  if (subscription.isLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
          <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>
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
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
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
    </DashboardLayout>
  );
}
