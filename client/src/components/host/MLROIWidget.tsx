/**
 * ML ROI Widget
 *
 * Replaces QuickStats with ML-focused metrics
 * Displays real-time ROI, intervention effectiveness, and ML performance
 */

import { useState, useEffect } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import HelpTooltip from '../common/HelpTooltip';

interface MLROIData {
  summary: {
    total_interventions: number;
    total_cost: string;
    total_value_saved: string;
    total_roi: string;
    target_roi: string;
    meets_target: boolean;
  };
  outcomes: {
    showed_up: number;
    no_show: number;
    cancelled: number;
  };
  intervention_effectiveness: {
    interventions_with_action: number;
    successful_interventions: number;
    success_rate: string;
  };
}

export default function MLROIWidget() {
  const [data, setData] = useState<MLROIData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchMLROI();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMLROI, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMLROI = async () => {
    try {
      const response = await authFetch('/api/ml-outcomes?action=roi-summary');
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching ML ROI:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-border-gray">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-deep-charcoal flex items-center gap-2">
            <ThiingsIcon name="trending-up" size="sm" />
            ML Performance
          </h2>
        </div>
        <div className="flex items-center justify-center py-4 gap-3">
          <div className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <span className="text-stone-gray text-sm">Loading data...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-border-gray">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-soft-gray flex items-center justify-center">
            <ThiingsIcon name="alert-triangle" pxSize={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-deep-charcoal">No ML Data Yet</h3>
            <p className="text-sm text-stone-gray">Start recording outcomes to see ROI</p>
          </div>
        </div>
      </div>
    );
  }

  const roiValue = parseInt(data.summary.total_roi);
  const meetsTarget = data.summary.meets_target;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-border-gray">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
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
          <div className={`p-4 rounded-xl border-2 ${
            meetsTarget
              ? 'bg-green-600/10 border-green-600/30'
              : 'bg-amber-600/10 border-amber-600/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ThiingsIcon name="dollar" pxSize={24} />
                <div className="text-sm font-semibold text-stone-gray">Return on Investment</div>
                <HelpTooltip
                  title="What is ROI?"
                  content="For every €1 you spend on interventions (calls, emails), how much money do you save from prevented no-shows?

Target: 300-500% (€3-€5 saved per €1 spent)

Example:
• Spent: €214 on confirmation calls
• Saved: €1,720 from prevented no-shows
• ROI: 704% (€7.04 saved per €1 spent)"
                  position="bottom"
                />
              </div>
              {meetsTarget && (
                <span className="px-2 py-1 bg-green-600/20 text-green-600 text-xs rounded-full font-semibold">
                  Target Met!
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`text-4xl font-bold ${meetsTarget ? 'text-green-600' : 'text-amber-600'}`}>
                {roiValue}%
              </div>
              <div className="text-sm text-stone-gray">
                / {data.summary.target_roi} target
              </div>
            </div>
            <div className="mt-2 text-xs text-stone-gray">
              €{data.summary.total_value_saved} saved • €{data.summary.total_cost} spent
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
                <div className="text-lg font-bold text-green-600">{data.outcomes.showed_up}</div>
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
            View Full ML Analytics
            <ThiingsIcon name="arrow-right" size="xs" className="group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      )}
    </div>
  );
}
