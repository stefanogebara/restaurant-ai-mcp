import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { type Conversation, type CallChannel, type CallFilter, formatCallTime, getOutcomeLabelKey, getOutcomePillColor } from './callTrackingTypes';

function callIconStyle(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'bg-emerald-600/[8%] text-emerald-700';
    case 'information_only':    return 'bg-stone-500/[8%] text-stone-500';
    case 'error':               return 'bg-red-600/[8%] text-red-600';
    case 'abandoned':           return 'bg-amber-600/[8%] text-amber-600';
    default:                    return 'bg-soft-gray text-stone-gray';
  }
}

interface Props {
  conversations: Conversation[];
  channel: CallChannel;
  phoneNotConfigured?: boolean;
  filter: CallFilter;
  onOutcomeChange: (outcome: string) => void;
  onConversationClick: (id: string) => void;
  onPhoneClick?: (phone: string) => void;
  timeZone?: string;
  timeZoneLabel: string;
}

export default function CallConversationList({
  conversations,
  channel,
  phoneNotConfigured = false,
  filter,
  onOutcomeChange,
  onConversationClick,
  onPhoneClick,
  timeZone,
  timeZoneLabel,
}: Props) {
  const { t, i18n } = useTranslation();

  const OUTCOME_TABS = [
    { value: 'all',                  label: t('callTracking.outcomeAll') },
    { value: 'reservation_created',  label: t('callTracking.outcomeBooked') },
    { value: 'error',                label: t('callTracking.outcomeError') },
  ] as const;
  const showUnconnectedEmptyState = channel === 'phone' && phoneNotConfigured
    && filter.outcome === 'all' && filter.language === 'all'
    && (!filter.sentiment || filter.sentiment === 'all') && !filter.search;
  const emptyTitleKey = showUnconnectedEmptyState ? 'callTracking.noCallsWithoutLine'
    : channel === 'phone' ? 'callTracking.noCallsForFilters' : 'callTracking.noUnclassifiedForFilters';
  const emptyHintKey = showUnconnectedEmptyState ? 'callTracking.noCallsWithoutLineHint' : 'callTracking.noCallsForFiltersHint';

  return (
    <div className="overflow-hidden">
      {/* Header + tabs */}
      <div className="flex flex-col items-start gap-3 py-5 border-b border-glass-border-dark sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
            {t(channel === 'phone' ? 'callTracking.callsInPeriod' : 'callTracking.unclassifiedInPeriod')}
          </span>
          <p className="text-xs text-muted-stone mt-1">{timeZoneLabel}</p>
        </div>
        <div className="flex flex-wrap gap-0">
          {OUTCOME_TABS.map((tab) => (
            <button
              type="button"
              key={tab.value}
              onClick={() => onOutcomeChange(tab.value)}
              className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
                filter.outcome === tab.value
                  ? 'text-deep-charcoal bg-soft-gray'
                  : 'text-muted-stone hover:text-stone-gray'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
            <ThiingsIcon name={channel === 'phone' ? 'phone' : 'chat'} pxSize={24} />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">
            {t(emptyTitleKey)}
          </p>
          <p className="text-xs text-muted-stone">
            {t(emptyHintKey)}
          </p>
        </div>
      ) : (
        <div>
          {conversations.map((conv) => {
            // started_at is typed string but the payload is untrusted — an
            // invalid/missing value would otherwise render "Invalid Date".
            const startTime = formatCallTime(conv.started_at, i18n.language, timeZone);
            const duration = conv.duration_seconds != null
              ? `${Math.floor(conv.duration_seconds / 60)}:${String(conv.duration_seconds % 60).padStart(2, '0')}`
              : t(conv.ended_at ? 'callTracking.durationUnknown' : 'callTracking.durationPendingShort');
            const outcomeLabel = t(!conv.outcome && !conv.ended_at ? 'callTracking.pendingResult' : getOutcomeLabelKey(conv.outcome));

            return (
              <div
                key={conv.id}
                className="flex items-center gap-3 border-b border-glass-border-dark transition-colors hover:bg-soft-gray/60 sm:gap-4"
              >
                <button
                  type="button"
                  onClick={() => onConversationClick(conv.id)}
                  aria-label={t('callTracking.openCall', { name: conv.customer_name || conv.caller_phone || t('callTracking.unknownCaller'), time: startTime })}
                  className="flex flex-1 min-w-0 items-start gap-3 py-4 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-burgundy/60 sm:items-center sm:gap-4 sm:py-5"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${callIconStyle(conv.outcome)}`}>
                    <ThiingsIcon name={channel === 'phone' ? 'phone-call' : 'chat'} size="sm" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-deep-charcoal tracking-[-0.2px] truncate">
                      {conv.customer_name || t(channel === 'phone' ? 'callTracking.unknownCaller' : 'callTracking.agentConversation')}
                    </div>
                    <div className="text-xs text-muted-stone mt-0.5 truncate">
                      {conv.caller_phone || t('callTracking.noNumber')}
                      {conv.party_size ? ` · ${t('callTracking.partyOf', { size: conv.party_size })}` : ''}
                      {conv.language && conv.ended_at ? ` · ${conv.language.toUpperCase()}` : ''}
                    </div>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold sm:hidden ${getOutcomePillColor(conv.outcome)}`}>
                      {outcomeLabel}
                    </span>
                  </div>

                  <span className={`hidden flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${getOutcomePillColor(conv.outcome)}`}>
                    {outcomeLabel}
                  </span>

                  <div className="text-right flex-shrink-0 ml-2 max-w-20 break-words">
                    <div className="text-[13px] font-medium text-stone-gray">{startTime}</div>
                    <div className="text-[11px] text-muted-stone mt-0.5">{duration}</div>
                  </div>
                </button>
                {conv.caller_phone && onPhoneClick && (
                  <button
                    type="button"
                    onClick={() => onPhoneClick(conv.caller_phone)}
                    aria-label={t('callTracking.viewGuest', { phone: conv.caller_phone })}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-stone hover:bg-soft-gray hover:text-deep-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60"
                  >
                    <ThiingsIcon name="user" size="sm" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
