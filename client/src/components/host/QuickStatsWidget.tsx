/**
 * Quick Stats Widget
 *
 * Displays key ML intervention metrics at a glance on the main dashboard
 * Shows today's interventions, weekly ROI, value saved, and success rate
 */

import { useState, useEffect } from 'react';
import { TrendingUp, Target, DollarSign, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface QuickStats {
  today_interventions: number;
  today_change: string;
  weekly_roi: number;
  roi_status: 'exceeds' | 'meets' | 'below';
  value_saved_30d: number;
  value_saved_trend: string;
  success_rate: number;
  success_status: 'good' | 'fair' | 'needs_improvement';
}

export default function QuickStatsWidget() {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuickStats();
    // Refresh every 5 minutes
    const interval = setInterval(fetchQuickStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchQuickStats = async () => {
    try {
      const response = await fetch('/api/ml-performance?action=quick-stats');
      const result = await response.json();

      if (result.success) {
        setStats(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch stats');
      }
    } catch (err) {
      console.error('Error fetching quick stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-4 shadow-md">
        <div className="flex items-center gap-2 text-[#57534E]">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">ML stats temporarily unavailable</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-[#E7E5E4] p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-[#F5F5F4] rounded animate-pulse"></div>
          <div className="h-5 w-32 bg-[#F5F5F4] rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-[#F5F5F4] rounded animate-pulse"></div>
              <div className="h-8 w-16 bg-[#F5F5F4] rounded animate-pulse"></div>
              <div className="h-3 w-20 bg-[#F5F5F4] rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const getRoiColor = (status: string) => {
    switch (status) {
      case 'exceeds': return 'text-[#16a34a]';
      case 'meets': return 'text-[#16a34a]';
      case 'below': return 'text-[#d97706]';
      default: return 'text-[#1C1917]';
    }
  };

  const getSuccessColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-[#16a34a]';
      case 'fair': return 'text-[#d97706]';
      case 'needs_improvement': return 'text-[#9F1239]';
      default: return 'text-[#1C1917]';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E7E5E4] shadow-md">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#F5F5F4] transition-colors rounded-t-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#9F1239]/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-[#9F1239]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">ML Performance Snapshot</h3>
            <p className="text-xs text-[#A8A29E]">Real-time intervention analytics</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-[#57534E]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#57534E]" />
        )}
      </div>

      {/* Stats Grid */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Today's Interventions */}
            <div className="bg-[#F5F5F4] rounded-lg p-3 border border-[#E7E5E4]">
              <div className="text-[10px] font-medium text-[#A8A29E] uppercase tracking-wide mb-1">
                Today
              </div>
              <div className="text-2xl font-bold text-[#1C1917]">
                {stats.today_interventions}
              </div>
              <div className="text-[10px] text-[#57534E] truncate">
                {stats.today_change}
              </div>
            </div>

            {/* Weekly ROI */}
            <div className="bg-[#F5F5F4] rounded-lg p-3 border border-[#E7E5E4]">
              <div className="text-[10px] font-medium text-[#A8A29E] uppercase tracking-wide mb-1">
                7-Day ROI
              </div>
              <div className={`text-2xl font-bold ${getRoiColor(stats.roi_status)}`}>
                {stats.weekly_roi}%
              </div>
              <div className="text-[10px] text-[#57534E] truncate">
                {stats.roi_status === 'exceeds' && '🎯 Exceeds target'}
                {stats.roi_status === 'meets' && '✓ Meets target'}
                {stats.roi_status === 'below' && '⚠️ Below target'}
              </div>
            </div>

            {/* Value Saved */}
            <div className="bg-[#F5F5F4] rounded-lg p-3 border border-[#E7E5E4]">
              <div className="text-[10px] font-medium text-[#A8A29E] uppercase tracking-wide mb-1">
                30-Day Saved
              </div>
              <div className="text-2xl font-bold text-[#1C1917]">
                €{stats.value_saved_30d.toFixed(0)}
              </div>
              <div className="text-[10px] text-[#57534E] truncate">
                {stats.value_saved_trend}
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-[#F5F5F4] rounded-lg p-3 border border-[#E7E5E4]">
              <div className="text-[10px] font-medium text-[#A8A29E] uppercase tracking-wide mb-1">
                Success Rate
              </div>
              <div className={`text-2xl font-bold ${getSuccessColor(stats.success_status)}`}>
                {stats.success_rate}%
              </div>
              <div className="text-[10px] text-[#57534E] truncate">
                {stats.success_status === 'good' && '✓ Excellent'}
                {stats.success_status === 'fair' && 'Good'}
                {stats.success_status === 'needs_improvement' && 'Needs attention'}
              </div>
            </div>
          </div>

          {/* Quick Action Link */}
          <div className="mt-4 pt-4 border-t border-[#E7E5E4]">
            <a
              href="/host-dashboard/ml"
              className="text-sm text-[#9F1239] hover:text-[#881337] font-medium flex items-center gap-1 transition-colors"
            >
              View detailed analytics
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
