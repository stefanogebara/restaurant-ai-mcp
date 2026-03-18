import HelpTooltip from '../common/HelpTooltip';
import { getTierColor, getTierBgColor, getTierIcon } from './ltvHelpers';
import { LTV_TIERS } from '../../config/businessDefaults';
import type { LTVStats } from './ltvDashboard.types';

interface LTVTierBreakdownProps {
  tiers: LTVStats['tiers'];
}

export default function LTVTierBreakdown({ tiers }: LTVTierBreakdownProps) {
  const totalTierCustomers = Object.values(tiers).reduce((sum, count) => sum + count, 0);

  return (
    <div className="p-4 bg-soft-gray rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-deep-charcoal">Customer Segments</h3>
          <HelpTooltip
            title="Customer Segments"
            content={`VIP (${LTV_TIERS.vip.label}): Top 10% - Priority reservations, special offers
Regular (${LTV_TIERS.regular.label}): Core customers - Loyalty rewards
Occasional (${LTV_TIERS.occasional.label}): Potential for growth - Engagement campaigns
New (${LTV_TIERS.new.label}): First-time diners - Welcome offers
At Risk: Haven't visited in 90+ days - Win-back campaigns`}
            position="right"
            size="sm"
          />
        </div>
        <span className="text-xs text-stone-gray">{totalTierCustomers} total</span>
      </div>
      <div className="space-y-2">
        {Object.entries(tiers).map(([tier, count]) => {
          const percentage = totalTierCustomers > 0 ? (count / totalTierCustomers) * 100 : 0;
          return (
            <div key={tier} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${getTierBgColor(tier)} border`}>
                <span className={getTierColor(tier)}>{getTierIcon(tier)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-deep-charcoal capitalize">{tier}</span>
                  <span className="text-sm text-stone-gray">{count} ({percentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tier === 'vip' ? 'bg-violet-600' : tier === 'regular' ? 'bg-burgundy' : tier === 'occasional' ? 'bg-green-600' : tier === 'new' ? 'bg-stone-gray' : 'bg-amber-600'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
