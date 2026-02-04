import { useState } from 'react';
import { X, Mail, Gift, Calendar } from 'lucide-react';

interface Customer {
  customer_id: string;
  customer_name?: string;
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
    icon: Gift,
    subject: 'We miss you!',
    message: "Hi {name}, we noticed it's been a while since your last visit. We'd love to welcome you back with a special 15% off your next meal!",
  },
  loyalty_reward: {
    name: 'Loyalty Reward',
    icon: Gift,
    subject: 'A special thank you',
    message: "Hi {name}, thank you for being a valued customer! As a token of our appreciation, enjoy a complimentary dessert on your next visit.",
  },
  reservation_reminder: {
    name: 'Reservation Invite',
    icon: Calendar,
    subject: 'Reserve your favorite table',
    message: "Hi {name}, your favorite table is waiting! Book now for this weekend and enjoy priority seating.",
  },
};

export function RetentionCampaignModal({ isOpen, onClose, customer, onSendCampaign }: RetentionCampaignModalProps) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E7E5E4]">
          <h2 className="text-lg font-semibold text-[#1C1917]">
            Retention Campaign
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#F5F5F4] rounded">
            <X className="w-5 h-5 text-[#57534E]" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-[#16a34a]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-[#16a34a]" />
            </div>
            <h3 className="text-lg font-medium text-[#1C1917] mb-2">Campaign Sent!</h3>
            <p className="text-[#57534E]">
              Your retention message has been queued for {customerName}.
            </p>
          </div>
        ) : (
          <>
            {/* Customer Info */}
            <div className="p-4 bg-[#F5F5F4] border-b border-[#E7E5E4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#d97706]/10 rounded-full flex items-center justify-center">
                  <span className="text-[#d97706] font-medium text-sm">
                    {customer.churn_risk_score}%
                  </span>
                </div>
                <div>
                  <p className="font-medium text-[#1C1917]">{customerName}</p>
                  <p className="text-sm text-[#57534E]">
                    Last visit: {new Date(customer.last_visit_date).toLocaleDateString()} · {customer.total_visits} visits · {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(customer.lifetime_value)} LTV
                  </p>
                </div>
              </div>
            </div>

            {/* Campaign Type Selection */}
            <div className="p-4 space-y-3">
              <label className="text-sm font-medium text-[#1C1917]">Campaign Type</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CAMPAIGN_TEMPLATES).map(([key, tmpl]) => {
                  const Icon = tmpl.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedCampaign(key as keyof typeof CAMPAIGN_TEMPLATES);
                        setCustomMessage('');
                      }}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        selectedCampaign === key
                          ? 'border-[#9F1239] bg-[#9F1239]/10'
                          : 'border-[#E7E5E4] hover:bg-[#F5F5F4]'
                      }`}
                    >
                      <Icon className={`w-5 h-5 mx-auto mb-1 ${selectedCampaign === key ? 'text-[#9F1239]' : 'text-[#57534E]'}`} />
                      <span className="text-xs font-medium text-[#1C1917]">{tmpl.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Preview/Edit */}
            <div className="p-4 space-y-3">
              <label className="text-sm font-medium text-[#1C1917]">Message</label>
              <textarea
                value={customMessage || template.message}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-[#E7E5E4] rounded-lg text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239]"
                placeholder="Customize your message..."
              />
              <p className="text-xs text-[#57534E]">Use {'{name}'} to personalize with customer name</p>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-[#E7E5E4] flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-[#E7E5E4] rounded-lg hover:bg-[#F5F5F4] text-[#1C1917] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-2 bg-[#9F1239] text-white rounded-lg hover:bg-[#881337] disabled:opacity-50 flex items-center justify-center gap-2 font-medium transition-colors"
              >
                {sending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send Campaign
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
