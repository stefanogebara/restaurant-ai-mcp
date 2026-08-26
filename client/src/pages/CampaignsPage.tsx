import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignBuilder from '../components/campaigns/CampaignBuilder';
import CampaignList from '../components/campaigns/CampaignList';
import CampaignAutomationsPanel from '../components/campaigns/CampaignAutomationsPanel';
import ThiingsIcon from '../components/common/ThiingsIcon';

type Tab = 'manual' | 'automations';

export default function CampaignsPage() {
  const { t } = useTranslation();
  const [showBuilder, setShowBuilder] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('manual');

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-deep-charcoal">
            {t('campaigns.title')}
          </h1>
          {activeTab === 'manual' && !showBuilder && (
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

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-stone-200">
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-burgundy text-burgundy'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('campaigns.tabManual')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('automations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'automations'
                ? 'border-burgundy text-burgundy'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('campaigns.tabAutomations')}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'manual' && (
          <>
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
          </>
        )}

        {activeTab === 'automations' && (
          <CampaignAutomationsPanel />
        )}
      </div>
    </DashboardLayout>
  );
}
