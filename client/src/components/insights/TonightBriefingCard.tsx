import ThiingsIcon from '../common/ThiingsIcon';
import { useNoShowPredictions } from '../../hooks/usePredictiveAnalytics';

export default function TonightBriefingCard() {
  const { data, isLoading } = useNoShowPredictions();
  const predictions = data?.predictions ?? [];
  const summary = data?.summary ?? null;

  const tonightPredictions = predictions.filter((p) => p.days_until === 0);
  const highRiskTonight = tonightPredictions.filter((p) => p.risk_level === 'high');
  const totalTonight = summary?.total_upcoming ?? 0;

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-6 shadow-sm">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-border-gray flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name="star" pxSize={16} className="text-amber-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-deep-charcoal">Tonight's Briefing</h2>
          <p className="text-xs text-warm-stone">Reservations for today</p>
        </div>
      </div>

      <div className="p-5">
        {/* Summary row */}
        <div className="flex items-center gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-deep-charcoal">{totalTonight}</div>
            <div className="text-xs text-warm-stone">Tonight</div>
          </div>
          <div className="w-px h-8 bg-border-gray" />
          <div className="text-center">
            <div className={`text-2xl font-bold ${highRiskTonight.length > 0 ? 'text-red-600' : 'text-stone-400'}`}>{highRiskTonight.length}</div>
            <div className="text-xs text-warm-stone">High Risk</div>
          </div>
          {summary && (
            <>
              <div className="w-px h-8 bg-border-gray" />
              <div className="text-center">
                <div className={`text-2xl font-bold ${summary.medium_risk > 0 ? 'text-amber-600' : 'text-stone-400'}`}>{summary.medium_risk}</div>
                <div className="text-xs text-warm-stone">Medium Risk</div>
              </div>
            </>
          )}
        </div>

        {/* High-risk list */}
        {highRiskTonight.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-4 bg-green-500/8 rounded-xl border border-green-500/20">
            <ThiingsIcon name="check-circle" pxSize={16} className="text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 font-medium">No high-risk reservations tonight</span>
          </div>
        ) : (
          <div className="space-y-2">
            {highRiskTonight.map((p) => (
              <div
                key={p.reservation_id}
                className="flex items-start gap-3 p-3 rounded-xl border border-red-600/20 bg-red-600/5"
              >
                <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ThiingsIcon name="alert-triangle" pxSize={10} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-deep-charcoal truncate">{p.customer_name}</span>
                    <span className="text-xs text-warm-stone flex-shrink-0">Party of {p.party_size} @ {p.time}</span>
                  </div>
                  {p.recommendations[0] && (
                    <p className="text-xs text-red-700 mt-0.5">{p.recommendations[0]}</p>
                  )}
                </div>
                <span className="text-xs font-semibold text-red-600 flex-shrink-0">{p.risk_score}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming week alert */}
        {predictions.filter((p) => p.days_until > 0 && p.risk_level === 'high').length > 0 && (
          <p className="text-xs text-warm-stone mt-3 pt-3 border-t border-border-gray">
            +{predictions.filter((p) => p.days_until > 0 && p.risk_level === 'high').length} more high-risk in the next 7 days
          </p>
        )}
      </div>
    </div>
  );
}
