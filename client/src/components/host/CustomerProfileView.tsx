/**
 * Individual Customer Profile View
 *
 * Orchestrator — manages data fetching and delegates rendering
 * to focused subcomponents in components/host/.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import { useCustomerProfile, useAnalyzeCustomer } from '../../hooks/useCustomerDNA';
import CustomerProfileHeader from './CustomerProfileHeader';
import CustomerProfileMetrics from './CustomerProfileMetrics';
import CustomerBehavioralProfile from './CustomerBehavioralProfile';
import CustomerAIInsights from './CustomerAIInsights';
import CustomerVisitHistory from './CustomerVisitHistory';
import CustomerPredictions from './CustomerPredictions';
import CustomerRevenueSummary from './CustomerRevenueSummary';

export default function CustomerProfileView() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [showAllReservations, setShowAllReservations] = useState(false);

  const { data, isLoading, isError, error } = useCustomerProfile(customerId);
  const analyze = useAnalyzeCustomer();

  const handleAnalyze = () => {
    if (!customerId) return;
    analyze.mutate(customerId);
  };

  if (isLoading || analyze.isPending) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/host-dashboard/dna')} className="flex items-center gap-2 text-stone-gray hover:text-deep-charcoal transition-colors">
          <ThiingsIcon name="arrow-left" size="xs" /> Back to DNA Dashboard
        </button>
        <div className="bg-white rounded-2xl border border-border-gray p-8 text-center">
          <ThiingsIcon name="alert-circle" pxSize={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-deep-charcoal mb-2">
            {error instanceof Error ? error.message : 'Profile not found'}
          </h3>
          <p className="text-sm text-stone-gray mb-4">This customer may not have been analyzed yet.</p>
          <button type="button" onClick={handleAnalyze} className="px-4 py-2 bg-burgundy text-white rounded-xl hover:bg-burgundy-dark transition-colors">
            Analyze Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate('/host-dashboard/dna')} className="flex items-center gap-2 text-stone-gray hover:text-deep-charcoal transition-colors">
        <ThiingsIcon name="arrow-left" size="xs" /> Back to DNA Dashboard
      </button>

      <CustomerProfileHeader data={data} />
      <CustomerProfileMetrics profile={data.profile} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CustomerBehavioralProfile profile={data.profile} textSignals={data.text_signals} />
        <CustomerAIInsights textSignals={data.text_signals} onAnalyze={handleAnalyze} />
      </div>

      <CustomerVisitHistory
        reservations={data.reservations}
        showAll={showAllReservations}
        onToggle={() => setShowAllReservations(v => !v)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CustomerPredictions predictions={data.predictions} occasions={data.occasions} />
        <CustomerRevenueSummary revenueSummary={data.revenue_summary} profile={data.profile} />
      </div>

      <div className="flex justify-center">
        <button
          onClick={handleAnalyze}
          className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="brain" pxSize={20} />
          Re-analyze Customer DNA
        </button>
      </div>
    </div>
  );
}
