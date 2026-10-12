import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import CampaignList from '../components/campaigns/CampaignList';
import CampaignAutomationsPanel from '../components/campaigns/CampaignAutomationsPanel';

type Tab = 'manual' | 'automations';

export default function CampaignsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('manual');

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 mt-14 lg:mt-0 pt-6 lg:pt-12 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-5 mb-12">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-3">
              {t('campaigns.eyebrow')}
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal">
              {t('campaigns.title')}
            </h1>
            <p className="text-[15px] text-stone-gray mt-3 max-w-xl">
              {t('campaigns.intro')}
            </p>
          </div>
        </div>

        <div role="group" aria-label={t('campaigns.title')} className="inline-flex gap-1 p-1 mb-10 liquid-capsule">
          <button
            type="button"
            aria-pressed={activeTab === 'manual'}
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'manual'
                ? 'bg-deep-charcoal text-white'
                : 'text-stone-gray hover:text-deep-charcoal'
            }`}
          >
            {t('campaigns.tabManual')}
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'automations'}
            onClick={() => setActiveTab('automations')}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'automations'
                ? 'bg-deep-charcoal text-white'
                : 'text-stone-gray hover:text-deep-charcoal'
            }`}
          >
            {t('campaigns.tabAutomations')}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'manual' && (
          <div>
            <p className="text-sm text-stone-gray mb-10 max-w-2xl">
              {t('campaigns.manualUnavailable')}
            </p>
            <CampaignList />
          </div>
        )}

        {activeTab === 'automations' && (
          <div><CampaignAutomationsPanel /></div>
        )}
      </div>
    </DashboardLayout>
  );
}
