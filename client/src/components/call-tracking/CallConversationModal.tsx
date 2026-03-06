import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { type Conversation, formatDate, getOutcomeColor, getOutcomeLabel } from './callTrackingTypes';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

export default function CallConversationModal({ conversation, onClose }: Props) {
  const { t } = useTranslation();
  const durationText = conversation.duration_seconds
    ? `${Math.floor(conversation.duration_seconds / 60)}m ${conversation.duration_seconds % 60}s`
    : 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conversation Details"
        className="bg-white rounded-2xl border border-border-gray shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border-gray p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-deep-charcoal">{t('callTracking.conversationDetails')}</h2>
            <p className="text-sm text-stone-gray mt-1">{formatDate(conversation.started_at)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-soft-gray rounded-xl transition-colors"
          >
            <ThiingsIcon name="close" size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary */}
          {conversation.summary && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <ThiingsIcon name="chat" size="sm" className="mt-0.5" />
                <div>
                  <h3 className="font-semibold text-deep-charcoal mb-1">{t('callTracking.summary')}</h3>
                  <p className="text-sm text-stone-gray">{conversation.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-stone-gray">{t('callTracking.outcome')}</p>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getOutcomeColor(conversation.outcome)}`}>
                {getOutcomeLabel(conversation.outcome)}
              </span>
            </div>
            <div>
              <p className="text-sm text-stone-gray">{t('callTracking.duration')}</p>
              <p className="text-sm font-medium text-deep-charcoal mt-1">{durationText}</p>
            </div>
            <div>
              <p className="text-sm text-stone-gray">{t('callTracking.language')}</p>
              <p className="text-sm font-medium text-deep-charcoal mt-1 uppercase">{conversation.language}</p>
            </div>
            {conversation.reservation_id && (
              <div>
                <p className="text-sm text-stone-gray">{t('callTracking.reservationId')}</p>
                <p className="text-sm font-medium text-deep-charcoal mt-1">{conversation.reservation_id}</p>
              </div>
            )}
          </div>

          {/* Tools Used */}
          {conversation.tools_used && conversation.tools_used.length > 0 && (
            <div>
              <h3 className="font-semibold text-deep-charcoal mb-3">{t('callTracking.toolsUsed')}</h3>
              <div className="space-y-2">
                {conversation.tools_used.map((tool, idx) => (
                  <div key={idx} className="bg-soft-gray/50 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-deep-charcoal">{tool.tool_name}</span>
                      {tool.success ? (
                        <ThiingsIcon name="check-circle" size="xs" />
                      ) : (
                        <ThiingsIcon name="x-circle" size="xs" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          {conversation.transcript && conversation.transcript.length > 0 && (
            <div>
              <h3 className="font-semibold text-deep-charcoal mb-3">{t('callTracking.transcript')}</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conversation.transcript.map((message, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl ${
                      message.role === 'user'
                        ? 'bg-blue-500/10 ml-8'
                        : 'bg-green-500/10 mr-8'
                    }`}
                  >
                    <p className="text-xs text-stone-gray mb-1">
                      {message.role === 'user' ? t('callTracking.customer') : t('callTracking.agent')}
                    </p>
                    <p className="text-sm text-deep-charcoal">{message.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-border-gray p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 bg-burgundy text-white rounded-xl font-medium hover:bg-burgundy-dark transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
