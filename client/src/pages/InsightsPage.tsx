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
      <div className="max-w-md text-center">
        <ThiingsIcon name="lock" pxSize={28} className="text-amber-700 mx-auto mb-4" />
        <h3 className="font-serif text-[28px] text-deep-charcoal mb-2">
          {t('insights.lockedTitle', 'Upgrade to access')}
        </h3>
        <p className="text-[15px] text-muted-stone mb-6 leading-relaxed">
          {t(
            `insights.locked_${feature}`,
            'Upgrade your plan to unlock this section.'
          )}
        </p>
        <Link
          to="/subscription/manage"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-medium rounded-[100px] transition-colors text-sm"
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

  useEffect(() => {
    const urlTab = searchParams.get('tab') as TabId | null;
    const nextTab = urlTab && TABS.some((tab) => tab.id === urlTab) ? urlTab : 'overview';
    setActiveTab((current) => current === nextTab ? current : nextTab);
  }, [searchParams]);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    if (tabId === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: tabId }, { replace: true });
    }
  };
  const heroInsights = activeTab === 'analytics' || activeTab === 'overview';

  // Role-based permission check (not plan-based)
  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="max-w-md text-center">
            <ThiingsIcon name="star" pxSize={28} className="text-amber-700 mx-auto mb-4" />
            <h3 className="font-serif text-[28px] text-deep-charcoal mb-2">
              {t('insights.upgradeTitle')}
            </h3>
            <p className="text-[15px] text-muted-stone mb-6 leading-relaxed">
              {t('insights.upgradeDescription')}
            </p>
            <Link
              to="/subscription/manage"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-medium rounded-[100px] transition-colors text-sm"
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
    <DashboardLayout appearance={heroInsights ? 'hero' : 'default'}>
      <div className={heroInsights ? 'min-h-screen bg-brand-paper font-brand text-brand-ink' : 'min-h-screen bg-warm-white'}>
      <div className={`mx-auto px-4 sm:px-6 ${heroInsights ? 'max-w-[1240px] py-4 sm:py-5 lg:px-10' : 'max-w-7xl py-6'}`}>
        {/* Header */}
        <header className={`pl-12 lg:pl-0 ${heroInsights ? 'mb-2 sm:mb-3' : 'mb-1'}`}>
          <h1 className={heroInsights ? 'font-brand text-[29px] font-normal leading-[1.05] tracking-[-0.055em] text-brand-ink sm:text-[40px]' : 'font-serif text-4xl sm:text-5xl text-deep-charcoal tracking-tight'}>
            {heroInsights ? <>{activeTab === 'analytics' ? t('insights.tabs.analytics', 'Analytics') : t('insights.pageTitle', 'Insights')}{' '}<em className="ml-1.5 font-serif font-normal italic tracking-[-0.04em] sm:ml-3">{t('insights.houseSuffix', 'of the house.')}</em></> : t('insights.pageTitle', 'Insights')}
          </h1>
        </header>

        {/* Tabs */}
        <div className={heroInsights ? 'mb-4 overflow-x-auto border-b border-brand-line sm:mb-5' : 'border-b hairline mb-4 overflow-x-auto'}>
          <nav className="flex min-w-max gap-0 -mb-px" role="tablist" aria-label={t('insights.tabsAriaLabel', 'Insights tabs')}>
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
                    relative px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2
                    ${heroInsights
                      ? isActive ? 'text-brand-ink border-brand-action' : isLocked ? 'text-brand-muted/50 cursor-default border-transparent' : 'text-brand-muted hover:text-brand-ink border-transparent'
                      : isActive
                        ? 'text-deep-charcoal border-deep-charcoal'
                        : isLocked
                          ? 'text-muted-stone/50 cursor-default border-transparent'
                          : 'text-muted-stone hover:text-deep-charcoal border-transparent'
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
      </div>
    </DashboardLayout>
  );
}
