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

// Translation keys for activity event types
const EVENT_MESSAGE_KEYS: Record<string, string> = {
  'reservation.create': 'activity.booked',
  'reservation.cancel': 'activity.cancelled',
  'reservation.check_in': 'activity.checkedIn',
  'reservation.no_show': 'activity.noShow',
  'reservation.update': 'activity.updated',
  'service.complete': 'activity.serviceCompleted',
  'service.seat': 'activity.seated',
  'waitlist.add': 'activity.addedToWaitlist',
  'waitlist.seat': 'activity.seatedFromWaitlist',
  'waitlist.remove': 'activity.removedFromWaitlist',
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
      <div className="p-6 animate-pulse space-y-3">
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

  if (!events || events.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#8C8C8C] flex items-center gap-2 mb-3">
          <ThiingsIcon name="activity" pxSize={14} className="text-muted-stone" />
          {t('dashboard.activityFeed', 'Recent Activity')}
        </h2>
        <p className="text-sm text-muted-stone">{t('dashboard.noActivity', 'No recent activity yet')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#8C8C8C] flex items-center gap-2">
        <ThiingsIcon name="activity" pxSize={14} className="text-muted-stone" />
        {t('dashboard.activityFeed', 'Recent Activity')}
      </h2>

      <div className="space-y-1 max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {events.map((event) => {
          const colorClass = COLOR_MAP[event.color] || COLOR_MAP.gray;
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 py-2 border-b border-warm-divider last:border-0"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <ThiingsIcon name={event.icon as IconName} pxSize={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-deep-charcoal truncate">
                  {EVENT_MESSAGE_KEYS[event.type] && event.customer_name
                    ? t(EVENT_MESSAGE_KEYS[event.type], event.message, { name: event.customer_name })
                    : event.message}
                </p>
                <p className="text-xs text-muted-stone truncate">
                  {event.party_size
                    ? `${t('activity.partyOf', 'Party of')} ${event.party_size}${event.event_date ? ` · ${event.event_date}${event.event_time ? ` ${event.event_time.slice(0, 5)}` : ''}` : ''}`
                    : event.detail}
                </p>
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
