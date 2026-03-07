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

export default function AIInsights() {
  const { t } = useTranslation();
  const { can } = usePermission();

  if (!can('viewAnalytics')) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white border border-border-gray rounded-2xl p-10 max-w-md text-center shadow-sm">
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
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 mt-14 sm:mt-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-xl bg-burgundy/10 flex items-center justify-center">
              <ThiingsIcon name="star" pxSize={16} className="text-burgundy" />
            </div>
            <h1 className="text-2xl font-serif font-medium text-deep-charcoal tracking-tight">
              {t('insights.title')}
            </h1>
          </div>
          <p className="text-sm text-warm-stone ml-11">
            {t('insights.subtitle')}
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TonightBriefingCard />
          <CustomerIntelligenceCard />
          <RevenueQuickWinsCard />
          <WeeklyForecastCard />
        </div>

        {/* WhatsApp Campaigns */}
        <div className="mt-6">
          <CampaignManager />
        </div>
      </div>
    </DashboardLayout>
  );
}
