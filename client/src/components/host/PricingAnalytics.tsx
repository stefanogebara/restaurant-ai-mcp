/**
 * Pricing Effectiveness Analytics
 *
 * Shows comprehensive pricing performance metrics:
 * - Revenue lift from dynamic pricing
 * - Rule effectiveness breakdown
 * - Before/after comparisons
 * - Demand-based performance
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  BarChart3,
  Clock,
  Activity
} from 'lucide-react';
import HelpTooltip from '../common/HelpTooltip';

interface PricingAnalytics {
  summary: {
    total_events: number;
    total_revenue_lift: number;
    total_discount_given: number;
    net_revenue_impact: number;
    avg_price_increase_pct: number;
  };
  by_rule_type: Record<string, {
    count: number;
    revenue_lift: number;
    discount_given: number;
    net_impact: number;
  }>;
  by_demand_level: Record<string, {
    count: number;
    revenue_lift: number;
    discount_given: number;
    net_impact: number;
    avg_modifier: number;
  }>;
  by_time_slot: Record<string, {
    count: number;
    revenue_lift: number;
    discount_given: number;
    net_impact: number;
  }>;
  most_effective_rules: Array<{
    rule_name: string;
    applications: number;
    total_impact: number;
    avg_impact: number;
  }>;
  timeline: Array<{
    date: string;
    events: number;
    revenue_lift: number;
    discount_given: number;
    net_impact: number;
  }>;
}

export default function PricingAnalytics() {
  const [analytics, setAnalytics] = useState<PricingAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    // Refresh every 60 seconds
    const interval = setInterval(fetchAnalytics, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/pricing?action=analytics');
      const result = await response.json();
      if (result.success) {
        setAnalytics(result.data);
      }
    } catch (error) {
      console.error('Error fetching pricing analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Pricing Effectiveness
          </h2>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  // Show helpful message when no pricing data exists yet
  if (!analytics || analytics.summary.total_events === 0) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8 border border-border text-center">
        <BarChart3 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">No Pricing Data Yet</h3>
        <p className="text-muted-foreground mb-4">
          Create pricing rules first to start tracking effectiveness analytics
        </p>
        <a
          href="/host-dashboard/pricing"
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Go to Pricing Rules
        </a>
      </div>
    );
  }

  const { summary, by_demand_level, by_time_slot, most_effective_rules, timeline } = analytics;

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-500" />
          Pricing Effectiveness
          {summary.net_revenue_impact > 0 && (
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-sm rounded-full font-semibold">
              {formatCurrency(summary.net_revenue_impact)} Net Lift
            </span>
          )}
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
          {/* Summary Metrics */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-muted-foreground">Revenue Lift</div>
                <HelpTooltip
                  title="Revenue Lift"
                  content="Additional money earned from surge pricing vs. base prices.

Example:
• Base price: €50 per person
• Surge price: €60 per person
• Revenue lift: €10 per person

Monthly impact:
100 surge reservations × €10 = €1,000 extra revenue"
                  position="bottom"
                  size="sm"
                />
              </div>
              <div className="text-2xl font-bold text-green-400">{formatCurrency(summary.total_revenue_lift)}</div>
              <div className="text-xs text-muted-foreground mt-1">From surges</div>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="text-xs text-muted-foreground mb-1">Discounts Given</div>
              <div className="text-2xl font-bold text-red-400">{formatCurrency(summary.total_discount_given)}</div>
              <div className="text-xs text-muted-foreground mt-1">From specials</div>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-muted-foreground">Net Impact</div>
                <HelpTooltip
                  title="Net Impact"
                  content="Revenue Lift minus Discount Cost

Formula: Net Impact = Revenue Lift - Discounts

Target: Positive (ideally 3:1 ratio)

Good example:
• Revenue Lift: €3,000
• Discounts Given: €1,000
• Net Impact: +€2,000 (3:1 ratio)

Bad example:
• Revenue Lift: €1,000
• Discounts Given: €2,000
• Net Impact: -€1,000 (losing money)"
                  position="bottom"
                  size="sm"
                />
              </div>
              <div className="text-2xl font-bold text-blue-400">{formatCurrency(summary.net_revenue_impact)}</div>
              <div className="text-xs text-muted-foreground mt-1">{formatPercent(summary.avg_price_increase_pct)} vs base</div>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <div className="text-xs text-muted-foreground mb-1">Price Events</div>
              <div className="text-2xl font-bold text-purple-400">{summary.total_events}</div>
              <div className="text-xs text-muted-foreground mt-1">Total calculations</div>
            </div>
          </div>

          {/* Performance by Demand Level */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-500" />
              <h3 className="text-lg font-semibold text-foreground">Performance by Demand Level</h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(by_demand_level)
                .sort((a, b) => {
                  const order = ['low', 'medium', 'high', 'surge'];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                })
                .map(([level, data]) => (
                  <div key={level} className="bg-card p-3 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-foreground capitalize">{level}</div>
                      <div className="text-xs text-muted-foreground">{data.count} events</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Net Impact:</span>
                        <span className={data.net_impact >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatCurrency(data.net_impact)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Avg Modifier:</span>
                        <span className="text-foreground">{formatCurrency(data.avg_modifier)}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Performance by Time Slot */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-blue-500" />
              <h3 className="text-lg font-semibold text-foreground">Performance by Time Slot</h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(by_time_slot)
                .sort((a, b) => b[1].net_impact - a[1].net_impact)
                .map(([slot, data]) => (
                  <div key={slot} className="bg-card p-3 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-foreground">{slot}</div>
                      <div className="text-xs text-muted-foreground">{data.count} events</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Revenue Lift:</span>
                        <span className="text-green-400">{formatCurrency(data.revenue_lift)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Discounts:</span>
                        <span className="text-red-400">{formatCurrency(data.discount_given)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Net:</span>
                        <span className={data.net_impact >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatCurrency(data.net_impact)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Most Effective Rules */}
          {most_effective_rules.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h3 className="text-lg font-semibold text-foreground">Top Performing Rules</h3>
              </div>
              <div className="space-y-2">
                {most_effective_rules.map((rule, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center justify-center w-6 h-6 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{rule.rule_name || 'Unknown Rule'}</div>
                        <div className="text-xs text-muted-foreground">{rule.applications} applications</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${rule.total_impact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(rule.total_impact)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(rule.avg_impact)} avg
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <h3 className="text-lg font-semibold text-foreground">Recent Timeline</h3>
                <span className="text-xs text-muted-foreground">Last {Math.min(7, timeline.length)} days</span>
              </div>
              <div className="space-y-2">
                {timeline.slice(-7).reverse().map((day) => (
                  <div key={day.date} className="flex items-center gap-3 p-2 bg-card rounded border border-border">
                    <div className="text-sm font-medium text-foreground w-24">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden flex">
                        {day.revenue_lift > 0 && (
                          <div
                            className="bg-green-500 flex items-center justify-center text-xs text-white font-semibold"
                            style={{
                              width: `${(day.revenue_lift / (day.revenue_lift + day.discount_given)) * 100}%`,
                              minWidth: '20px'
                            }}
                            title={`Revenue Lift: ${formatCurrency(day.revenue_lift)}`}
                          >
                            {day.revenue_lift > 5 && `+${day.revenue_lift.toFixed(0)}`}
                          </div>
                        )}
                        {day.discount_given > 0 && (
                          <div
                            className="bg-red-500 flex items-center justify-center text-xs text-white font-semibold"
                            style={{
                              width: `${(day.discount_given / (day.revenue_lift + day.discount_given)) * 100}%`,
                              minWidth: '20px'
                            }}
                            title={`Discounts: ${formatCurrency(day.discount_given)}`}
                          >
                            {day.discount_given > 5 && `-${day.discount_given.toFixed(0)}`}
                          </div>
                        )}
                      </div>
                      <div className={`text-sm font-bold w-20 text-right ${day.net_impact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(day.net_impact)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground w-16 text-right">
                      {day.events} events
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
