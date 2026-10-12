import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useLTVAtRisk, useLTVTopVIPs, useSendCampaign } from '../../hooks/useLTVData';
import { useToast } from '../../contexts/ToastContext';
import { parseLocalDate } from '../../utils/timeFormatting';
import type { Customer } from '../host/ltvDashboard.types';

interface SendModalProps {
  customer: Customer;
  onClose: () => void;
}

function SendModal({ customer, onClose }: SendModalProps) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState(() =>
    i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es' : 'en'
  );
  const [message, setMessage] = useState(() => t('insights.reEngagementDefaultMessage'));
  const { mutate: sendCampaign, isPending } = useSendCampaign();
  const toast = useToast();
  const titleId = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messageRef.current?.focus(); }, []);

  const handleSend = () => {
    sendCampaign(
      { customerId: customer.customer_id, campaignType: 'win_back', message, language },
      {
        onSuccess: () => {
          toast.success(t('insights.reEngagementSent', 'Re-engagement message sent'));
          onClose();
        },
        onError: (err) => {
          toast.error(t(err.message === 'customer_email_missing'
            ? 'insights.reEngagementMissingEmail'
            : 'insights.reEngagementFailed'));
        },
      }
    );
  };

  const handleLanguageChange = (nextLanguage: string) => {
    setMessage(t('insights.reEngagementDefaultMessage', { lng: nextLanguage }));
    setLanguage(nextLanguage);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
        className="glass-modal w-full max-w-md"
      >
        <div className="p-5 border-b border-glass-border-dark flex items-center justify-between">
          <h3 id={titleId} className="text-sm font-semibold text-deep-charcoal">{t('insights.sendReEngagement')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-warm-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-soft-gray rounded-xl">
            <div className="w-9 h-9 rounded-full bg-soft-gray flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-deep-charcoal">{customer.customer_name || customer.customer_id}</div>
              <div className="text-xs text-warm-stone">{t('insights.churnRisk', { score: Math.round(customer.churn_risk_score) })} · {t('insights.visits', { count: customer.total_visits })}</div>
            </div>
          </div>

          <div>
            <label htmlFor="re-engagement-language" className="text-xs font-semibold text-deep-charcoal block mb-1.5">
              {t('insights.emailLanguage')}
            </label>
            <select
              id="re-engagement-language"
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value)}
              className="w-full text-sm text-deep-charcoal border border-glass-border-input rounded-xl px-3 py-2 bg-white/60 focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <p className="mt-1.5 text-xs text-muted-stone">{t('insights.emailLanguageChangeHint')}</p>
          </div>

          <div>
            <label htmlFor="re-engagement-msg" className="text-xs font-semibold text-deep-charcoal block mb-1.5">
              {t('insights.message')}
            </label>
            <textarea
              id="re-engagement-msg"
              ref={messageRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full text-sm text-deep-charcoal border border-glass-border-input rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
            />
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-glass-border-dark text-deep-charcoal text-sm font-semibold rounded-xl hover:bg-soft-gray transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !message.trim()}
            className="flex-1 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isPending ? t('insights.sending') : t('insights.sendEmail')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CustomerRowProps {
  customer: Customer;
  showChurn?: boolean;
  onSend?: (c: Customer) => void;
}

function CustomerRow({ customer, showChurn, onSend }: CustomerRowProps) {
  const { t, i18n } = useTranslation();
  const churnColor =
    customer.churn_risk_score >= 80
      ? 'text-red-600'
      : customer.churn_risk_score >= 60
      ? 'text-amber-600'
      : 'text-warm-stone';

  const localeMap: Record<string, string> = { 'pt-BR': 'pt-BR', es: 'es', en: 'en-US' };
  const dateLocale = localeMap[i18n.language] ?? 'en-US';
  const lastVisit = customer.last_visit_date
    ? parseLocalDate(customer.last_visit_date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-glass-border-dark last:border-0">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-deep-charcoal truncate">{customer.customer_name || customer.customer_id}</div>
        <div className="text-xs text-warm-stone">{t('insights.visits', { count: customer.total_visits })} · {t('insights.lastVisit', 'Last')}: {lastVisit}</div>
      </div>
      {showChurn && (
        <span className={`text-xs font-semibold flex-shrink-0 ${churnColor}`} title={t('insights.churnRisk', { score: Math.round(customer.churn_risk_score) })}>
          {Math.round(customer.churn_risk_score)}/100
        </span>
      )}
      {onSend && (
        <button
          type="button"
          onClick={() => onSend(customer)}
          className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold text-burgundy border border-burgundy/30 rounded-lg hover:bg-burgundy hover:text-white transition-colors"
        >
          {t('insights.send')}
        </button>
      )}
    </div>
  );
}

export default function CustomerIntelligenceCard() {
  const { t } = useTranslation();
  const { data: atRisk = [], isLoading: loadingAtRisk } = useLTVAtRisk();
  const { data: vips = [], isLoading: loadingVIPs } = useLTVTopVIPs();
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'at-risk' | 'vips'>('at-risk');

  const isLoading = loadingAtRisk || loadingVIPs;

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="border border-glass-border-dark rounded-lg overflow-hidden">
        <div className="p-5 border-b border-glass-border-dark flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-soft-gray flex items-center justify-center flex-shrink-0">
            <ThiingsIcon name="user" pxSize={16} className="text-stone-gray" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-deep-charcoal">{t('insights.customerIntelligence')}</h2>
            <p className="text-xs text-warm-stone">{t('insights.atRiskAndVip')}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-glass-border-dark">
          {(['at-risk', 'vips'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === tabKey
                  ? 'text-burgundy border-b-2 border-burgundy bg-burgundy/5'
                  : 'text-warm-stone hover:text-deep-charcoal'
              }`}
            >
              {tabKey === 'at-risk' ? `${t('insights.atRisk')} (${atRisk.length})` : `${t('insights.vips')} (${vips.length})`}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'at-risk' && (
            atRisk.length === 0 ? (
              /* "Nenhum cliente em risco" is GOOD news — emerald reads as
                 "all clear" rather than the prior rose palette which copied
                 the at-risk warning color even when there was nothing wrong. */
              <div className="flex items-center gap-2 py-3 px-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <ThiingsIcon name="check-circle" pxSize={16} className="text-emerald-600 flex-shrink-0" />
                <span className="text-sm text-emerald-700 font-medium">{t('insights.noHighRiskCustomers')}</span>
              </div>
            ) : (
              <div>
                <p className="text-xs text-warm-stone mb-3">{t('insights.churnRiskHint')}</p>
                {atRisk.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} showChurn onSend={setSendTarget} />
                ))}
              </div>
            )
          )}

          {tab === 'vips' && (
            vips.length === 0 ? (
              <p className="text-sm text-warm-stone text-center py-4">{t('insights.noVipCustomers')}</p>
            ) : (
              <div>
                <p className="text-xs text-warm-stone mb-3">{t('insights.mostLoyalGuests')}</p>
                {vips.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {sendTarget && (
        <SendModal customer={sendTarget} onClose={() => setSendTarget(null)} />
      )}
    </>
  );
}
