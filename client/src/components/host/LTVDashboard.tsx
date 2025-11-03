/**
 * Customer Lifetime Value (LTV) Dashboard
 *
 * Displays customer segmentation, top VIPs, churn risks, and LTV metrics
 */

import { useState, useEffect } from 'react';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Star, DollarSign, Calendar, Activity } from 'lucide-react';

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
  const [stats, setStats] = useState<LTVStats | null>(null);
  const [topVIPs, setTopVIPs] = useState<Customer[]>([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchLTVData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchLTVData, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchLTVData = async () => {
    try {
      // Fetch statistics
      const statsResponse = await fetch('/api/ltv?action=stats');
      const statsResult = await statsResponse.json();
      if (statsResult.success) {
        setStats(statsResult.data);
      }

      // Fetch top VIPs
      const vipsResponse = await fetch('/api/ltv?action=list&tier=vip&limit=5');
      const vipsResult = await vipsResponse.json();
      if (vipsResult.success) {
        setTopVIPs(vipsResult.data.customers || []);
      }

      // Fetch all customers and filter high churn risk
      const customersResponse = await fetch('/api/ltv?action=list&limit=100');
      const customersResult = await customersResponse.json();
      if (customersResult.success) {
        const highRisk = customersResult.data.customers
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

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'vip': return 'text-purple-400';
      case 'regular': return 'text-blue-400';
      case 'occasional': return 'text-green-400';
      case 'new': return 'text-gray-400';
      case 'at_risk': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getTierBgColor = (tier: string) => {
    switch (tier) {
      case 'vip': return 'bg-purple-500/10 border-purple-500/30';
      case 'regular': return 'bg-blue-500/10 border-blue-500/30';
      case 'occasional': return 'bg-green-500/10 border-green-500/30';
      case 'new': return 'bg-gray-500/10 border-gray-500/30';
      case 'at_risk': return 'bg-red-500/10 border-red-500/30';
      default: return 'bg-gray-500/10 border-gray-500/30';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'vip': return <Star className="w-4 h-4" />;
      case 'regular': return <Users className="w-4 h-4" />;
      case 'occasional': return <Activity className="w-4 h-4" />;
      case 'new': return <TrendingUp className="w-4 h-4" />;
      case 'at_risk': return <AlertTriangle className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
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
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5" />
            Customer Lifetime Value
          </h2>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!stats || stats.total_customers === 0) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">No Customer Data Yet</h3>
            <p className="text-sm text-muted-foreground">LTV metrics will appear as customers visit</p>
          </div>
        </div>
      </div>
    );
  }

  const totalTierCustomers = Object.values(stats.tiers).reduce((sum, count) => sum + count, 0);

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" />
          Customer Lifetime Value
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-3">
            {/* Total Customers */}
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span className="text-2xl font-bold text-foreground">{stats.total_customers}</span>
              </div>
              <div className="text-xs text-muted-foreground">Total Customers</div>
            </div>

            {/* Average LTV */}
            <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span className="text-2xl font-bold text-foreground">{formatCurrency(stats.avg_ltv)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Avg Lifetime Value</div>
            </div>

            {/* Total LTV */}
            <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-purple-400" />
                <span className="text-2xl font-bold text-foreground">{formatCurrency(stats.total_ltv)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Total LTV</div>
            </div>
          </div>

          {/* Customer Tiers Breakdown */}
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Customer Segments</h3>
              <span className="text-xs text-muted-foreground">{totalTierCustomers} total</span>
            </div>
            <div className="space-y-2">
              {Object.entries(stats.tiers).map(([tier, count]) => {
                const percentage = totalTierCustomers > 0 ? (count / totalTierCustomers) * 100 : 0;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getTierBgColor(tier)} border`}>
                      <span className={getTierColor(tier)}>
                        {getTierIcon(tier)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground capitalize">{tier}</span>
                        <span className="text-sm text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tier === 'vip' ? 'bg-purple-500' : tier === 'regular' ? 'bg-blue-500' : tier === 'occasional' ? 'bg-green-500' : tier === 'new' ? 'bg-gray-500' : 'bg-red-500'}`}
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
            <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-foreground">Top VIP Customers</h3>
              </div>
              <div className="space-y-2">
                {topVIPs.map((customer, index) => (
                  <div key={customer.customer_id} className="flex items-center justify-between p-2 bg-card/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-400">#{index + 1}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{customer.customer_id}</div>
                        <div className="text-xs text-muted-foreground">{customer.total_visits} visits</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-purple-400">{formatCurrency(customer.lifetime_value)}</div>
                      <div className="text-xs text-muted-foreground">{formatCurrency(customer.total_revenue)} spent</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* At-Risk Customers */}
          {atRiskCustomers.length > 0 && (
            <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">High Churn Risk ({stats.high_risk_customers})</h3>
              </div>
              <div className="space-y-2">
                {atRiskCustomers.map((customer) => (
                  <div key={customer.customer_id} className="flex items-center justify-between p-2 bg-card/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-bold text-red-400">{customer.churn_risk_score}%</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{customer.customer_id}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Last: {new Date(customer.last_visit_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">{formatCurrency(customer.lifetime_value)} LTV</div>
                      <div className="text-xs text-muted-foreground">{customer.total_visits} visits</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="w-full mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                onClick={() => alert('Retention campaigns feature coming soon!')}
              >
                Launch Retention Campaign
              </button>
            </div>
          )}

          {/* Calculate All Button */}
          <button
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
            onClick={async () => {
              try {
                const response = await fetch('/api/ltv?action=calculate-all', { method: 'GET' });
                const result = await response.json();
                if (result.success) {
                  alert(`Successfully calculated LTV for ${result.data.total_customers} customers!`);
                  fetchLTVData(); // Refresh data
                }
              } catch (error) {
                alert('Failed to calculate LTV for all customers');
              }
            }}
          >
            <Activity className="w-5 h-5" />
            Recalculate All Customer LTV
          </button>
        </div>
      )}
    </div>
  );
}
