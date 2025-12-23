/**
 * ML ROI Widget
 *
 * Replaces QuickStats with ML-focused metrics
 * Displays real-time ROI, intervention effectiveness, and ML performance
 */

import { useState, useEffect } from 'react';
import { TrendingUp, Target, Zap, DollarSign, AlertTriangle, ArrowRight } from 'lucide-react';
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
      const response = await fetch('/api/ml-outcomes?action=roi-summary');
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
      <div className="bg-white rounded-xl shadow-lg p-6 border border-[#E7E5E4]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            ML Performance
          </h2>
        </div>
        <div className="text-center py-4 text-[#57534E]">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-[#E7E5E4]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F4] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#57534E]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">No ML Data Yet</h3>
            <p className="text-sm text-[#57534E]">Start recording outcomes to see ROI</p>
          </div>
        </div>
      </div>
    );
  }

  const roiValue = parseInt(data.summary.total_roi);
  const meetsTarget = data.summary.meets_target;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#E7E5E4]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-[#F5F5F4]/50 transition-colors rounded-t-xl"
      >
        <h2 className="text-xl font-bold text-[#1C1917] flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#16a34a]" />
          ML Performance
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-[#57534E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-3">
          {/* ROI Metric - Hero */}
          <div className={`p-4 rounded-xl border-2 ${
            meetsTarget
              ? 'bg-[#16a34a]/10 border-[#16a34a]/30'
              : 'bg-[#d97706]/10 border-[#d97706]/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className={`w-6 h-6 ${meetsTarget ? 'text-[#16a34a]' : 'text-[#d97706]'}`} />
                <div className="text-sm font-semibold text-[#57534E]">Return on Investment</div>
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
                <span className="px-2 py-1 bg-[#16a34a]/20 text-[#16a34a] text-xs rounded-full font-semibold">
                  Target Met!
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`text-4xl font-bold ${meetsTarget ? 'text-[#16a34a]' : 'text-[#d97706]'}`}>
                {roiValue}%
              </div>
              <div className="text-sm text-[#57534E]">
                / {data.summary.target_roi} target
              </div>
            </div>
            <div className="mt-2 text-xs text-[#57534E]">
              €{data.summary.total_value_saved} saved • €{data.summary.total_cost} spent
            </div>
          </div>

          {/* Success Rate */}
          <div className="flex items-center justify-between p-3 bg-[#9F1239]/10 rounded-xl border border-[#9F1239]/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#9F1239]/20 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-[#9F1239]" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-[#57534E]">Success Rate</div>
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
                <div className="text-sm text-[#57534E]">Interventions worked</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">
              {data.intervention_effectiveness.success_rate}
            </div>
          </div>

          {/* Total Interventions */}
          <div className="flex items-center justify-between p-3 bg-[#7c3aed]/10 rounded-xl border border-[#7c3aed]/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#7c3aed]/20 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#7c3aed]" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-xs text-[#57534E]">Total Interventions</div>
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
                <div className="text-sm text-[#57534E]">Actions taken</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1C1917]">
              {data.intervention_effectiveness.interventions_with_action}
            </div>
          </div>

          {/* Outcomes Breakdown */}
          <div className="p-3 bg-[#F5F5F4] rounded-xl">
            <div className="text-xs font-semibold text-[#57534E] mb-2">Outcomes</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-[#16a34a]">{data.outcomes.showed_up}</div>
                <div className="text-xs text-[#57534E]">Showed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#9F1239]">{data.outcomes.no_show}</div>
                <div className="text-xs text-[#57534E]">No-Show</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#d97706]">{data.outcomes.cancelled}</div>
                <div className="text-xs text-[#57534E]">Cancelled</div>
              </div>
            </div>
          </div>

          {/* Link to full ML analytics */}
          <a
            href="/analytics#ml-metrics"
            className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 text-center text-sm bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#57534E] font-medium rounded-xl transition-colors group"
          >
            View Full ML Analytics
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      )}
    </div>
  );
}
