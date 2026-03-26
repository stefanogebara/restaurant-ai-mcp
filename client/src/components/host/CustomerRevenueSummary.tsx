import ThiingsIcon from '../common/ThiingsIcon';
import type { RevenueSummary, Profile } from './customerProfile.types';

interface CustomerRevenueSummaryProps {
  revenueSummary: RevenueSummary;
  profile: Profile | null;
}

export default function CustomerRevenueSummary({ revenueSummary, profile }: CustomerRevenueSummaryProps) {
  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6">
      <h2 className="text-lg font-semibold font-serif text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="dollar" size="sm" />
        Revenue Summary
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-amber-600/5 rounded-xl">
            <div className="text-xs text-stone-gray">Total Revenue</div>
            <div className="text-xl font-bold text-deep-charcoal">&euro;{revenueSummary.total_revenue.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-amber-600/5 rounded-xl">
            <div className="text-xs text-stone-gray">Avg per Visit</div>
            <div className="text-xl font-bold text-deep-charcoal">&euro;{revenueSummary.avg_revenue.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-amber-600/5 rounded-xl">
            <div className="text-xs text-stone-gray">Total Tips</div>
            <div className="text-xl font-bold text-deep-charcoal">&euro;{revenueSummary.total_tips.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-amber-600/5 rounded-xl">
            <div className="text-xs text-stone-gray">Revenue Visits</div>
            <div className="text-xl font-bold text-deep-charcoal">{revenueSummary.total_visits_with_revenue}</div>
          </div>
        </div>

        {(profile?.orders_appetizers_pct != null || profile?.orders_desserts_pct != null || profile?.orders_wine_pct != null) && (
          <div>
            <div className="text-sm font-medium text-deep-charcoal mb-2">Ordering Patterns</div>
            <div className="space-y-2">
              {profile?.orders_appetizers_pct != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-gray w-24">Appetizers</span>
                  <div className="flex-1 bg-soft-gray h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-600" style={{ width: `${profile.orders_appetizers_pct}%` }} />
                  </div>
                  <span className="text-xs text-stone-gray w-10 text-right">{profile.orders_appetizers_pct}%</span>
                </div>
              )}
              {profile?.orders_desserts_pct != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-gray w-24">Desserts</span>
                  <div className="flex-1 bg-soft-gray h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-burgundy" style={{ width: `${profile.orders_desserts_pct}%` }} />
                  </div>
                  <span className="text-xs text-stone-gray w-10 text-right">{profile.orders_desserts_pct}%</span>
                </div>
              )}
              {profile?.orders_wine_pct != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-gray w-24">Wine</span>
                  <div className="flex-1 bg-soft-gray h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600" style={{ width: `${profile.orders_wine_pct}%` }} />
                  </div>
                  <span className="text-xs text-stone-gray w-10 text-right">{profile.orders_wine_pct}%</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
