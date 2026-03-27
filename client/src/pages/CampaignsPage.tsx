import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignBuilder from '../components/campaigns/CampaignBuilder';
import CampaignList from '../components/campaigns/CampaignList';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function CampaignsPage() {
  const { t } = useTranslation();
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-deep-charcoal">
            {t('campaigns.title')}
          </h1>
          {!showBuilder && (
            <button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-full text-sm transition-colors"
            >
              <ThiingsIcon name="plus" size="xs" />
              {t('campaigns.newCampaign')}
            </button>
          )}
        </div>

        {/* Builder (collapsible) */}
        {showBuilder && (
          <div className="mb-6">
            <CampaignBuilder
              onCreated={() => setShowBuilder(false)}
              onCancel={() => setShowBuilder(false)}
            />
          </div>
        )}

        {/* Campaign list */}
        <CampaignList />
      </div>
    </DashboardLayout>
  );
}
