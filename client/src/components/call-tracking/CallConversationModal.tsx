import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogLifecycle } from '../../hooks/useDialogLifecycle';
import ThiingsIcon from '../common/ThiingsIcon';
import { type Conversation, formatDate, getOutcomeColor, getOutcomeLabelKey, getSentimentColor, getSentimentLabelKey } from './callTrackingTypes';

interface Props {
  conversation: Conversation | null;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  timeZone?: string;
  timeZoneLabel: string;
}

const SECTION_TITLE = 'font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-3';
const TOOL_LABEL_KEYS = new Map([
  ['check_availability', 'callTracking.toolNames.checkAvailability'],
  ['create_reservation', 'callTracking.toolNames.createReservation'],
  ['get_current_datetime', 'callTracking.toolNames.currentDateTime'],
  ['get_wait_time', 'callTracking.toolNames.waitTime'],
  ['identify_restaurant', 'callTracking.toolNames.identifyRestaurant'],
  ['lookup_reservation', 'callTracking.toolNames.lookupReservation'],
  ['get_customer_info', 'callTracking.toolNames.customerInfo'],
  ['update_reservation', 'callTracking.toolNames.updateReservation'],
  ['cancel_reservation', 'callTracking.toolNames.cancelReservation'],
]);

export default function CallConversationModal({ conversation, onClose, timeZone, timeZoneLabel, isLoading = false, isError = false, isFetching = false, onRetry }: Props) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogLifecycle(dialogRef, onClose);

  const durationText = conversation?.duration_seconds != null
    ? `${Math.floor(conversation.duration_seconds / 60)}m ${conversation.duration_seconds % 60}s`
    : t(conversation?.ended_at ? 'callTracking.durationUnknown' : 'callTracking.pendingDuration');
  const awaitingFinalData = !conversation?.ended_at;
  const transcript = conversation?.transcript?.filter(message => typeof message?.content === 'string' && message.content.trim()) ?? [];
  const toolLabel = (name: string) => {
    const key = TOOL_LABEL_KEYS.get(name);
    return key ? t(key) : name;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('callTracking.conversationDetails')}
        tabIndex={-1}
        className="glass-modal max-w-4xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 bg-warm-white/95 backdrop-blur-glass-nav border-b border-glass-border-dark p-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-deep-charcoal">{t('callTracking.conversationDetails')}</h2>
            {conversation && <p className="text-sm text-stone-gray mt-1">{formatDate(conversation.started_at, i18n.language, timeZone)}</p>}
            <p className="text-xs text-muted-stone mt-0.5">{timeZoneLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-11 min-w-11 shrink-0 flex items-center justify-center hover:bg-soft-gray rounded-full transition-colors"
          >
            <ThiingsIcon name="close" size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="bg-warm-white/95 p-6 space-y-6">
          {!conversation ? (
            isLoading ? (
              <p role="status" className="py-10 text-center text-sm text-stone-gray">{t('callTracking.loadingDetails', 'Loading call details…')}</p>
            ) : (
              <div role="alert" className="py-8 text-center">
                <p className="text-[15px] text-stone-gray">{isError
                  ? t('callTracking.detailsLoadFailed', "We couldn't load this call. Try again.")
                  : t('callTracking.detailsUnavailable', 'This call is no longer available.')}</p>
                {onRetry && <button type="button" onClick={onRetry} disabled={isFetching} className="mt-4 min-h-11 rounded-full border border-glass-border-dark px-5 text-sm text-burgundy hover:bg-soft-gray disabled:opacity-50">{t('common.retry')}</button>}
              </div>
            )
          ) : <>
            {isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
              <p>{t('callTracking.detailsRefreshFailed', "We couldn't update these call details. The last loaded version is shown.")}</p>
              {onRetry && <button type="button" disabled={isFetching} onClick={onRetry} className="min-h-11 underline underline-offset-2 disabled:opacity-50">{t('common.retry')}</button>}
            </div>}
            {/* Summary */}
            {conversation.summary && (
              <section className="pb-6 border-b border-glass-border-dark">
                <h3 className={SECTION_TITLE}>{t('callTracking.summary')}</h3>
                <p className="text-[15px] leading-relaxed text-deep-charcoal break-words">{conversation.summary}</p>
              </section>
            )}

            {/* Recording */}
            {conversation.recording_url && (
              <div className="bg-soft-gray/50 rounded-xl p-4">
                <h3 className={SECTION_TITLE}>{t('callTracking.recording', 'Recording')}</h3>
                <audio controls className="w-full" preload="metadata">
                  <source src={conversation.recording_url} />
                </audio>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <div>
                <p className="text-sm text-stone-gray">{t('callTracking.outcome')}</p>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getOutcomeColor(conversation.outcome)}`}>
                  {t(!conversation.outcome && awaitingFinalData ? 'callTracking.pendingResult' : getOutcomeLabelKey(conversation.outcome))}
                </span>
              </div>
              <div>
                <p className="text-sm text-stone-gray">{t('callTracking.duration')}</p>
                <p className="text-sm font-medium text-deep-charcoal mt-1">{durationText}</p>
              </div>
              <div>
                <p className="text-sm text-stone-gray">{t('callTracking.language')}</p>
                <p className={`text-sm font-medium text-deep-charcoal mt-1 ${awaitingFinalData ? '' : 'uppercase'}`}>
                  {awaitingFinalData ? t('callTracking.pendingLanguage') : conversation.language || t('callTracking.durationUnknown')}
                </p>
              </div>
              {conversation.customer_sentiment && (
                <div>
                  <p className="text-sm text-stone-gray">{t('callTracking.sentiment', 'Sentiment')}</p>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getSentimentColor(conversation.customer_sentiment)}`}>
                    {t(getSentimentLabelKey(conversation.customer_sentiment))}
                  </span>
                </div>
              )}
              {conversation.reservation_id && (
                <div className="col-span-2">
                  <p className="text-sm text-stone-gray">{t('callTracking.reservationId')}</p>
                  <p className="text-sm font-medium text-deep-charcoal mt-1 break-all">{conversation.reservation_id}</p>
                </div>
              )}
            </div>

            {/* Tools Used */}
            {conversation.tools_used && conversation.tools_used.length > 0 && (
              <div>
                <h3 className={SECTION_TITLE}>{t('callTracking.toolsUsed')}</h3>
                <div>
                  {conversation.tools_used.map((tool, idx) => (
                    <div key={idx} className="border-b border-glass-border-dark py-3 last:border-0">
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="text-sm font-medium text-deep-charcoal break-words">{toolLabel(tool.tool_name)}</span>
                        <span className={`inline-flex items-center gap-1.5 text-xs ${tool.success === true ? 'text-emerald-700' : tool.success === false ? 'text-red-700' : 'text-muted-stone'}`}>
                          <ThiingsIcon name={tool.success === true ? 'check-circle' : tool.success === false ? 'x-circle' : 'info'} size="xs" />
                          {t(tool.success === true ? 'callTracking.toolResultSuccess' : tool.success === false ? 'callTracking.toolResultFailure' : 'callTracking.toolResultUnknown')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            <div>
              <h3 className={SECTION_TITLE}>{t('callTracking.transcript')}</h3>
              {transcript.length > 0 ? (
                <div>
                  {transcript.map((message, idx) => (
                    <div
                      key={idx}
                      className="py-4 border-b border-glass-border-dark first:pt-0 last:border-0"
                    >
                      <p className="text-xs text-stone-gray mb-1">
                        {message.role === 'user' ? t('callTracking.customer') : t('callTracking.agent')}
                      </p>
                      <p className="text-[15px] leading-relaxed text-deep-charcoal whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-stone">{t(awaitingFinalData ? 'callTracking.pendingTranscript' : 'callTracking.noTranscriptAvailable')}</p>
              )}
            </div>

            {/* Errors */}
            {conversation.errors_encountered && conversation.errors_encountered.length > 0 && (
              <div>
                <h3 className="font-semibold text-red-600 mb-3">{t('callTracking.errorsEncountered')}</h3>
                <div className="space-y-2">
                  {conversation.errors_encountered.map((error, idx) => (
                    <div key={idx} className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
                      <p className="text-sm font-medium text-deep-charcoal">{error.error_type}</p>
                      <p className="text-xs text-stone-gray mt-1">{error.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-warm-white/95 backdrop-blur-glass-nav border-t border-glass-border-dark p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-11 px-4 py-2 bg-burgundy text-white rounded-full font-medium hover:bg-burgundy-dark transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
