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
      // Get restaurant_id from localStorage for multi-tenant filtering
      const restaurant_id = localStorage.getItem('restaurant_id') || '';
      const restaurantParam = restaurant_id ? `&restaurant_id=${restaurant_id}` : '';

      const response = await fetch(`/api/ml-performance?action=quick-stats${restaurantParam}`);
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
    <div className="bg-white rounded-lg border border-[#E7E5E4] shadow-sm overflow-hidden">
      {/* Compact Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#F5F5F4] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Target className="w-4 h-4 text-[#9F1239] flex-shrink-0" />
          <span className="text-sm font-medium text-[#1C1917] truncate">ML Snapshot</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-[#57534E] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#57534E] flex-shrink-0" />
        )}
      </div>

      {/* Stats Grid - Compact */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Today's Interventions */}
            <div className="bg-[#F5F5F4] rounded p-2 border border-[#E7E5E4] min-w-0">
              <div className="text-[9px] font-medium text-[#A8A29E] uppercase tracking-wide">
                Today
              </div>
              <div className="text-lg font-bold text-[#1C1917] truncate">
                {stats.today_interventions}
              </div>
              <div className="text-[9px] text-[#57534E] truncate">
                {stats.today_change}
              </div>
            </div>

            {/* Weekly ROI */}
            <div className="bg-[#F5F5F4] rounded p-2 border border-[#E7E5E4] min-w-0">
              <div className="text-[9px] font-medium text-[#A8A29E] uppercase tracking-wide">
                7-Day ROI
              </div>
              <div className={`text-lg font-bold truncate ${getRoiColor(stats.roi_status)}`}>
                {stats.weekly_roi}%
              </div>
              <div className="text-[9px] text-[#57534E] truncate">
                {stats.roi_status === 'exceeds' && 'Exceeds'}
                {stats.roi_status === 'meets' && 'On target'}
                {stats.roi_status === 'below' && 'Below'}
              </div>
            </div>

            {/* Value Saved */}
            <div className="bg-[#F5F5F4] rounded p-2 border border-[#E7E5E4] min-w-0">
              <div className="text-[9px] font-medium text-[#A8A29E] uppercase tracking-wide">
                30-Day
              </div>
              <div className="text-lg font-bold text-[#1C1917] truncate">
                €{stats.value_saved_30d.toFixed(0)}
              </div>
              <div className="text-[9px] text-[#57534E] truncate">
                {stats.value_saved_trend}
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-[#F5F5F4] rounded p-2 border border-[#E7E5E4] min-w-0">
              <div className="text-[9px] font-medium text-[#A8A29E] uppercase tracking-wide">
                Success
              </div>
              <div className={`text-lg font-bold truncate ${getSuccessColor(stats.success_status)}`}>
                {stats.success_rate}%
              </div>
              <div className="text-[9px] text-[#57534E] truncate">
                {stats.success_status === 'good' && 'Excellent'}
                {stats.success_status === 'fair' && 'Good'}
                {stats.success_status === 'needs_improvement' && 'Improve'}
              </div>
            </div>
          </div>

          {/* Compact Link */}
          <a
            href="/host-dashboard/ml"
            className="mt-2 pt-2 border-t border-[#E7E5E4] text-xs text-[#9F1239] hover:text-[#881337] font-medium flex items-center gap-1"
          >
            View details →
          </a>
        </div>
      )}
    </div>
  );
}
