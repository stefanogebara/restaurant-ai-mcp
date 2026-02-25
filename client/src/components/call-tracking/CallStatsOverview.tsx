import { Stats } from './callTrackingTypes';

interface Props {
  stats: Stats;
}

export default function CallStatsOverview({ stats }: Props) {
  const { overview } = stats;
  const conversionRate = overview.total_calls > 0
    ? Math.round((overview.successful_bookings / overview.total_calls) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">Total Calls Today</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">
          {overview.total_calls}
        </div>
        <div className="text-xs text-warm-stone mt-1">{overview.successful_bookings} successful bookings</div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">Success Rate</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-green-600">
          {overview.success_rate}%
        </div>
        <div className="text-xs text-warm-stone mt-1">
          {overview.successful_bookings} of {overview.total_calls} calls resolved
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">Avg Duration</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">
          {overview.average_duration_formatted}
        </div>
        <div className="text-xs text-warm-stone mt-1">minutes per call</div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">Bookings via Call</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-burgundy">
          {overview.successful_bookings}
        </div>
        <div className="text-xs text-warm-stone mt-1">
          {overview.total_calls > 0
            ? `${conversionRate}% conversion rate`
            : 'No calls yet'}
        </div>
      </div>
    </div>
  );
}
