import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';

interface Customer {
  customer_id: string;
  customer_name?: string | null;
  customer_phone?: string;
  customer_email?: string;
  churn_risk_score: number;
  lifetime_value: number;
  last_visit_date: string;
  total_visits: number;
}

interface RetentionCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSendCampaign: (customerId: string, campaignType: string, message: string, language: string) => Promise<void>;
}

const CAMPAIGN_TEMPLATES = {
  win_back: {
    iconName: 'gift' as IconName,
    nameKey: 'retentionCampaign.templates.winBack',
    messageKey: 'retentionCampaign.templates.winBackMessage',
  },
  loyalty_reward: {
    iconName: 'gift' as IconName,
    nameKey: 'retentionCampaign.templates.thankYou',
    messageKey: 'retentionCampaign.templates.thankYouMessage',
  },
  reservation_reminder: {
    iconName: 'calendar' as IconName,
    nameKey: 'retentionCampaign.templates.invitation',
    messageKey: 'retentionCampaign.templates.invitationMessage',
  },
};

export function RetentionCampaignModal({ isOpen, onClose, customer, onSendCampaign }: RetentionCampaignModalProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const [language, setLanguage] = useState(() =>
    i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es' : 'en'
  );
  const [selectedCampaign, setSelectedCampaign] = useState<keyof typeof CAMPAIGN_TEMPLATES>('win_back');
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(false);

  if (!isOpen || !customer) return null;

  const template = CAMPAIGN_TEMPLATES[selectedCampaign];
  const customerName = customer.customer_name || customer.customer_id || t('retentionCampaign.guest');
  const message = customMessage ?? t(template.messageKey, { lng: language });
  const personalizedMessage = message.replaceAll('{name}', customerName);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    setSendError(false);
    try {
      await onSendCampaign(customer.customer_id, selectedCampaign, personalizedMessage, language);
      setSent(true);
    } catch (error) {
      console.error('Failed to send campaign:', error);
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="retention-campaign-title" className="glass-modal max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-glass-border-dark">
          <h2 id="retention-campaign-title" className="text-lg font-semibold text-deep-charcoal">
            {t('retentionCampaign.title')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-2 hover:bg-soft-gray rounded-xl transition-colors">
            <ThiingsIcon name="close" pxSize={20} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="mail" pxSize={32} />
            </div>
            <h3 className="text-lg font-medium text-deep-charcoal mb-2">{t('retentionCampaign.sent')}</h3>
            <p className="text-stone-gray">
              {t('retentionCampaign.sentMessage', { name: customerName })}
            </p>
            <button type="button" onClick={onClose} className="mt-5 text-sm font-semibold text-burgundy hover:underline">
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            {/* Customer Info */}
            <div className="p-4 bg-soft-gray border-b border-glass-border-dark">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600/10 rounded-full flex items-center justify-center">
                  <span className="text-amber-600 font-medium text-sm">
                    {Math.round(customer.churn_risk_score)}/100
                  </span>
                </div>
                <div>
                  <p className="font-medium text-deep-charcoal">{customerName}</p>
                  <p className="text-sm text-stone-gray">
                    {t('retentionCampaign.lastVisit')}: {new Date(customer.last_visit_date).toLocaleDateString(dateLocale)} · {t('retentionCampaign.visits', { count: customer.total_visits })}
                  </p>
                </div>
              </div>
            </div>

            {/* Campaign Type Selection */}
            <div className="p-4 space-y-3">
              <p className="text-sm font-medium text-deep-charcoal">{t('retentionCampaign.campaignType')}</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CAMPAIGN_TEMPLATES).map(([key, tmpl]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={selectedCampaign === key}
                      onClick={() => {
                        setSelectedCampaign(key as keyof typeof CAMPAIGN_TEMPLATES);
                        setCustomMessage(null);
                      }}
                      className={`p-3 rounded-2xl border text-center transition-colors ${
                        selectedCampaign === key
                          ? 'border-burgundy bg-burgundy/10'
                          : 'border-glass-border-dark hover:bg-soft-gray'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name={tmpl.iconName} pxSize={20} /></div>
                      <span className="text-xs font-medium text-deep-charcoal">{t(tmpl.nameKey)}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Message Preview/Edit */}
            <div className="p-4 space-y-3">
              <label htmlFor="retention-campaign-language" className="text-sm font-medium text-deep-charcoal">{t('insights.emailLanguage')}</label>
              <select
                id="retention-campaign-language"
                value={language}
                onChange={(event) => { setLanguage(event.target.value); setCustomMessage(null); }}
                className="w-full px-3 py-2 border border-glass-border-input rounded-xl bg-white/60 text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
              <p className="text-xs text-stone-gray">{t('insights.emailLanguageChangeHint')}</p>
              <label htmlFor="retention-campaign-message" className="text-sm font-medium text-deep-charcoal">{t('retentionCampaign.message')}</label>
              <textarea
                id="retention-campaign-message"
                value={message}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-glass-border-input rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                placeholder={t('retentionCampaign.customizePlaceholder')}
              />
              <p className="text-xs text-stone-gray">{t('retentionCampaign.personalizeHint')}</p>
              {sendError && <p role="alert" className="text-sm text-red-700">{t('retentionCampaign.sendFailed')}</p>}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-glass-border-dark flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-glass-border-dark rounded-xl hover:bg-soft-gray text-deep-charcoal font-medium transition-colors"
              >
                {t('retentionCampaign.cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="flex-1 px-4 py-2 bg-burgundy text-white rounded-xl hover:bg-burgundy-dark disabled:opacity-50 flex items-center justify-center gap-2 font-medium transition-colors"
              >
                {sending ? (
                  <>{t('retentionCampaign.sending')}</>
                ) : (
                  <>
                    <ThiingsIcon name="mail" pxSize={16} />
                    {t('retentionCampaign.sendCampaign')}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
