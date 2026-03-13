import { useTranslation } from 'react-i18next';
import { useActivityFeed } from '../../hooks/useActivityFeed';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-100 text-red-600',
  green: 'bg-emerald-100 text-emerald-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  blue: 'bg-blue-100 text-blue-600',
  amber: 'bg-amber-100 text-amber-600',
  gray: 'bg-gray-100 text-gray-500',
};

function timeAgo(timestamp: string, t: (key: string, fallback: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.justNow', 'just now');
  if (mins < 60) return t('time.minsAgo', '{{count}}m ago', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', '{{count}}h ago', { count: hours });
  const days = Math.floor(hours / 24);
  return t('time.daysAgo', '{{count}}d ago', { count: days });
}

export default function ActivityFeedWidget() {
  const { t } = useTranslation();
  const { data: events, isLoading } = useActivityFeed(15);

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-36" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-7 h-7 bg-gray-100 rounded-full" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider flex items-center gap-2">
        <ThiingsIcon name="activity" pxSize={14} className="text-muted-stone" />
        {t('dashboard.activityFeed', 'Recent Activity')}
      </h2>

      <div className="space-y-1 max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {events.map((event) => {
          const colorClass = COLOR_MAP[event.color] || COLOR_MAP.gray;
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 py-2 border-b border-border-gray last:border-0"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <ThiingsIcon name={event.icon as IconName} pxSize={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-deep-charcoal truncate">{event.message}</p>
                <p className="text-xs text-muted-stone truncate">{event.detail}</p>
              </div>
              <span className="text-[10px] text-muted-stone flex-shrink-0 pt-0.5">
                {timeAgo(event.timestamp, t)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
