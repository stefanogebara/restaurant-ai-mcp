/**
 * Customer Lifetime Value (LTV) Dashboard
 *
 * Orchestrator — manages data fetching and delegates rendering
 * to focused subcomponents in components/host/.
 */

import { useState } from 'react';
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

export default function LTVDashboard() {
  const { success, error } = useToast();
  const statsQuery = useLTVStats();
  const vipsQuery = useLTVTopVIPs();
  const atRiskQuery = useLTVAtRisk();
  const recalculate = useRecalculateLTV();
  const sendCampaignMutation = useSendCampaign();

  const stats = statsQuery.data ?? null;
  const topVIPs = vipsQuery.data ?? [];
  const atRiskCustomers = atRiskQuery.data ?? [];
  const isLoading = statsQuery.isLoading;

  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCustomerForCampaign, setSelectedCustomerForCampaign] = useState<Customer | null>(null);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  const handleSendCampaign = async (customerId: string, campaignType: string, message: string) => {
    await sendCampaignMutation.mutateAsync({ customerId, campaignType, message });
  };

  const openCampaignModal = (customer: Customer) => {
    setSelectedCustomerForCampaign(customer);
    setCampaignModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-border-gray">
        <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2 mb-4">
          <ThiingsIcon name="users" size="sm" />
          Customer Lifetime Value
        </h2>
        <div className="flex flex-col items-center justify-center py-8">
          <Spinner size="lg" className="mb-4" />
          <p className="text-stone-gray font-semibold">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!stats || stats.total_customers === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-border-gray">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-soft-gray flex items-center justify-center">
            <ThiingsIcon name="users" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-deep-charcoal">No Customer Data Yet</h3>
            <p className="text-sm text-stone-gray">LTV metrics will appear as customers visit</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-border-gray">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full p-6 flex items-center justify-between hover:bg-soft-gray/50 transition-colors rounded-t-2xl"
      >
        <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="users" size="sm" />
          Customer Lifetime Value
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" size="sm" />
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          <LTVKeyMetrics stats={stats} />
          <LTVTierBreakdown tiers={stats.tiers} />
          <LTVTopVIPs topVIPs={topVIPs} />
          <LTVAtRiskCustomers
            atRiskCustomers={atRiskCustomers}
            highRiskCount={stats.high_risk_customers}
            onOpenCampaignModal={openCampaignModal}
          />
          <button
            className="w-full px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-burgundy/30 flex items-center justify-center gap-2"
            onClick={() => recalculate.mutate(undefined, {
              onSuccess: (result) => success(`Calculated LTV for ${result.total_customers} customers`),
              onError: () => error('Failed to calculate LTV for all customers'),
            })}
          >
            <ThiingsIcon name="activity" size="sm" />
            Recalculate All Customer LTV
          </button>
        </div>
      )}

      <RetentionCampaignModal
        isOpen={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        customer={selectedCustomerForCampaign}
        onSendCampaign={handleSendCampaign}
      />
    </div>
  );
}
