import { useState, useEffect } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

interface RevenueOpportunity {
  rank: number;
  category: string;
  description: string;
  current_loss: number;
  potential_gain: number;
  recovery_rate: string;
  actions: string[];
  priority: 'low' | 'medium' | 'high';
  implementation_difficulty: 'low' | 'medium' | 'high';
  estimated_timeline: string;
}

interface OpportunitySummary {
  total_opportunities: number;
  total_potential_revenue: number;
  estimated_monthly_impact: number;
  quick_wins: number;
  high_priority: number;
}

export default function RevenueOpportunities() {
  const [opportunities, setOpportunities] = useState<RevenueOpportunity[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/predictive-analytics?type=revenue');
      const result = await response.json();

      if (result.success) {
        setOpportunities(result.opportunities || []);
        setSummary(result.summary);
      }
    } catch (error) {
      console.error('Error fetching revenue opportunities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-600';
      case 'medium': return 'bg-amber-600';
      case 'low': return 'bg-green-500';
      default: return 'bg-warm-stone';
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'low': return 'bg-green-500/15 text-emerald-800';
      case 'medium': return 'bg-amber-600/15 text-amber-800';
      case 'high': return 'bg-red-600/15 text-red-800';
      default: return 'bg-soft-gray text-charcoal-dark';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-warm-stone">Analyzing revenue opportunities...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-border-gray">
        <h2 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-1">Revenue Opportunities</h2>
        <p className="text-sm text-warm-stone">
          Data-driven insights to maximize revenue and improve operational efficiency
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-soft-gray/30 border-b border-border-gray">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{formatCurrency(summary.total_potential_revenue)}</div>
            <div className="text-xs text-warm-stone mt-1">Total Potential</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-burgundy">{formatCurrency(summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-warm-stone mt-1">Monthly Impact</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-deep-charcoal">{summary.quick_wins}</div>
            <div className="text-xs text-warm-stone mt-1">Quick Wins</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.high_priority}</div>
            <div className="text-xs text-warm-stone mt-1">High Priority</div>
          </div>
        </div>
      )}

      {/* Opportunities Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {opportunities.map((opp) => (
            <div
              key={opp.rank}
              className="border border-border-gray/50 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer bg-gradient-to-br from-white to-soft-gray/20"
              onClick={() => setExpandedCard(expandedCard === opp.rank ? null : opp.rank)}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-border-gray">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getPriorityColor(opp.priority)} text-white font-bold`}>
                      #{opp.rank}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-deep-charcoal">{opp.category}</h3>
                      <p className="text-sm text-warm-stone">{opp.description}</p>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                    <div className="text-xs text-green-600 font-medium mb-1">Potential Gain</div>
                    <div className="text-2xl font-bold text-green-700">{formatCurrency(opp.potential_gain)}</div>
                    <div className="text-xs text-green-600 mt-1">{opp.recovery_rate} recovery rate</div>
                  </div>
                  <div className="bg-soft-gray/50 border border-border-gray rounded-xl p-3">
                    <div className="text-xs text-warm-stone font-medium mb-1">Timeline</div>
                    <div className="text-lg font-bold text-deep-charcoal">{opp.estimated_timeline}</div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${getDifficultyBadge(opp.implementation_difficulty)}`}>
                      {opp.implementation_difficulty} difficulty
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Actions */}
              {expandedCard === opp.rank && (
                <div className="p-5 bg-soft-gray/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ThiingsIcon name="check-circle" pxSize={20} className="text-burgundy" />
                    <h4 className="font-semibold text-deep-charcoal">Action Steps:</h4>
                  </div>
                  <div className="space-y-2">
                    {opp.actions.map((action, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-white border border-border-gray rounded-xl p-3">
                        <div className="w-6 h-6 rounded-full bg-burgundy text-white flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1 text-sm text-deep-charcoal">{action}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border-gray flex justify-between items-center">
                    <div className="text-xs text-warm-stone">
                      <span className="font-semibold">ROI Potential:</span> High
                    </div>
                    <button className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-all">
                      Start Implementation
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-soft-gray/30 px-6 py-4 border-t border-border-gray">
        <div className="flex items-center gap-2 text-xs text-warm-stone">
          <ThiingsIcon name="lightbulb" pxSize={16} />
          <span>
            Opportunities are ranked by potential revenue impact and implementation feasibility.
            Click on any opportunity card to see detailed action steps.
          </span>
        </div>
      </div>
    </div>
  );
}
