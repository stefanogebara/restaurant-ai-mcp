import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TonightBriefingCard from '../../components/insights/TonightBriefingCard';
import CustomerIntelligenceCard from '../../components/insights/CustomerIntelligenceCard';
import WeeklyForecastCard from '../../components/insights/WeeklyForecastCard';
import CampaignManager from '../../components/dashboard/CampaignManager';
import StrategyMetricsWidget from '../../components/dashboard/StrategyMetricsWidget';

export default function OverviewTab() {
  const { t } = useTranslation();

  return (
    <>
      {/* 2x2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <TonightBriefingCard />
        <CustomerIntelligenceCard />
        <WeeklyForecastCard />
      </div>

      {/* Strategy Scorecard */}
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
    </>
  );
}
