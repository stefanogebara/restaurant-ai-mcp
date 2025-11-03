/**
 * ML ROI Widget
 *
 * Replaces QuickStats with ML-focused metrics
 * Displays real-time ROI, intervention effectiveness, and ML performance
 */

import { useState, useEffect } from 'react';
import { TrendingUp, Target, Zap, DollarSign, AlertTriangle, ArrowRight } from 'lucide-react';

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
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            ML Performance
          </h2>
        </div>
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">No ML Data Yet</h3>
            <p className="text-sm text-muted-foreground">Start recording outcomes to see ROI</p>
          </div>
        </div>
      </div>
    );
  }

  const roiValue = parseInt(data.summary.total_roi);
  const targetValue = parseInt(data.summary.target_roi.split('-')[0]); // Get 300 from "300-500%"
  const meetsTarget = data.summary.meets_target;

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors rounded-t-lg"
      >
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          ML Performance
        </h2>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className={`w-6 h-6 ${meetsTarget ? 'text-emerald-500' : 'text-amber-500'}`} />
                <div className="text-sm font-semibold text-muted-foreground">Return on Investment</div>
              </div>
              {meetsTarget && (
                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-semibold">
                  Target Met!
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`text-4xl font-bold ${meetsTarget ? 'text-emerald-400' : 'text-amber-400'}`}>
                {roiValue}%
              </div>
              <div className="text-sm text-muted-foreground">
                / {data.summary.target_roi} target
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              €{data.summary.total_value_saved} saved • €{data.summary.total_cost} spent
            </div>
          </div>

          {/* Success Rate */}
          <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
                <div className="text-sm text-muted-foreground">Interventions worked</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {data.intervention_effectiveness.success_rate}
            </div>
          </div>

          {/* Total Interventions */}
          <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Interventions</div>
                <div className="text-sm text-muted-foreground">Actions taken</div>
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {data.intervention_effectiveness.interventions_with_action}
            </div>
          </div>

          {/* Outcomes Breakdown */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Outcomes</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400">{data.outcomes.showed_up}</div>
                <div className="text-xs text-muted-foreground">Showed</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-400">{data.outcomes.no_show}</div>
                <div className="text-xs text-muted-foreground">No-Show</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-400">{data.outcomes.cancelled}</div>
                <div className="text-xs text-muted-foreground">Cancelled</div>
              </div>
            </div>
          </div>

          {/* Link to full ML analytics */}
          <a
            href="/analytics#ml-metrics"
            className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2 text-center text-sm bg-muted hover:bg-muted/80 text-muted-foreground font-medium rounded-lg transition-colors group"
          >
            View Full ML Analytics
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      )}
    </div>
  );
}
