/**
 * UsageStatsCard
 *
 * Displays current month's usage metrics for metered billing.
 * Shows each tracked metric with its count and a total.
 */

import { useUsageStats, getMetricLabel } from '../../hooks/useUsageStats';
import { usePlanInfo } from '../../hooks/useSubscription';

export default function UsageStatsCard() {
  const { data, isLoading, error } = useUsageStats();
  const { planName, isTrial } = usePlanInfo();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border-gray p-5">
        <h3 className="text-sm font-semibold text-warm-stone uppercase tracking-wider mb-3">
          Usage This Month
        </h3>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-border-gray rounded w-3/4" />
          <div className="h-4 bg-border-gray rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return null; // Silently hide if usage tracking isn't set up
  }

  const metrics = data.usage || [];
  const totalEvents = metrics.reduce((sum, m) => sum + m.total_count, 0);

  return (
    <div className="bg-white rounded-xl border border-border-gray p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-warm-stone uppercase tracking-wider">
          Usage This Month
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy font-medium">
          {planName}{isTrial ? ' (Trial)' : ''}
        </span>
      </div>

      {metrics.length === 0 ? (
        <p className="text-sm text-muted-stone">No usage recorded yet</p>
      ) : (
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div key={metric.metric_type} className="flex items-center justify-between">
              <span className="text-sm text-stone-gray">
                {getMetricLabel(metric.metric_type)}
              </span>
              <span className="text-sm font-semibold text-deep-charcoal tabular-nums">
                {metric.total_count.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="border-t border-border-gray/50 pt-2 mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-stone-gray">Total Events</span>
            <span className="text-sm font-bold text-deep-charcoal tabular-nums">
              {totalEvents.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
