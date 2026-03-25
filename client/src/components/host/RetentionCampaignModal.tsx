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
  onSendCampaign: (customerId: string, campaignType: string, message: string) => Promise<void>;
}

const CAMPAIGN_TEMPLATES = {
  win_back: {
    name: 'Win Back',
    iconName: 'gift' as IconName,
    subject: 'We miss you!',
    message: "Hi {name}, we noticed it's been a while since your last visit. We'd love to welcome you back with a special 15% off your next meal!",
  },
  loyalty_reward: {
    name: 'Loyalty Reward',
    iconName: 'gift' as IconName,
    subject: 'A special thank you',
    message: "Hi {name}, thank you for being a valued customer! As a token of our appreciation, enjoy a complimentary dessert on your next visit.",
  },
  reservation_reminder: {
    name: 'Reservation Invite',
    iconName: 'calendar' as IconName,
    subject: 'Reserve your favorite table',
    message: "Hi {name}, your favorite table is waiting! Book now for this weekend and enjoy priority seating.",
  },
};

export function RetentionCampaignModal({ isOpen, onClose, customer, onSendCampaign }: RetentionCampaignModalProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const [selectedCampaign, setSelectedCampaign] = useState<keyof typeof CAMPAIGN_TEMPLATES>('win_back');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen || !customer) return null;

  const template = CAMPAIGN_TEMPLATES[selectedCampaign];
  const customerName = customer.customer_name || customer.customer_id || 'Valued Customer';
  const personalizedMessage = (customMessage || template.message).replace('{name}', customerName);

  const handleSend = async () => {
    setSending(true);
    try {
      await onSendCampaign(customer.customer_id, selectedCampaign, personalizedMessage);
      setSent(true);
      setTimeout(() => {
        onClose();
        setSent(false);
        setCustomMessage('');
      }, 2000);
    } catch (error) {
      console.error('Failed to send campaign:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Retention Campaign" className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-gray">
          <h2 className="text-lg font-semibold text-deep-charcoal">
            {t('retentionCampaign.title')}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-soft-gray rounded-xl transition-colors">
            <ThiingsIcon name="close" pxSize={20} />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-rose-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="mail" pxSize={32} />
            </div>
            <h3 className="text-lg font-medium text-deep-charcoal mb-2">{t('retentionCampaign.sent')}</h3>
            <p className="text-stone-gray">
              {t('retentionCampaign.sentMessage', { name: customerName })}
            </p>
          </div>
        ) : (
          <>
            {/* Customer Info */}
            <div className="p-4 bg-soft-gray border-b border-border-gray">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-600/10 rounded-full flex items-center justify-center">
                  <span className="text-amber-600 font-medium text-sm">
                    {customer.churn_risk_score}%
                  </span>
                </div>
                <div>
                  <p className="font-medium text-deep-charcoal">{customerName}</p>
                  <p className="text-sm text-stone-gray">
                    {t('retentionCampaign.lastVisit')}: {new Date(customer.last_visit_date).toLocaleDateString(dateLocale)} · {t('retentionCampaign.visits', { count: customer.total_visits })} · {new Intl.NumberFormat(dateLocale, { style: 'currency', currency: dateLocale.startsWith('pt') ? 'BRL' : 'EUR' }).format(customer.lifetime_value)} LTV
                  </p>
                </div>
              </div>
            </div>

            {/* Campaign Type Selection */}
            <div className="p-4 space-y-3">
              <label className="text-sm font-medium text-deep-charcoal">{t('retentionCampaign.campaignType')}</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CAMPAIGN_TEMPLATES).map(([key, tmpl]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedCampaign(key as keyof typeof CAMPAIGN_TEMPLATES);
                        setCustomMessage('');
                      }}
                      className={`p-3 rounded-2xl border text-center transition-colors ${
                        selectedCampaign === key
                          ? 'border-burgundy bg-burgundy/10'
                          : 'border-border-gray hover:bg-soft-gray'
                      }`}
                    >
                      <div className="flex justify-center mb-1"><ThiingsIcon name={tmpl.iconName} pxSize={20} /></div>
                      <span className="text-xs font-medium text-deep-charcoal">{tmpl.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Message Preview/Edit */}
            <div className="p-4 space-y-3">
              <label className="text-sm font-medium text-deep-charcoal">{t('retentionCampaign.message')}</label>
              <textarea
                value={customMessage || template.message}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-border-gray rounded-xl text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
                placeholder={t('retentionCampaign.customizePlaceholder')}
              />
              <p className="text-xs text-stone-gray">{t('retentionCampaign.personalizeHint')}</p>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border-gray flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-border-gray rounded-xl hover:bg-soft-gray text-deep-charcoal font-medium transition-colors"
              >
                {t('retentionCampaign.cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
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
