import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useRevenueOpportunities } from '../../hooks/usePredictiveAnalytics';
import { formatCurrency } from '../../utils/currency';

export default function RevenueOpportunities() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useRevenueOpportunities();
  const opportunities = data?.opportunities ?? [];
  const summary = data?.summary ?? null;
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-600';
      case 'medium': return 'bg-amber-600';
      case 'low': return 'bg-rose-500';
      default: return 'bg-warm-stone';
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'low': return 'bg-rose-500/15 text-rose-800';
      case 'medium': return 'bg-amber-600/15 text-amber-800';
      case 'high': return 'bg-red-600/15 text-red-800';
      default: return 'bg-soft-gray text-charcoal-dark';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-8 shadow-sm">
        <div role="status" className="flex items-center justify-center">
          <div aria-hidden="true" className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-warm-stone">{t('analytics.analyzingOpportunities')}</span>
        </div>
      </div>
    );
  }

  if (isError || (!isLoading && opportunities.length === 0 && !summary)) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-8 shadow-sm">
        <div className="text-center py-8">
          <ThiingsIcon name="lightbulb" pxSize={32} className="mx-auto mb-3 text-warm-stone" />
          <p className="font-semibold text-deep-charcoal mb-1">{t('analytics.noRevenueData', 'No revenue data yet')}</p>
          <p className="text-sm text-warm-stone">{t('analytics.noRevenueDataDesc', 'Revenue opportunities will appear once there is enough booking history to analyze.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-border-gray">
        <h2 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-1">{t('analytics.revenueOpportunities')}</h2>
        <p className="text-sm text-warm-stone">
          {t('analytics.revenueOpportunitiesDesc')}
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 p-6 bg-soft-gray/30 border-b border-border-gray">
          <div className="text-center">
            <div className="text-3xl font-bold text-rose-600">{formatCurrency(summary.total_potential_revenue)}</div>
            <div className="text-xs text-warm-stone mt-1">{t('analytics.totalPotential')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-burgundy">{formatCurrency(summary.estimated_monthly_impact)}</div>
            <div className="text-xs text-warm-stone mt-1">{t('analytics.monthlyImpact')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-deep-charcoal">{summary.quick_wins}</div>
            <div className="text-xs text-warm-stone mt-1">{t('analytics.quickWins')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.high_priority}</div>
            <div className="text-xs text-warm-stone mt-1">{t('analytics.highPriority')}</div>
          </div>
        </div>
      )}

      {/* Opportunities Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4">
          {opportunities.map((opp) => (
            <div
              key={opp.rank}
              role="button"
              tabIndex={0}
              aria-expanded={expandedCard === opp.rank}
              className="border border-border-gray/50 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer bg-gradient-to-br from-white to-soft-gray/20 focus:outline-none focus:ring-2 focus:ring-burgundy/20"
              onClick={() => setExpandedCard(expandedCard === opp.rank ? null : opp.rank)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedCard(expandedCard === opp.rank ? null : opp.rank); } }}
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
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                    <div className="text-xs text-rose-600 font-medium mb-1">{t('analytics.potentialGain')}</div>
                    <div className="text-2xl font-bold text-rose-700">{formatCurrency(opp.potential_gain)}</div>
                    <div className="text-xs text-rose-600 mt-1">{t('analytics.recoveryRate', { rate: opp.recovery_rate })}</div>
                  </div>
                  <div className="bg-soft-gray/50 border border-border-gray rounded-xl p-3">
                    <div className="text-xs text-warm-stone font-medium mb-1">{t('analytics.timeline')}</div>
                    <div className="text-lg font-bold text-deep-charcoal">{opp.estimated_timeline}</div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${getDifficultyBadge(opp.implementation_difficulty)}`}>
                      {t('analytics.difficulty', { level: opp.implementation_difficulty })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Actions */}
              {expandedCard === opp.rank && (
                <div className="p-5 bg-soft-gray/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ThiingsIcon name="check-circle" pxSize={20} className="text-burgundy" />
                    <h4 className="font-semibold text-deep-charcoal">{t('analytics.actionSteps')}</h4>
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
                      <span className="font-semibold">{t('analytics.roiPotential')}</span> High
                    </div>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-all"
                    >
                      {t('analytics.startImplementation')}
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
            {t('analytics.opportunitiesFooter')}
          </span>
        </div>
      </div>
    </div>
  );
}
