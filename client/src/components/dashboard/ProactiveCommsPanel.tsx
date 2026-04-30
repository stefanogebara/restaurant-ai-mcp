import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  useProactiveComms,
  useUpdateProactiveComm,
  useSendProactiveComm,
  type ProactiveCommItem,
} from '../../hooks/useProactiveComms';
import ThiingsIcon from '../common/ThiingsIcon';
import { useToast } from '../../contexts/ToastContext';

/**
 * Proactive Comms Panel — manager inbox for re-engagement opportunities
 * (birthdays, churn risks) generated weekly by api/cron/proactive-comms.js.
 *
 * Each opportunity has an AI-drafted message the manager can edit, then
 * approve and send via WhatsApp.
 */
export default function ProactiveCommsPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useProactiveComms();
  const update = useUpdateProactiveComm();
  const send = useSendProactiveComm();
  const toast = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const items = data?.items || [];
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const approvedCount = items.filter(i => i.status === 'approved').length;

  if (isLoading) {
    return (
      <div className="border border-[#E5E7EB] rounded-2xl bg-white p-6">
        <div className="text-sm text-[#9CA3AF]">{t('proactiveComms.loading', 'Loading opportunities...')}</div>
      </div>
    );
  }

  if (data?.migration_pending) {
    return null; // hide entirely until DB migration is applied
  }

  if (items.length === 0) {
    return (
      <section className="border border-[#E5E7EB] rounded-2xl bg-white p-6">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="sparkles" size="xs" className="text-burgundy" />
          <h3 className="text-sm font-semibold text-[#111827]">
            {t('proactiveComms.title', 'Re-engagement opportunities')}
          </h3>
        </div>
        <p className="text-sm text-[#6B7280]">
          {t('proactiveComms.empty', 'No opportunities right now. Sofia will surface birthdays, anniversaries, and customers slipping away here.')}
        </p>
      </section>
    );
  }

  const handleSetDraft = (id: string, message: string) => {
    setDrafts(prev => ({ ...prev, [id]: message }));
  };

  const handleApprove = async (item: ProactiveCommItem) => {
    const draft = drafts[item.id] !== undefined ? drafts[item.id] : item.draft_message;
    try {
      await update.mutateAsync({
        id: item.id,
        status: 'approved',
        draft_message: draft || undefined,
      });
      toast.success(t('proactiveComms.approved', 'Approved — ready to send'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDismiss = async (item: ProactiveCommItem) => {
    try {
      await update.mutateAsync({ id: item.id, status: 'dismissed' });
      toast.success(t('proactiveComms.dismissed', 'Dismissed'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSend = async (item: ProactiveCommItem) => {
    try {
      await send.mutateAsync(item.id);
      toast.success(t('proactiveComms.sent', 'Sent via WhatsApp'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <section className="border border-[#E5E7EB] rounded-2xl bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ThiingsIcon name="sparkles" size="xs" className="text-burgundy" />
          <h3 className="text-sm font-semibold text-[#111827]">
            {t('proactiveComms.title', 'Re-engagement opportunities')}
          </h3>
          {(pendingCount > 0 || approvedCount > 0) && (
            <span className="text-xs text-[#9CA3AF]">
              {pendingCount > 0 && `${pendingCount} ${t('proactiveComms.pending', 'pending')}`}
              {pendingCount > 0 && approvedCount > 0 && ' · '}
              {approvedCount > 0 && `${approvedCount} ${t('proactiveComms.readyToSend', 'ready to send')}`}
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {items.map(item => (
          <ProactiveCommCard
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            draftOverride={drafts[item.id]}
            onSetDraft={(msg) => handleSetDraft(item.id, msg)}
            onApprove={() => handleApprove(item)}
            onDismiss={() => handleDismiss(item)}
            onSend={() => handleSend(item)}
            isSending={send.isPending}
            isUpdating={update.isPending}
            t={t}
          />
        ))}
      </ul>
    </section>
  );
}

interface CardProps {
  item: ProactiveCommItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  draftOverride?: string;
  onSetDraft: (msg: string) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onSend: () => void;
  isSending: boolean;
  isUpdating: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}

function ProactiveCommCard({
  item, isExpanded, onToggleExpand, draftOverride,
  onSetDraft, onApprove, onDismiss, onSend, isSending, isUpdating, t,
}: CardProps) {
  const draft = draftOverride !== undefined ? draftOverride : (item.draft_message || '');
  const typeLabel = item.type === 'occasion'
    ? t('proactiveComms.typeOccasion', 'Occasion')
    : item.type === 'churn_risk'
      ? t('proactiveComms.typeChurnRisk', 'Churn risk')
      : t('proactiveComms.typeLongAbsent', 'Long absent');

  const statusBadge = (() => {
    switch (item.status) {
      case 'pending':
        return <span className="text-[10px] uppercase tracking-wider text-[#92400E] bg-[#FEF3C7] rounded-full px-2 py-0.5">{t('proactiveComms.pending', 'pending')}</span>;
      case 'approved':
        return <span className="text-[10px] uppercase tracking-wider text-[#065F46] bg-[#D1FAE5] rounded-full px-2 py-0.5">{t('proactiveComms.approved', 'approved')}</span>;
      case 'sent':
        return <span className="text-[10px] uppercase tracking-wider text-[#1E40AF] bg-[#DBEAFE] rounded-full px-2 py-0.5">{t('proactiveComms.sent', 'sent')}</span>;
      default:
        return null;
    }
  })();

  return (
    <li className="border border-[#E5E7EB] rounded-xl bg-[#FAFAF9]">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white transition-colors rounded-xl"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-burgundy font-semibold">{typeLabel}</span>
            {statusBadge}
          </div>
          <div className="text-sm font-medium text-[#111827] truncate">
            {item.customer_name || item.customer_phone}
          </div>
          <div className="text-xs text-[#6B7280] truncate">{item.suggested_action}</div>
        </div>
        <ThiingsIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="xs" className="text-[#9CA3AF] flex-shrink-0" />
      </button>

      {isExpanded && (
        <div className="border-t border-[#E5E7EB] p-4 space-y-3">
          {item.send_error && (
            <div className="text-xs text-[#B91C1C] bg-[#FEE2E2] rounded-lg p-2">
              {t('proactiveComms.lastSendError', 'Last send attempt failed')}: {item.send_error}
            </div>
          )}

          <div>
            <label htmlFor={`draft-${item.id}`} className="block text-xs font-semibold text-[#374151] mb-1.5">
              {t('proactiveComms.draftLabel', 'Draft message (edit as needed)')}
            </label>
            <textarea
              id={`draft-${item.id}`}
              value={draft}
              onChange={(e) => onSetDraft(e.target.value)}
              disabled={item.status === 'sent'}
              rows={4}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy disabled:bg-[#F3F4F6] disabled:text-[#6B7280]"
              placeholder={t('proactiveComms.draftPlaceholder', 'AI is drafting this — write your own if you prefer.')}
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {item.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isUpdating}
                  className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors disabled:opacity-50"
                >
                  {t('proactiveComms.dismiss', 'Dismiss')}
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={isUpdating || !draft.trim()}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-burgundy hover:bg-burgundy-dark rounded-full transition-colors disabled:opacity-50"
                >
                  {t('proactiveComms.approve', 'Approve')}
                </button>
              </>
            )}
            {item.status === 'approved' && (
              <>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isUpdating || isSending}
                  className="px-3 py-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors disabled:opacity-50"
                >
                  {t('proactiveComms.dismiss', 'Dismiss')}
                </button>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={isSending || !draft.trim()}
                  className="px-4 py-1.5 text-sm font-semibold text-white bg-burgundy hover:bg-burgundy-dark rounded-full transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSending && <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin" />}
                  {t('proactiveComms.sendWhatsApp', 'Send via WhatsApp')}
                </button>
              </>
            )}
            {item.status === 'sent' && item.sent_at && (
              <span className="text-xs text-[#6B7280]">
                {t('proactiveComms.sentAt', 'Sent')} {new Date(item.sent_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
