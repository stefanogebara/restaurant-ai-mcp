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
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">ML stats temporarily unavailable</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-muted rounded animate-pulse"></div>
          <div className="h-5 w-32 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
              <div className="h-8 w-16 bg-muted rounded animate-pulse"></div>
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const getRoiColor = (status: string) => {
    switch (status) {
      case 'exceeds': return 'text-emerald-500';
      case 'meets': return 'text-green-500';
      case 'below': return 'text-yellow-500';
      default: return 'text-foreground';
    }
  };

  const getSuccessColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-emerald-500';
      case 'fair': return 'text-yellow-500';
      case 'needs_improvement': return 'text-orange-500';
      default: return 'text-foreground';
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">ML Performance Snapshot</h3>
            <p className="text-xs text-muted-foreground">Real-time intervention analytics</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Stats Grid */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Today's Interventions */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Today
                </span>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">
                {stats.today_interventions}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.today_change}
              </div>
            </div>

            {/* Weekly ROI */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  7-Day ROI
                </span>
              </div>
              <div className={`text-3xl font-bold mb-1 ${getRoiColor(stats.roi_status)}`}>
                {stats.weekly_roi}%
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.roi_status === 'exceeds' && '🎯 Exceeds target'}
                {stats.roi_status === 'meets' && '✓ Meets target'}
                {stats.roi_status === 'below' && '⚠️ Below 300% target'}
              </div>
            </div>

            {/* Value Saved */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  30-Day Saved
                </span>
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">
                €{stats.value_saved_30d.toFixed(0)}
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.value_saved_trend}
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Success Rate
                </span>
              </div>
              <div className={`text-3xl font-bold mb-1 ${getSuccessColor(stats.success_status)}`}>
                {stats.success_rate}%
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.success_status === 'good' && '✓ Excellent'}
                {stats.success_status === 'fair' && 'Good'}
                {stats.success_status === 'needs_improvement' && 'Needs attention'}
              </div>
            </div>
          </div>

          {/* Quick Action Link */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <a
              href="/host-dashboard/ml"
              className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
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
