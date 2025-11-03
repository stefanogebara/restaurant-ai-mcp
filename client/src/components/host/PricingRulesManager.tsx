/**
 * Pricing Rules Management UI
 *
 * Allows hosts to create, edit, delete, and manage dynamic pricing rules
 */

import { useState, useEffect } from 'react';
import { Plus, Trash2, Power, Clock, TrendingUp, Calendar, DollarSign, BarChart3 } from 'lucide-react';

interface PricingRule {
  id: string;
  rule_name: string;
  rule_type: 'time_based' | 'demand_based' | 'event_based';
  day_of_week: string | null;
  time_slot_start: string | null;
  time_slot_end: string | null;
  occupancy_threshold: number | null;
  seats_remaining_threshold: number | null;
  event_name: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  price_modifier_type: 'percentage' | 'fixed';
  price_modifier_value: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface PricingStats {
  total_events: number;
  avg_base_price: number;
  avg_final_price: number;
  avg_modifier: number;
  demand_breakdown: {
    low: number;
    medium: number;
    high: number;
    surge: number;
  };
}

export default function PricingRulesManager() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [stats, setStats] = useState<PricingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchPricingData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPricingData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPricingData = async () => {
    try {
      // Fetch rules
      const rulesResponse = await fetch('/api/pricing?action=rules');
      const rulesResult = await rulesResponse.json();
      if (rulesResult.success) {
        setRules(rulesResult.data.rules || []);
      }

      // Fetch stats
      const statsResponse = await fetch('/api/pricing?action=stats');
      const statsResult = await statsResponse.json();
      if (statsResult.success) {
        setStats(statsResult.data);
      }

    } catch (error) {
      console.error('Error fetching pricing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRuleStatus = async (ruleId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/pricing?action=update-rule&rule_id=${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      const result = await response.json();
      if (result.success) {
        fetchPricingData(); // Refresh
      } else {
        alert('Failed to update rule status');
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      alert('Failed to update rule');
    }
  };

  const deleteRule = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Are you sure you want to delete the rule "${ruleName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/pricing?action=delete-rule&rule_id=${ruleId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        fetchPricingData(); // Refresh
      } else {
        alert('Failed to delete rule');
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Failed to delete rule');
    }
  };

  const createDefaultRules = async () => {
    if (!confirm('This will create 4 default pricing rules. Continue?')) {
      return;
    }

    try {
      const response = await fetch('/api/pricing?action=create-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (result.success) {
        alert(`Created ${result.data.length} default rules!`);
        fetchPricingData(); // Refresh
      } else {
        alert('Failed to create default rules');
      }
    } catch (error) {
      console.error('Error creating default rules:', error);
      alert('Failed to create default rules');
    }
  };

  const getRuleTypeIcon = (type: string) => {
    switch (type) {
      case 'time_based': return <Clock className="w-4 h-4" />;
      case 'demand_based': return <TrendingUp className="w-4 h-4" />;
      case 'event_based': return <Calendar className="w-4 h-4" />;
      default: return <DollarSign className="w-4 h-4" />;
    }
  };

  const getRuleTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'time_based': return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'demand_based': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'event_based': return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      default: return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  const formatModifier = (type: string, value: number) => {
    if (type === 'percentage') {
      return `${value > 0 ? '+' : ''}${value}%`;
    }
    return `${value > 0 ? '+' : ''}€${value}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Dynamic Pricing Rules
          </h2>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-500" />
          Dynamic Pricing Rules
          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-sm rounded-full font-semibold">
            {rules.filter(r => r.is_active).length} Active
          </span>
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
          {/* Pricing Statistics */}
          {stats && stats.total_events > 0 && (
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="text-xs text-muted-foreground mb-1">Calculations</div>
                <div className="text-2xl font-bold text-foreground">{stats.total_events}</div>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="text-xs text-muted-foreground mb-1">Avg Base Price</div>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.avg_base_price)}</div>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div className="text-xs text-muted-foreground mb-1">Avg Final Price</div>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.avg_final_price)}</div>
              </div>
              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="text-xs text-muted-foreground mb-1">Avg Modifier</div>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.avg_modifier)}</div>
              </div>
            </div>
          )}

          {/* Rules List */}
          {rules.length === 0 ? (
            <div className="p-8 bg-muted/30 rounded-lg text-center">
              <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Pricing Rules Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create rules to enable dynamic pricing</p>
              <button
                onClick={createDefaultRules}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Create Default Rules
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules
                .sort((a, b) => b.priority - a.priority)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      rule.is_active
                        ? 'bg-card/50 border-border'
                        : 'bg-muted/20 border-muted opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`px-2 py-1 rounded-lg border flex items-center gap-1 ${getRuleTypeBadgeColor(rule.rule_type)}`}>
                            {getRuleTypeIcon(rule.rule_type)}
                            <span className="text-xs font-semibold capitalize">
                              {rule.rule_type.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="px-2 py-1 bg-muted rounded-lg text-xs font-medium text-muted-foreground">
                            Priority: {rule.priority}
                          </span>
                          {!rule.is_active && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold">
                              Inactive
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-1">{rule.rule_name}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {rule.time_slot_start && rule.time_slot_end && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {rule.time_slot_start.slice(0, 5)} - {rule.time_slot_end.slice(0, 5)}
                            </div>
                          )}
                          {rule.occupancy_threshold && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {rule.occupancy_threshold}% occupancy
                            </div>
                          )}
                          {rule.event_start_date && rule.event_end_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(rule.event_start_date).toLocaleDateString()} - {new Date(rule.event_end_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
                          rule.price_modifier_value > 0
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-green-500/10 text-green-400'
                        }`}>
                          {formatModifier(rule.price_modifier_type, rule.price_modifier_value)}
                        </div>
                        <button
                          onClick={() => toggleRuleStatus(rule.id, rule.is_active)}
                          className={`p-2 rounded-lg transition-colors ${
                            rule.is_active
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                          }`}
                          title={rule.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id, rule.rule_name)}
                          className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => alert('Create rule modal coming soon!')}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create New Rule
            </button>
            {rules.length > 0 && (
              <button
                onClick={() => window.open('/api/pricing?action=events', '_blank')}
                className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <BarChart3 className="w-5 h-5" />
                View Events
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
