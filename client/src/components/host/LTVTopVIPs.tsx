import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './ltvHelpers';
import type { Customer } from './ltvDashboard.types';

interface LTVTopVIPsProps {
  topVIPs: Customer[];
}

export default function LTVTopVIPs({ topVIPs }: LTVTopVIPsProps) {
  if (topVIPs.length === 0) return null;

  return (
    <div className="p-4 bg-violet-600/10 rounded-xl border border-violet-600/20">
      <div className="flex items-center gap-2 mb-3">
        <ThiingsIcon name="star" size="xs" />
        <h3 className="text-sm font-semibold text-deep-charcoal">Top VIP Customers</h3>
      </div>
      <div className="space-y-2">
        {topVIPs.map((customer, index) => (
          <div key={customer.customer_id} className="flex items-center justify-between p-2 bg-white/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-violet-600/20 flex items-center justify-center">
                <span className="text-xs font-bold text-violet-600">#{index + 1}</span>
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">{customer.customer_id}</div>
                <div className="text-xs text-stone-gray">{customer.total_visits} visits</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-violet-600">{formatCurrency(customer.lifetime_value)}</div>
              <div className="text-xs text-stone-gray">{formatCurrency(customer.total_revenue)} spent</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
