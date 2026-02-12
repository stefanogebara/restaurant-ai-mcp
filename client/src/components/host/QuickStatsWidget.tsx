/**
 * Quick Stats Widget
 *
 * Displays key ML intervention metrics at a glance on the main dashboard
 * Horizontal full-width layout showing today's interventions, weekly ROI, value saved, and success rate
 */

import { useState, useEffect } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

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

      const response = await authFetch(`/api/ml-performance?action=quick-stats${restaurantParam}`);
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
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ThiingsIcon name="alert-circle" size="xs" />
          <span className="text-sm">ML stats temporarily unavailable</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-32 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
              <div className="h-7 w-16 bg-muted rounded animate-pulse"></div>
              <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Check if there's no meaningful data yet (0 interventions = no data to evaluate)
  const hasData = stats.today_interventions > 0 || stats.value_saved_30d > 0;

  const getRoiColor = (status: string) => {
    if (!hasData) return 'text-gray-500';
    switch (status) {
      case 'exceeds': return 'text-green-600';
      case 'meets': return 'text-green-600';
      case 'below': return 'text-amber-600';
      default: return 'text-foreground';
    }
  };

  const getRoiBg = (status: string) => {
    if (!hasData) return 'bg-gray-50';
    switch (status) {
      case 'exceeds': return 'bg-green-50';
      case 'meets': return 'bg-green-50';
      case 'below': return 'bg-amber-50';
      default: return 'bg-muted';
    }
  };

  const getSuccessColor = (status: string) => {
    if (!hasData) return 'text-gray-500';
    switch (status) {
      case 'good': return 'text-green-600';
      case 'fair': return 'text-amber-600';
      case 'needs_improvement': return 'text-red-600';
      default: return 'text-foreground';
    }
  };

  const getSuccessBg = (status: string) => {
    if (!hasData) return 'bg-gray-50';
    switch (status) {
      case 'good': return 'bg-green-50';
      case 'fair': return 'bg-amber-50';
      case 'needs_improvement': return 'bg-red-50';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <ThiingsIcon name="target" size="sm" />
          <span className="font-semibold text-foreground">ML Performance Snapshot</span>
        </div>
        <a
          href="/host-dashboard/ml"
          className="text-sm text-[#9F1239] hover:text-[#881337] font-medium flex items-center gap-1 transition-colors"
        >
          View Details
          <ThiingsIcon name="external-link" size="xs" />
        </a>
      </div>

      {/* Stats Grid - Horizontal */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Today's Interventions */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="target" size="xs" />
              </div>
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Today</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {stats.today_interventions}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.today_change}
            </div>
          </div>

          {/* Weekly ROI */}
          <div className={`${getRoiBg(stats.roi_status)} rounded-lg p-4 border ${!hasData ? 'border-gray-200' : 'border-green-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 ${!hasData ? 'bg-gray-100' : stats.roi_status === 'below' ? 'bg-amber-100' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
                <ThiingsIcon name="trending-up" size="xs" />
              </div>
              <span className={`text-xs font-medium uppercase tracking-wide ${getRoiColor(stats.roi_status)}`}>7-Day ROI</span>
            </div>
            <div className={`text-2xl font-bold ${getRoiColor(stats.roi_status)}`}>
              {stats.weekly_roi}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {!hasData ? 'Awaiting data' : (
                <>
                  {stats.roi_status === 'exceeds' && 'Exceeds target'}
                  {stats.roi_status === 'meets' && 'On target'}
                  {stats.roi_status === 'below' && 'Below target'}
                </>
              )}
            </div>
          </div>

          {/* Value Saved */}
          <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="dollar" size="xs" />
              </div>
              <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">30-Day Saved</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {'\u20AC'}{stats.value_saved_30d.toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.value_saved_trend}
            </div>
          </div>

          {/* Success Rate */}
          <div className={`${getSuccessBg(stats.success_status)} rounded-lg p-4 border ${!hasData ? 'border-gray-200' : stats.success_status === 'good' ? 'border-green-100' : stats.success_status === 'fair' ? 'border-amber-100' : 'border-red-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 ${!hasData ? 'bg-gray-100' : stats.success_status === 'good' ? 'bg-green-100' : stats.success_status === 'fair' ? 'bg-amber-100' : 'bg-red-100'} rounded-lg flex items-center justify-center`}>
                <ThiingsIcon name="check-circle" size="xs" />
              </div>
              <span className={`text-xs font-medium uppercase tracking-wide ${getSuccessColor(stats.success_status)}`}>Success Rate</span>
            </div>
            <div className={`text-2xl font-bold ${getSuccessColor(stats.success_status)}`}>
              {stats.success_rate}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {!hasData ? 'Awaiting data' : (
                <>
                  {stats.success_status === 'good' && 'Excellent performance'}
                  {stats.success_status === 'fair' && 'Room to improve'}
                  {stats.success_status === 'needs_improvement' && 'Needs attention'}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
