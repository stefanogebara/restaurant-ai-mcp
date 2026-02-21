import { useState, useEffect } from 'react';
import { authFetch } from '../../services/api';

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
      case 'high': return 'bg-[#dc2626]';
      case 'medium': return 'bg-[#d97706]';
      case 'low': return 'bg-[#22c55e]';
      default: return 'bg-[#78716C]';
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'low': return 'bg-[#22c55e]/15 text-[#065f46]';
      case 'medium': return 'bg-[#d97706]/15 text-[#92400e]';
      case 'high': return 'bg-[#dc2626]/15 text-[#991b1b]';
      default: return 'bg-[#F5F5F4] text-[#292524]';
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
      <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-8 shadow-sm">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#9F1239] border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-[#78716C]">Analyzing revenue opportunities...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E7E5E4]/50 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-[#E7E5E4]">
        <h2 className="text-lg font-semibold text-[#1C1917] tracking-tight mb-1">Revenue Opportunities</h2>
        <p className="text-sm text-[#78716C]">
          Data-driven insights to maximize revenue and improve operational efficiency
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-[#F5F5F4]/30 border-b border-[#E7E5E4]">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#16a34a]">{formatCurrency(summary.total_potential_revenue)}</div>
            <div className="text-xs text-[#78716C] mt-1">Total Potential</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#9F1239]">{formatCurrency(summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-[#78716C] mt-1">Monthly Impact</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#1C1917]">{summary.quick_wins}</div>
            <div className="text-xs text-[#78716C] mt-1">Quick Wins</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#dc2626]">{summary.high_priority}</div>
            <div className="text-xs text-[#78716C] mt-1">High Priority</div>
          </div>
        </div>
      )}

      {/* Opportunities Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {opportunities.map((opp) => (
            <div
              key={opp.rank}
              className="border border-[#E7E5E4]/50 rounded-xl overflow-hidden hover:shadow-lg transition-all cursor-pointer bg-gradient-to-br from-white to-[#F5F5F4]/20"
              onClick={() => setExpandedCard(expandedCard === opp.rank ? null : opp.rank)}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-[#E7E5E4]">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getPriorityColor(opp.priority)} text-white font-bold`}>
                      #{opp.rank}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-[#1C1917]">{opp.category}</h3>
                      <p className="text-sm text-[#78716C]">{opp.description}</p>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-lg p-3">
                    <div className="text-xs text-[#16a34a] font-medium mb-1">Potential Gain</div>
                    <div className="text-2xl font-bold text-[#15803d]">{formatCurrency(opp.potential_gain)}</div>
                    <div className="text-xs text-[#16a34a] mt-1">{opp.recovery_rate} recovery rate</div>
                  </div>
                  <div className="bg-[#F5F5F4]/50 border border-[#E7E5E4] rounded-lg p-3">
                    <div className="text-xs text-[#78716C] font-medium mb-1">Timeline</div>
                    <div className="text-lg font-bold text-[#1C1917]">{opp.estimated_timeline}</div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${getDifficultyBadge(opp.implementation_difficulty)}`}>
                      {opp.implementation_difficulty} difficulty
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Actions */}
              {expandedCard === opp.rank && (
                <div className="p-5 bg-[#F5F5F4]/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <h4 className="font-semibold text-[#1C1917]">Action Steps:</h4>
                  </div>
                  <div className="space-y-2">
                    {opp.actions.map((action, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-white border border-[#E7E5E4] rounded-lg p-3">
                        <div className="w-6 h-6 rounded-full bg-[#9F1239] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1 text-sm text-[#1C1917]">{action}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#E7E5E4] flex justify-between items-center">
                    <div className="text-xs text-[#78716C]">
                      <span className="font-semibold">ROI Potential:</span> High
                    </div>
                    <button className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-medium rounded-lg transition-all">
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
      <div className="bg-[#F5F5F4]/30 px-6 py-4 border-t border-[#E7E5E4]">
        <div className="flex items-center gap-2 text-xs text-[#78716C]">
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
