/**
 * ML ROI Widget
 *
 * Replaces QuickStats with ML-focused metrics
 * Displays real-time ROI, intervention effectiveness, and ML performance
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import HelpTooltip from '../common/HelpTooltip';
import { useMLROI } from '../../hooks/useMLPerformance';
import { formatCurrency } from '../../utils/currency';

export default function MLROIWidget() {
  const { t } = useTranslation();
  const { data, isLoading } = useMLROI();
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
            <ThiingsIcon name="trending-up" size="sm" />
            {t('host.mlRoi.mlPerformance', 'ML Performance')}
          </h2>
        </div>
        <div role="status" className="flex items-center justify-center py-4 gap-3">
          <div aria-hidden="true" className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <span className="text-stone-gray text-sm">{t('common.loadingData')}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-soft-gray flex items-center justify-center">
            <ThiingsIcon name="alert-triangle" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-deep-charcoal">{t('host.mlRoi.noDataYet', 'No ML Data Yet')}</h3>
            <p className="text-sm text-stone-gray">{t('host.mlRoi.startRecording', 'Start recording outcomes to see ROI')}</p>
          </div>
        </div>
      </div>
    );
  }

  const roiValue = parseInt(data.summary.total_roi);
  const meetsTarget = data.summary.meets_target;

  return (
    <div className="glass-panel">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full p-6 flex items-center justify-between hover:bg-soft-gray/50 transition-colors rounded-t-2xl"
      >
        <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
          <ThiingsIcon name="trending-up" size="sm" />
          ML Performance
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ThiingsIcon name="chevron-down" size="sm" />
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          {/* ROI Metric - Hero */}
          <div className={`p-4 rounded-2xl border-2 ${
            meetsTarget
              ? 'bg-rose-600/10 border-rose-600/30'
              : 'bg-amber-600/10 border-amber-600/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ThiingsIcon name="dollar" pxSize={24} />
                <div className="text-sm font-semibold text-stone-gray">{t('host.mlRoi.returnOnInvestment', 'Return on Investment')}</div>
                <HelpTooltip
                  title={t('host.mlRoi.whatIsRoi', 'What is ROI?')}
                  content={t('host.mlRoi.roiExplanation', 'For every {{currencyUnit}} you spend on interventions (calls, emails), how much money do you save from prevented no-shows?\n\nTarget: 300-500% ({{target3}} - {{target5}} saved per {{currencyUnit}} spent)\n\nExample:\n- Spent: {{exampleSpent}} on confirmation calls\n- Saved: {{exampleSaved}} from prevented no-shows\n- ROI: 704% ({{examplePer}} saved per {{currencyUnit}} spent)', {
                    currencyUnit: formatCurrency(1),
                    target3: formatCurrency(3),
                    target5: formatCurrency(5),
                    exampleSpent: formatCurrency(214),
                    exampleSaved: formatCurrency(1720),
                    examplePer: formatCurrency(7),
                  })}
                  position="bottom"
                />
              </div>
              {meetsTarget && (
                <span className="px-2 py-1 bg-rose-600/20 text-rose-600 text-xs rounded-full font-semibold">
                  {t('host.mlRoi.targetMet', 'Target Met!')}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`text-4xl font-bold ${meetsTarget ? 'text-rose-600' : 'text-amber-600'}`}>
                {roiValue}%
              </div>
              <div className="text-sm text-stone-gray">
                / {data.summary.target_roi} target
              </div>
            </div>
            <div className="mt-2 text-xs text-stone-gray">
              {formatCurrency(Number(data.summary.total_value_saved))} {t('host.mlRoi.saved', 'saved')} • {formatCurrency(Number(data.summary.total_cost))} {t('host.mlRoi.spent', 'spent')}
            </div>
          </div>

          {/* Success Rate */}
          <div className="flex items-center justify-between p-3 bg-burgundy/10 rounded-xl border border-burgundy/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-burgundy/20 rounded-xl flex items-center justify-center">
                <ThiingsIcon name="target" size="sm" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-stone-gray">Success Rate</div>
                  <HelpTooltip
                    title="Success Rate Explained"
                    content="Percentage of interventions that successfully prevented a no-show.

Calculation:
(Customers who showed up after intervention) ÷ (Total interventions)

Example:
• 34 interventions (calls made)
• 23 customers showed up
• Success Rate: 67.6%"
                    position="right"
                    size="sm"
                  />
                </div>
                <div className="text-sm text-stone-gray">Interventions worked</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">
              {data.intervention_effectiveness.success_rate}
            </div>
          </div>

          {/* Total Interventions */}
          <div className="flex items-center justify-between p-3 bg-violet-600/10 rounded-xl border border-violet-600/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center">
                <ThiingsIcon name="zap" size="sm" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-stone-gray">Total Interventions</div>
                  <HelpTooltip
                    title="What are Interventions?"
                    content="Actions taken to prevent no-shows based on ML risk predictions.

Types of Interventions:
• Confirmation calls
• Reminder emails/SMS
• Deposit requests
• Premium table upgrades

Each intervention has a cost and potential value saved."
                    position="right"
                    size="sm"
                  />
                </div>
                <div className="text-sm text-stone-gray">Actions taken</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">
              {data.intervention_effectiveness.interventions_with_action}
            </div>
          </div>

          {/* Outcomes Breakdown */}
          <div className="p-3 bg-soft-gray rounded-xl">
            <div className="text-xs font-semibold text-stone-gray mb-2">Outcomes</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-rose-600">{data.outcomes.showed_up}</div>
                <div className="text-xs text-stone-gray">Showed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-burgundy">{data.outcomes.no_show}</div>
                <div className="text-xs text-stone-gray">No-Show</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600">{data.outcomes.cancelled}</div>
                <div className="text-xs text-stone-gray">Cancelled</div>
              </div>
            </div>
          </div>

          {/* Link to full ML analytics */}
          <a
            href="/analytics#ml-metrics"
            className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 text-center text-sm bg-soft-gray hover:bg-border-gray text-stone-gray font-medium rounded-xl transition-colors group"
          >
            {t('host.mlRoi.viewFullAnalytics', 'View Full ML Analytics')}
            <ThiingsIcon name="arrow-right" size="xs" className="group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      )}
    </div>
  );
}
