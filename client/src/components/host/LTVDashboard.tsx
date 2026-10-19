/**
 * Customer Lifetime Value (LTV) Dashboard
 *
 * Orchestrator — manages data fetching and delegates rendering
 * to focused subcomponents in components/host/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import { RetentionCampaignModal } from './RetentionCampaignModal';
import type { Customer } from './ltvDashboard.types';
import LTVKeyMetrics from './LTVKeyMetrics';
import LTVTierBreakdown from './LTVTierBreakdown';
import LTVTopVIPs from './LTVTopVIPs';
import LTVAtRiskCustomers from './LTVAtRiskCustomers';
import { useLTVStats, useLTVTopVIPs, useLTVAtRisk, useRecalculateLTV, useSendCampaign } from '../../hooks/useLTVData';
import { useRestaurantCurrency } from '../../hooks/useRestaurantCurrency';

export default function LTVDashboard() {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const currency = useRestaurantCurrency();
  const statsQuery = useLTVStats();
  const vipsQuery = useLTVTopVIPs();
  const atRiskQuery = useLTVAtRisk();
  const recalculate = useRecalculateLTV();
  const sendCampaignMutation = useSendCampaign();

  const stats = statsQuery.data ?? null;
  const topVIPs = vipsQuery.data ?? [];
  const atRiskCustomers = atRiskQuery.data ?? [];
  const isLoading = statsQuery.isLoading;

  const [selectedCustomerForCampaign, setSelectedCustomerForCampaign] = useState<Customer | null>(null);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  const handleSendCampaign = async (customerId: string, campaignType: string, message: string, language: string) => {
    await sendCampaignMutation.mutateAsync({ customerId, campaignType, message, language });
  };

  const openCampaignModal = (customer: Customer) => {
    setSelectedCustomerForCampaign(customer);
    setCampaignModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="py-12">
        <div className="flex flex-col items-center justify-center py-8">
          <Spinner size="lg" className="mb-4" />
          <p className="text-stone-gray font-semibold">{t('common.loadingAnalytics')}</p>
        </div>
      </div>
    );
  }

  if (statsQuery.isError) {
    return (
      <div role="alert" className="py-12 space-y-3">
        <h2 className="font-serif text-2xl text-deep-charcoal">{t('ltv.errorTitle')}</h2>
        <p className="text-sm text-muted-stone">{t('ltv.errorBody')}</p>
        <button type="button" onClick={() => statsQuery.refetch()} className="rounded-full bg-deep-charcoal px-5 py-2 text-sm text-white">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!stats || stats.total_customers === 0) {
    return (
      <div className="py-12">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-soft-gray flex items-center justify-center">
            <ThiingsIcon name="users" pxSize={24} />
          </div>
          <div>
            <h3 className="font-serif text-2xl text-deep-charcoal">{t('ltv.emptyTitle')}</h3>
            <p className="text-sm text-stone-gray">{t('ltv.emptyBody')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <LTVKeyMetrics stats={stats} currency={currency} />
      <LTVTierBreakdown tiers={stats.tiers} />
      <LTVTopVIPs topVIPs={topVIPs} currency={currency} />
      <LTVAtRiskCustomers
        atRiskCustomers={atRiskCustomers}
        highRiskCount={stats.high_risk_customers}
        currency={currency}
        onOpenCampaignModal={openCampaignModal}
      />
      {/* This database maintenance job stays out of the daily service flow. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-stone hover:text-deep-charcoal underline underline-offset-2 select-none">
          {t('ltv.maintenance.toggle', 'Maintenance')}
        </summary>
        <div className="mt-3 max-w-xl space-y-2">
          <p className="text-xs text-warm-stone">{t('ltv.maintenance.recalcHint')}</p>
          <button
            type="button"
            className="w-full px-3 py-2 bg-soft-gray hover:bg-border-gray border border-glass-border-dark text-xs font-medium text-deep-charcoal rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={recalculate.isPending}
            onClick={() => recalculate.mutate(undefined, {
              onSuccess: (result) => success(t('ltv.maintenance.recalcDone', { count: result.total_customers })),
              onError: () => error(t('ltv.maintenance.recalcFailed')),
            })}
          >
            {recalculate.isPending ? <Spinner size="sm" /> : <ThiingsIcon name="activity" size="sm" />}
            {recalculate.isPending ? t('ltv.maintenance.recalcRunning') : t('ltv.maintenance.recalcButton')}
          </button>
        </div>
      </details>
      <RetentionCampaignModal
        isOpen={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        customer={selectedCustomerForCampaign}
        onSendCampaign={handleSendCampaign}
      />
    </div>
  );
}
