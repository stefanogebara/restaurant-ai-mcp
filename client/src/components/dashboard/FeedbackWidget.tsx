/**
 * FeedbackWidget — shows avg NPS, response rate, and recent comments.
 * Placed in the dashboard left column.
 */
import { useFeedbackStats } from '../../hooks/useFeedback';
import ThiingsIcon from '../common/ThiingsIcon';

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

export default function FeedbackWidget() {
  const { data: stats, isLoading } = useFeedbackStats('7d');

  if (isLoading || !stats || stats.total === 0) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <ThiingsIcon name="star" pxSize={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-deep-charcoal">Guest Feedback</h3>
        <span className="text-xs text-muted-stone ml-auto">Last 7 days</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-deep-charcoal">
            {stats.avg_rating != null ? stats.avg_rating : '—'}
          </p>
          <p className="text-xs text-muted-stone">Avg Rating</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-deep-charcoal">{stats.response_rate}%</p>
          <p className="text-xs text-muted-stone">Response Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-deep-charcoal">{stats.answered_count}</p>
          <p className="text-xs text-muted-stone">Responses</p>
        </div>
      </div>

      {/* Rating distribution */}
      {stats.avg_rating != null && (
        <div className="flex items-center gap-1 mb-4">
          {[5, 4, 3, 2, 1].map((r) => {
            const count = stats.by_rating[r] || 0;
            const pct = stats.answered_count > 0 ? (count / stats.answered_count) * 100 : 0;
            return (
              <div key={r} className="flex-1">
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r >= 4 ? 'bg-emerald-500' : r === 3 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-stone text-center mt-0.5">{r}★</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent comments */}
      {stats.recent.length > 0 && (
        <div className="space-y-2">
          {stats.recent.slice(0, 3).map((fb) => (
            <div key={fb.id} className="bg-gray-50 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-deep-charcoal">
                  {fb.customer_name || 'Anonymous'}
                </span>
                {fb.rating && <StarRating rating={fb.rating} />}
              </div>
              {fb.comment && (
                <p className="text-xs text-muted-stone line-clamp-2">"{fb.comment}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
