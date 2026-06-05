import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { type Conversation, type CallFilter, getOutcomeLabelKey, getOutcomePillColor } from './callTrackingTypes';

function callIconStyle(outcome?: string): string {
  switch (outcome) {
    case 'reservation_created': return 'bg-rose-600/[8%] text-rose-600';
    case 'information_only':    return 'bg-blue-500/[8%] text-blue-500';
    case 'error':               return 'bg-red-600/[8%] text-red-600';
    case 'abandoned':           return 'bg-amber-600/[8%] text-amber-600';
    default:                    return 'bg-soft-gray text-stone-gray';
  }
}

interface Props {
  conversations: Conversation[];
  filter: CallFilter;
  onOutcomeChange: (outcome: string) => void;
  onConversationClick: (id: string) => void;
  onPhoneClick?: (phone: string) => void;
}

export default function CallConversationList({
  conversations,
  filter,
  onOutcomeChange,
  onConversationClick,
  onPhoneClick,
}: Props) {
  const { t } = useTranslation();

  const OUTCOME_TABS = [
    { value: 'all',                  label: t('callTracking.outcomeAll') },
    { value: 'reservation_created',  label: t('callTracking.outcomeBooked') },
    { value: 'error',                label: t('callTracking.outcomeMissed') },
  ] as const;

  return (
    <div className="overflow-hidden">
      {/* Header + tabs */}
      <div className="flex items-center justify-between py-5 border-b border-glass-border-dark">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('callTracking.recentCalls')}</span>
        <div className="flex gap-0">
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
            <ThiingsIcon name="phone" pxSize={24} />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{t('callTracking.noCallsRecorded')}</p>
          <p className="text-xs text-muted-stone">
            {t('callTracking.noCallsRecordedHint')}
          </p>
        </div>
      ) : (
        <div>
          {conversations.map((conv) => {
            // started_at is typed string but the payload is untrusted — an
            // invalid/missing value would otherwise render "Invalid Date".
            const startedDate = conv.started_at ? new Date(conv.started_at) : null;
            const startTime = startedDate && !Number.isNaN(startedDate.getTime())
              ? startedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              : '';
            const duration = conv.duration_seconds
              ? `${Math.floor(conv.duration_seconds / 60)}:${String(conv.duration_seconds % 60).padStart(2, '0')}`
              : t('common.live', 'Live');

            return (
              <div
                key={conv.id}
                className="flex items-center py-5 border-b border-[#F3F4F6] gap-3 sm:gap-4 cursor-pointer hover:bg-[#FAFAFA] transition-colors"
                onClick={() => onConversationClick(conv.id)}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${callIconStyle(conv.outcome)}`}>
                  <ThiingsIcon name="phone-call" size="sm" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-deep-charcoal tracking-[-0.2px] truncate">
                    {conv.customer_name || t('callTracking.unknownCaller')}
                  </div>
                  <div className="text-xs text-muted-stone mt-0.5 truncate">
                    {conv.caller_phone ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPhoneClick?.(conv.caller_phone); }}
                        className="hover:text-burgundy hover:underline transition-colors"
                      >
                        {conv.caller_phone}
                      </button>
                    ) : t('callTracking.noNumber')}
                    {conv.party_size ? ` · ${t('callTracking.partyOf', { size: conv.party_size })}` : ''}
                    {conv.language ? ` · ${conv.language.toUpperCase()}` : ''}
                  </div>
                </div>

                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${getOutcomePillColor(conv.outcome)}`}>
                  {t(getOutcomeLabelKey(conv.outcome))}
                </span>

                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[13px] font-medium text-stone-gray">{startTime}</div>
                  <div className="text-[11px] text-muted-stone mt-0.5">{duration}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
