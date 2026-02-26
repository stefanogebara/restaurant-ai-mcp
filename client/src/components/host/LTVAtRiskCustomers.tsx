import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './ltvHelpers';
import type { Customer } from './ltvDashboard.types';

interface LTVAtRiskCustomersProps {
  atRiskCustomers: Customer[];
  highRiskCount: number;
  onOpenCampaignModal: (customer: Customer) => void;
}

export default function LTVAtRiskCustomers({ atRiskCustomers, highRiskCount, onOpenCampaignModal }: LTVAtRiskCustomersProps) {
  if (atRiskCustomers.length === 0) return null;

  return (
    <div className="p-4 bg-amber-600/10 rounded-xl border border-amber-600/20">
      <div className="flex items-center gap-2 mb-3">
        <ThiingsIcon name="alert-triangle" size="xs" />
        <h3 className="text-sm font-semibold text-deep-charcoal">High Churn Risk ({highRiskCount})</h3>
      </div>
      <div className="space-y-2">
        {atRiskCustomers.map((customer) => (
          <div key={customer.customer_id} className="flex items-center justify-between p-2 bg-white/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <ThiingsIcon name="trending-down" size="xs" />
                <span className="text-xs font-bold text-amber-600">{customer.churn_risk_score}%</span>
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">{customer.customer_id}</div>
                <div className="text-xs text-stone-gray flex items-center gap-1">
                  <ThiingsIcon name="calendar" pxSize={12} />
                  Last: {new Date(customer.last_visit_date).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-sm font-bold text-deep-charcoal">{formatCurrency(customer.lifetime_value)} LTV</div>
                <div className="text-xs text-stone-gray">{customer.total_visits} visits</div>
              </div>
              <button
                onClick={() => onOpenCampaignModal(customer)}
                aria-label="Send retention campaign"
                className="p-2 bg-amber-600/20 hover:bg-amber-600/30 rounded-xl transition-colors"
              >
                <ThiingsIcon name="mail" size="xs" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        className="w-full mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl transition-colors"
        onClick={() => atRiskCustomers[0] && onOpenCampaignModal(atRiskCustomers[0])}
      >
        Launch Retention Campaign
      </button>
    </div>
  );
}
