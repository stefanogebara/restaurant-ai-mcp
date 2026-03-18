/**
 * Quick Stats Widget
 *
 * Displays key ML intervention metrics at a glance on the main dashboard
 * Horizontal full-width layout showing today's interventions, weekly ROI, value saved, and success rate
 */

import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import { useQuickStats } from '../../hooks/useMLPerformance';

export default function QuickStatsWidget() {
  const { data: stats, isLoading, isError } = useQuickStats();

  if (isError) {
    return (
      <div className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-2 text-warm-stone">
          <ThiingsIcon name="alert-circle" size="xs" />
          <span className="text-sm">ML stats temporarily unavailable</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading stats" className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 bg-soft-gray rounded animate-pulse"></div>
          <div className="h-4 w-32 bg-soft-gray rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-soft-gray rounded animate-pulse"></div>
              <div className="h-7 w-16 bg-soft-gray rounded animate-pulse"></div>
              <div className="h-3 w-24 bg-soft-gray rounded animate-pulse"></div>
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
    if (!hasData) return 'text-warm-stone';
    switch (status) {
      case 'exceeds': return 'text-rose-600';
      case 'meets': return 'text-rose-600';
      case 'below': return 'text-amber-600';
      default: return 'text-deep-charcoal';
    }
  };

  const getRoiBg = (status: string) => {
    if (!hasData) return 'bg-warm-white';
    switch (status) {
      case 'exceeds': return 'bg-rose-50';
      case 'meets': return 'bg-rose-50';
      case 'below': return 'bg-amber-50';
      default: return 'bg-soft-gray';
    }
  };

  const getSuccessColor = (status: string) => {
    if (!hasData) return 'text-warm-stone';
    switch (status) {
      case 'good': return 'text-rose-600';
      case 'fair': return 'text-amber-600';
      case 'needs_improvement': return 'text-red-600';
      default: return 'text-deep-charcoal';
    }
  };

  const getSuccessBg = (status: string) => {
    if (!hasData) return 'bg-warm-white';
    switch (status) {
      case 'good': return 'bg-rose-50';
      case 'fair': return 'bg-amber-50';
      case 'needs_improvement': return 'bg-red-50';
      default: return 'bg-soft-gray';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border-gray shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray bg-soft-gray/30">
        <div className="flex items-center gap-2">
          <ThiingsIcon name="target" size="sm" />
          <span className="font-semibold text-deep-charcoal">ML Performance Snapshot</span>
        </div>
        <Link
          to="/host-dashboard/ml"
          className="text-sm text-burgundy hover:text-burgundy-dark font-medium flex items-center gap-1 transition-colors"
        >
          View Details
          <ThiingsIcon name="external-link" size="xs" />
        </Link>
      </div>

      {/* Stats Grid - Horizontal */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Today's Interventions */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="target" size="xs" />
              </div>
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Today</span>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">
              {stats.today_interventions}
            </div>
            <div className="text-xs text-warm-stone mt-1">
              {stats.today_change}
            </div>
          </div>

          {/* Weekly ROI */}
          <div className={`${getRoiBg(stats.roi_status)} rounded-xl p-4 border ${!hasData ? 'border-border-gray' : 'border-rose-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 ${!hasData ? 'bg-soft-gray' : stats.roi_status === 'below' ? 'bg-amber-100' : 'bg-rose-100'} rounded-lg flex items-center justify-center`}>
                <ThiingsIcon name="trending-up" size="xs" />
              </div>
              <span className={`text-xs font-medium uppercase tracking-wide ${getRoiColor(stats.roi_status)}`}>7-Day ROI</span>
            </div>
            <div className={`text-2xl font-bold ${getRoiColor(stats.roi_status)}`}>
              {stats.weekly_roi}%
            </div>
            <div className="text-xs text-warm-stone mt-1">
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
          <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
                <ThiingsIcon name="dollar" size="xs" />
              </div>
              <span className="text-xs font-medium text-rose-600 uppercase tracking-wide">30-Day Saved</span>
            </div>
            <div className="text-2xl font-bold text-deep-charcoal">
              {'\u20AC'}{stats.value_saved_30d.toFixed(0)}
            </div>
            <div className="text-xs text-warm-stone mt-1">
              {stats.value_saved_trend}
            </div>
          </div>

          {/* Success Rate */}
          <div className={`${getSuccessBg(stats.success_status)} rounded-xl p-4 border ${!hasData ? 'border-border-gray' : stats.success_status === 'good' ? 'border-rose-100' : stats.success_status === 'fair' ? 'border-amber-100' : 'border-red-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 ${!hasData ? 'bg-soft-gray' : stats.success_status === 'good' ? 'bg-rose-100' : stats.success_status === 'fair' ? 'bg-amber-100' : 'bg-red-100'} rounded-lg flex items-center justify-center`}>
                <ThiingsIcon name="check-circle" size="xs" />
              </div>
              <span className={`text-xs font-medium uppercase tracking-wide ${getSuccessColor(stats.success_status)}`}>Success Rate</span>
            </div>
            <div className={`text-2xl font-bold ${getSuccessColor(stats.success_status)}`}>
              {stats.success_rate}%
            </div>
            <div className="text-xs text-warm-stone mt-1">
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
