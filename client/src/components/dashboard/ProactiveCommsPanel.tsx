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
import { churnSummaryParts } from './proactiveCommsCopy';

/**
 * Proactive Comms Panel — manager inbox for re-engagement opportunities
 * (birthdays, churn risks) generated weekly by api/cron/proactive-comms.js.
 *
 * Each opportunity has an AI-drafted message the manager can edit, then
 * approve and send via WhatsApp.
 */
export default function ProactiveCommsPanel() {
  const { t, i18n } = useTranslation();
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
      <div role="status" className="py-6 text-sm text-muted-stone">
        {t('proactiveComms.loading', 'Loading opportunities...')}
      </div>
    );
  }

  if (data?.migration_pending) {
    return null; // hide entirely until DB migration is applied
  }

  if (items.length === 0) {
    return (
      <section className="py-6">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="sparkles" size="xs" className="text-muted-stone" />
          <h3 className="font-serif text-2xl text-deep-charcoal">
            {t('proactiveComms.title', 'Guests to reach out to')}
          </h3>
        </div>
        <p className="text-sm text-stone-gray">
          {t('proactiveComms.empty', "No win-back ideas right now. Birthdays, anniversaries, and guests who haven't visited in a while will appear here automatically.")}
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
    <section className="py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-2xl text-deep-charcoal">
            {t('proactiveComms.title', 'Guests to reach out to')}
          </h3>
          {(pendingCount > 0 || approvedCount > 0) && (
            <span className="text-xs text-muted-stone">
              {pendingCount > 0 && t('proactiveComms.pendingCount', { count: pendingCount })}
              {pendingCount > 0 && approvedCount > 0 && ' · '}
              {approvedCount > 0 && t('proactiveComms.readyCount', { count: approvedCount })}
            </span>
          )}
        </div>
      </div>

      <ul className="border-t hairline">
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
            language={i18n.language}
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
  language: string;
}

function ProactiveCommCard({
  item, isExpanded, onToggleExpand, draftOverride,
  onSetDraft, onApprove, onDismiss, onSend, isSending, isUpdating, t, language,
}: CardProps) {
  const draft = draftOverride !== undefined ? draftOverride : (item.draft_message || '');
  const scoreParts = churnSummaryParts(item, language);
  const summary = scoreParts ? [
    scoreParts.score === null ? t('proactiveComms.scoreUnknown') : t('proactiveComms.score', { score: scoreParts.score }),
    scoreParts.visits === null ? null : t('proactiveComms.visitCount', { count: scoreParts.visits }),
    scoreParts.lastVisit ? t('proactiveComms.lastVisit', { date: scoreParts.lastVisit }) : null,
  ].filter(Boolean).join(' · ') : item.suggested_action;
  // Carla-friendly labels: dropped "Churn risk" (analytics term) and "Long
  // absent" (vague). Now phrased as actions a host actually takes.
  const typeLabel = item.type === 'occasion'
    ? t('proactiveComms.typeOccasion', 'Birthday coming up')
    : item.type === 'churn_risk'
      ? t('proactiveComms.typeChurnRisk', 'Likely to drift away')
      : t('proactiveComms.typeLongAbsent', "Haven't seen in a while");

  const statusBadge = (() => {
    switch (item.status) {
      case 'pending':
        return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-700">{t('proactiveComms.pending', 'pending')}</span>;
      case 'approved':
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">{t('proactiveComms.approved', 'approved')}</span>;
      case 'sent':
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">{t('proactiveComms.sent', 'sent')}</span>;
      default:
        return null;
    }
  })();

  return (
    <li className="border-b hairline last:border-b-0">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-1 py-5 text-left hover:bg-warm-white/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-stone font-semibold">{typeLabel}</span>
            {statusBadge}
          </div>
          <div className="truncate text-sm font-medium text-deep-charcoal">
            {item.customer_name || item.customer_phone}
          </div>
          <div className="text-xs text-stone-gray break-words">{summary}</div>
        </div>
        <ThiingsIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="xs" className="text-muted-stone flex-shrink-0" />
      </button>

      {isExpanded && (
        <div className="border-t hairline px-1 py-4 space-y-3">
          {item.send_error && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {t('proactiveComms.lastSendError', 'Last send attempt failed')}: {item.send_error}
            </div>
          )}

          <div>
            <label htmlFor={`draft-${item.id}`} className="mb-1.5 block text-xs font-semibold text-deep-charcoal">
              {t('proactiveComms.draftLabel', 'Draft message (edit as needed)')}
            </label>
            <textarea
              id={`draft-${item.id}`}
              value={draft}
              onChange={(e) => onSetDraft(e.target.value)}
              disabled={item.status === 'sent'}
              rows={4}
              className="w-full rounded-lg border border-glass-border-input bg-warm-white px-3 py-2 text-sm text-deep-charcoal placeholder:text-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy disabled:opacity-60"
              placeholder={t('proactiveComms.draftPlaceholder', 'AI is drafting this — write your own if you prefer.')}
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
            {item.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isUpdating}
                  className="px-3 py-1.5 text-sm text-stone-gray hover:text-deep-charcoal transition-colors disabled:opacity-50"
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
                  className="px-3 py-1.5 text-sm text-stone-gray hover:text-deep-charcoal transition-colors disabled:opacity-50"
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
              <span className="text-xs text-stone-gray">
                {t('proactiveComms.sentAt', 'Sent')} {new Date(item.sent_at).toLocaleString(language)}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
