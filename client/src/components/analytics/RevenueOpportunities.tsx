import { useState, useEffect } from 'react';

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
      const response = await fetch('/api/predictive-analytics?type=revenue');
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
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-muted-foreground">Analyzing revenue opportunities...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6">
        <h2 className="text-2xl font-bold text-white mb-2">💰 Revenue Optimization Opportunities</h2>
        <p className="text-white/90 text-sm">
          Data-driven insights to maximize revenue and improve operational efficiency
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gradient-to-b from-green-50 to-transparent border-b border-border">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{formatCurrency(summary.total_potential_revenue)}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Potential</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{formatCurrency(summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-muted-foreground mt-1">Monthly Impact</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground">{summary.quick_wins}</div>
            <div className="text-xs text-muted-foreground mt-1">Quick Wins</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.high_priority}</div>
            <div className="text-xs text-muted-foreground mt-1">High Priority</div>
          </div>
        </div>
      )}

      {/* Opportunities Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {opportunities.map((opp) => (
            <div
              key={opp.rank}
              className="border border-border rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer bg-gradient-to-br from-card to-muted/20"
              onClick={() => setExpandedCard(expandedCard === opp.rank ? null : opp.rank)}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getPriorityColor(opp.priority)} text-white font-bold`}>
                      #{opp.rank}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground">{opp.category}</h3>
                      <p className="text-sm text-muted-foreground">{opp.description}</p>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium mb-1">Potential Gain</div>
                    <div className="text-2xl font-bold text-green-700">{formatCurrency(opp.potential_gain)}</div>
                    <div className="text-xs text-green-600 mt-1">{opp.recovery_rate} recovery rate</div>
                  </div>
                  <div className="bg-muted/50 border border-border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground font-medium mb-1">Timeline</div>
                    <div className="text-lg font-bold text-foreground">{opp.estimated_timeline}</div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${getDifficultyBadge(opp.implementation_difficulty)}`}>
                      {opp.implementation_difficulty} difficulty
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Actions */}
              {expandedCard === opp.rank && (
                <div className="p-5 bg-muted/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <h4 className="font-semibold text-foreground">Action Steps:</h4>
                  </div>
                  <div className="space-y-2">
                    {opp.actions.map((action, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-card border border-border rounded-lg p-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1 text-sm text-foreground">{action}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold">ROI Potential:</span> High
                    </div>
                    <button className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-all">
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
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>
            Opportunities are ranked by potential revenue impact and implementation feasibility.
            Click on any opportunity card to see detailed action steps.
          </span>
        </div>
      </div>
    </div>
  );
}
