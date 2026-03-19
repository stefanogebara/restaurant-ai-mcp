import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { usePermission } from '../hooks/usePermission';
import TonightBriefingCard from '../components/insights/TonightBriefingCard';
import CustomerIntelligenceCard from '../components/insights/CustomerIntelligenceCard';
import RevenueQuickWinsCard from '../components/insights/RevenueQuickWinsCard';
import WeeklyForecastCard from '../components/insights/WeeklyForecastCard';
import CampaignManager from '../components/dashboard/CampaignManager';
import StrategyMetricsWidget from '../components/dashboard/StrategyMetricsWidget';

export default function AIInsights() {
  const { t } = useTranslation();
  const { can } = usePermission();

  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="border border-[#E5E7EB] rounded-lg p-10 max-w-md text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <ThiingsIcon name="star" pxSize={32} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-deep-charcoal mb-2">{t('insights.upgradeTitle')}</h3>
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
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 bg-white">
        {/* Header */}
        <div className="mb-8 mt-14 sm:mt-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-burgundy/10 flex items-center justify-center">
              <ThiingsIcon name="star" pxSize={16} className="text-burgundy" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] tracking-tight">
              {t('insights.title')}
            </h1>
          </div>
          <p className="text-sm text-warm-stone ml-11">
            {t('insights.subtitle')}
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <TonightBriefingCard />
          <CustomerIntelligenceCard />
          <RevenueQuickWinsCard />
          <WeeklyForecastCard />
        </div>

        {/* Strategy Scorecard — val_bpb for the autoresearch loop */}
        <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
        <div className="mt-6">
          <StrategyMetricsWidget />
          <div className="mt-2 flex justify-end">
            <Link
              to="/host-dashboard/voice-settings"
              className="text-xs text-muted-stone hover:text-burgundy transition-colors"
            >
              {t('insights.editStrategy', 'Edit AI strategy document')} →
            </Link>
          </div>
        </div>

        {/* WhatsApp Campaigns */}
        <div className="border-t border-[#E5E7EB] mt-8 mb-8" />
        <div className="mt-6">
          <CampaignManager />
        </div>
      </div>
    </DashboardLayout>
  );
}
