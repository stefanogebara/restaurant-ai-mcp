import { useState, useEffect, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePermission } from '../hooks/usePermission';
import { useSubscription } from '../hooks/useSubscription';
import { hasFeatureAccess, type PlanType } from '../config/planFeatures';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { lazyRetry } from '../utils/lazyRetry';

// Lazy-load tab content so only the active tab is mounted
const OverviewTab = lazyRetry(() => import('./insights/OverviewTab'));
const AnalyticsTab = lazyRetry(() => import('./insights/AnalyticsTab'));
const ReportsTab = lazyRetry(() => import('./insights/ReportsTab'));

type TabId = 'overview' | 'analytics' | 'reports';

interface TabConfig {
  readonly id: TabId;
  readonly labelKey: string;
  readonly requiredFeature: 'overview' | 'advancedAnalytics' | 'weeklyReports';
}

const TABS: readonly TabConfig[] = [
  { id: 'overview', labelKey: 'insights.tabs.overview', requiredFeature: 'overview' },
  { id: 'analytics', labelKey: 'insights.tabs.analytics', requiredFeature: 'advancedAnalytics' },
  { id: 'reports', labelKey: 'insights.tabs.reports', requiredFeature: 'weeklyReports' },
] as const;

function TabSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div
        role="status"
        aria-label={t('common.loading', 'Loading')}
        className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy"
      />
    </div>
  );
}

function LockedTabCTA({ feature }: { feature: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] p-6">
      <div className="border border-[#E5E7EB] rounded-lg p-10 max-w-md text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <ThiingsIcon name="lock" pxSize={32} className="text-amber-600" />
        </div>
        <h3 className="text-xl font-bold text-deep-charcoal mb-2">
          {t('insights.lockedTitle', 'Upgrade to access')}
        </h3>
        <p className="text-sm text-stone-gray mb-6 leading-relaxed">
          {t(
            `insights.locked_${feature}`,
            'Upgrade your plan to unlock this section.'
          )}
        </p>
        <Link
          to="/subscription/manage"
          className="inline-flex items-center gap-2 px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
        >
          <ThiingsIcon name="lightning" size="xs" />
          {t('insights.upgradePlan')}
        </Link>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const { t } = useTranslation();
  const { can } = usePermission();
  const subscription = useSubscription();
  const planType = (subscription.data?.subscription?.plan?.toLowerCase() ?? 'free') as PlanType;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam && TABS.some((tab) => tab.id === tabParam) ? tabParam : 'overview'
  );

  useDocumentTitle(t('insights.pageTitle', 'Insights'));

  // Sync tab state with URL query param
  useEffect(() => {
    const urlTab = searchParams.get('tab') as TabId | null;
    if (urlTab && TABS.some((tab) => tab.id === urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    if (tabId === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: tabId }, { replace: true });
    }
  };

  // Role-based permission check (not plan-based)
  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="glass-panel rounded-lg p-10 max-w-md text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="star" pxSize={32} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-deep-charcoal mb-2">
              {t('insights.upgradeTitle')}
            </h3>
            <p className="text-sm text-stone-gray mb-6 leading-relaxed">
              {t('insights.upgradeDescription')}
            </p>
            <Link
              to="/subscription/manage"
              className="inline-flex items-center gap-2 px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
            >
              <ThiingsIcon name="lightning" size="xs" />
              {t('insights.upgradePlan')}
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 mt-14 sm:mt-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-burgundy/10 flex items-center justify-center">
              <ThiingsIcon name="star" pxSize={16} className="text-burgundy" />
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
              {t('insights.pageTitle', 'Insights')}
            </h1>
          </div>
          <p className="text-sm text-warm-stone ml-11">
            {t('insights.pageSubtitle', 'Your restaurant intelligence hub.')}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-glass-border-dark mb-8">
          <nav className="flex gap-0 -mb-px" aria-label={t('insights.tabsAriaLabel', 'Insights tabs')}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const hasAccess = hasFeatureAccess(planType, tab.requiredFeature);
              const isLocked = !subscription.isLoading && !hasAccess;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-selected={isActive}
                  aria-disabled={isLocked}
                  role="tab"
                  className={`
                    relative px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap
                    ${isActive
                      ? 'text-burgundy border-b-2 border-burgundy'
                      : isLocked
                        ? 'text-stone-400 cursor-default'
                        : 'text-stone-500 hover:text-deep-charcoal border-b-2 border-transparent'
                    }
                  `}
                >
                  <span className="flex items-center gap-1.5">
                    {t(tab.labelKey)}
                    {isLocked && <ThiingsIcon name="lock" pxSize={12} />}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {(() => {
          const currentTab = TABS.find((tab) => tab.id === activeTab);
          if (!currentTab) return null;

          const hasAccess = hasFeatureAccess(planType, currentTab.requiredFeature);
          const isLocked = !subscription.isLoading && !hasAccess;

          if (isLocked) {
            return <LockedTabCTA feature={currentTab.requiredFeature} />;
          }

          return (
            <Suspense fallback={<TabSpinner />}>
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'analytics' && <AnalyticsTab />}
              {activeTab === 'reports' && <ReportsTab />}
            </Suspense>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
