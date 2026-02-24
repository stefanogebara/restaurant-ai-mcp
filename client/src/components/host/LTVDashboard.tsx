/**
 * Customer Lifetime Value (LTV) Dashboard
 *
 * Displays customer segmentation, top VIPs, churn risks, and LTV metrics
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import HelpTooltip from '../common/HelpTooltip';
import { api } from '../../services/api';
import { RetentionCampaignModal } from './RetentionCampaignModal';

interface Customer {
  customer_id: string;
  total_visits: number;
  total_revenue: number;
  avg_revenue_per_visit: number;
  customer_tier: 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk';
  lifetime_value: number;
  churn_risk_score: number;
  last_visit_date: string;
  predicted_next_visit_date: string | null;
  favorite_time_slot: string | null;
  favorite_day: string | null;
}

interface LTVStats {
  total_customers: number;
  total_ltv: number;
  avg_ltv: number;
  tiers: {
    vip: number;
    regular: number;
    occasional: number;
    new: number;
    at_risk: number;
  };
  high_risk_customers: number;
}

export default function LTVDashboard() {
  const { success, error } = useToast();
  const [stats, setStats] = useState<LTVStats | null>(null);
  const [topVIPs, setTopVIPs] = useState<Customer[]>([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCustomerForCampaign, setSelectedCustomerForCampaign] = useState<Customer | null>(null);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  useEffect(() => {
    fetchLTVData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchLTVData, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchLTVData = async () => {
    try {
      // Fetch statistics (using api instance which includes auth token)
      const statsResponse = await api.get('/ltv?action=stats');
      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }

      // Fetch top VIPs
      const vipsResponse = await api.get('/ltv?action=list&tier=vip&limit=5');
      if (vipsResponse.data.success) {
        setTopVIPs(vipsResponse.data.data.customers || []);
      }

      // Fetch all customers and filter high churn risk
      const customersResponse = await api.get('/ltv?action=list&limit=100');
      if (customersResponse.data.success) {
        const highRisk = customersResponse.data.data.customers
          .filter((c: Customer) => c.churn_risk_score > 70)
          .sort((a: Customer, b: Customer) => b.churn_risk_score - a.churn_risk_score)
          .slice(0, 5);
        setAtRiskCustomers(highRisk);
      }

    } catch (error) {
      console.error('Error fetching LTV data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCampaign = async (customerId: string, campaignType: string, message: string) => {
    try {
      const response = await api.post('/retention-campaigns?action=create', {
        customer_id: customerId,
        campaign_type: campaignType,
        message: message,
        channel: 'email'
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create campaign');
      }

    } catch (error) {
      console.error('Failed to send campaign:', error);
      throw error;
    }
  };

  const openCampaignModal = (customer: Customer) => {
    setSelectedCustomerForCampaign(customer);
    setCampaignModalOpen(true);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'vip': return 'text-violet-600';
      case 'regular': return 'text-burgundy';
      case 'occasional': return 'text-green-600';
      case 'new': return 'text-stone-gray';
      case 'at_risk': return 'text-amber-600';
      default: return 'text-stone-gray';
    }
  };

  const getTierBgColor = (tier: string) => {
    switch (tier) {
      case 'vip': return 'bg-violet-600/10 border-violet-600/30';
      case 'regular': return 'bg-burgundy/10 border-burgundy/30';
      case 'occasional': return 'bg-green-600/10 border-green-600/30';
      case 'new': return 'bg-stone-gray/10 border-stone-gray/30';
      case 'at_risk': return 'bg-amber-600/10 border-amber-600/30';
      default: return 'bg-stone-gray/10 border-stone-gray/30';
    }
  };

  const getTierIcon = (tier: string) => {
    const iconMap: Record<string, IconName> = {
      vip: 'star',
      regular: 'users',
      occasional: 'activity',
      new: 'trending-up',
      at_risk: 'alert-triangle',
    };
    return <ThiingsIcon name={iconMap[tier] || 'users'} size="xs" />;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-border-gray">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
            <ThiingsIcon name="users" size="sm" />
            Customer Lifetime Value
          </h2>
        </div>
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

  const totalTierCustomers = Object.values(stats.tiers).reduce((sum, count) => sum + count, 0);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-border-gray">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-soft-gray/50 transition-colors rounded-t-xl"
      >
        <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="users" size="sm" />
          Customer Lifetime Value
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" size="sm" />
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-3">
            {/* Total Customers */}
            <div className="p-4 bg-burgundy/10 rounded-xl border border-burgundy/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="users" size="sm" />
                <span className="text-2xl font-bold text-deep-charcoal">{stats.total_customers}</span>
              </div>
              <div className="text-xs text-stone-gray">Total Customers</div>
            </div>

            {/* Average LTV */}
            <div className="p-4 bg-green-600/10 rounded-xl border border-green-600/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="trending-up" size="sm" />
                <span className="text-2xl font-bold text-deep-charcoal">{formatCurrency(stats.avg_ltv)}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="text-xs text-stone-gray">Avg Lifetime Value</div>
                <HelpTooltip
                  title="What is LTV?"
                  content="Total revenue a customer generates over their relationship with you.

Components:
• Average spend per visit: €45
• Visit frequency: 3x per year
• Customer lifespan: 3 years
• LTV = €45 × 3 × 3 = €405

Why it matters:
Focus retention efforts on high-LTV customers"
                  position="bottom"
                  size="sm"
                />
              </div>
            </div>

            {/* Total LTV */}
            <div className="p-4 bg-violet-600/10 rounded-xl border border-violet-600/20">
              <div className="flex items-center justify-between mb-2">
                <ThiingsIcon name="dollar" size="sm" />
                <span className="text-2xl font-bold text-deep-charcoal">{formatCurrency(stats.total_ltv)}</span>
              </div>
              <div className="text-xs text-stone-gray">Total LTV</div>
            </div>
          </div>

          {/* Customer Tiers Breakdown */}
          <div className="p-4 bg-soft-gray rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-deep-charcoal">Customer Segments</h3>
                <HelpTooltip
                  title="Customer Segments"
                  content="VIP (€500+): Top 10% - Priority reservations, special offers
Regular (€200-€500): Core customers - Loyalty rewards
Occasional (€50-€200): Potential for growth - Engagement campaigns
New (<€50): First-time diners - Welcome offers
At Risk: Haven't visited in 90+ days - Win-back campaigns"
                  position="right"
                  size="sm"
                />
              </div>
              <span className="text-xs text-stone-gray">{totalTierCustomers} total</span>
            </div>
            <div className="space-y-2">
              {Object.entries(stats.tiers).map(([tier, count]) => {
                const percentage = totalTierCustomers > 0 ? (count / totalTierCustomers) * 100 : 0;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${getTierBgColor(tier)} border`}>
                      <span className={getTierColor(tier)}>
                        {getTierIcon(tier)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-deep-charcoal capitalize">{tier}</span>
                        <span className="text-sm text-stone-gray">{count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tier === 'vip' ? 'bg-violet-600' : tier === 'regular' ? 'bg-burgundy' : tier === 'occasional' ? 'bg-green-600' : tier === 'new' ? 'bg-stone-gray' : 'bg-amber-600'}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top VIP Customers */}
          {topVIPs.length > 0 && (
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
          )}

          {/* At-Risk Customers */}
          {atRiskCustomers.length > 0 && (
            <div className="p-4 bg-amber-600/10 rounded-xl border border-amber-600/20">
              <div className="flex items-center gap-2 mb-3">
                <ThiingsIcon name="alert-triangle" size="xs" />
                <h3 className="text-sm font-semibold text-deep-charcoal">High Churn Risk ({stats.high_risk_customers})</h3>
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
                        onClick={() => openCampaignModal(customer)}
                        className="p-2 bg-amber-600/20 hover:bg-amber-600/30 rounded-lg transition-colors"
                        title="Send retention campaign"
                      >
                        <ThiingsIcon name="mail" size="xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="w-full mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl transition-colors"
                onClick={() => atRiskCustomers[0] && openCampaignModal(atRiskCustomers[0])}
              >
                Launch Retention Campaign
              </button>
            </div>
          )}

          {/* Calculate All Button */}
          <button
            className="w-full px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-burgundy/30 flex items-center justify-center gap-2"
            onClick={async () => {
              try {
                const response = await api.get('/ltv?action=calculate-all');
                if (response.data.success) {
                  success(`Calculated LTV for ${response.data.data.total_customers} customers`);
                  fetchLTVData();
                }
              } catch (err) {
                error('Failed to calculate LTV for all customers');
              }
            }}
          >
            <ThiingsIcon name="activity" size="sm" />
            Recalculate All Customer LTV
          </button>
        </div>
      )}

      {/* Retention Campaign Modal */}
      <RetentionCampaignModal
        isOpen={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        customer={selectedCustomerForCampaign}
        onSendCampaign={handleSendCampaign}
      />
    </div>
  );
}
