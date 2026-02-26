import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './customerProfileHelpers';
import type { Profile } from './customerProfile.types';

interface CustomerProfileMetricsProps {
  profile: Profile | null;
}

export default function CustomerProfileMetrics({ profile }: CustomerProfileMetricsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ThiingsIcon name="dollar" pxSize={16} />
          <span className="text-xs text-stone-gray">Avg Check/Person</span>
        </div>
        <div className="text-2xl font-bold text-deep-charcoal">{formatCurrency(profile?.avg_check_per_person ?? null)}</div>
      </div>
      <div className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ThiingsIcon name="trending-up" size="xs" />
          <span className="text-xs text-stone-gray">Avg Tip</span>
        </div>
        <div className="text-2xl font-bold text-deep-charcoal">
          {profile?.tip_percentage_avg != null ? `${profile.tip_percentage_avg}%` : '--'}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ThiingsIcon name="clock" size="xs" />
          <span className="text-xs text-stone-gray">Avg Duration</span>
        </div>
        <div className="text-2xl font-bold text-deep-charcoal">
          {profile?.avg_dining_duration_minutes ? `${profile.avg_dining_duration_minutes}m` : '--'}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-border-gray p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ThiingsIcon name="users" size="xs" />
          <span className="text-xs text-stone-gray">Typical Party</span>
        </div>
        <div className="text-2xl font-bold text-deep-charcoal">
          {profile?.typical_party_size || '--'}
        </div>
      </div>
    </div>
  );
}
