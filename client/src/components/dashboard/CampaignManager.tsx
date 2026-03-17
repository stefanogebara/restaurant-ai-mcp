/**
 * CampaignManager — WhatsApp campaign creation, listing, and delivery stats.
 * Added as a section in the AI Insights page.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCampaignList,
  useSegmentCounts,
  useCreateWhatsAppCampaign,
  useSendCampaignNow,
  useCampaignDeliveryStats,
} from '../../hooks/useCampaigns';
import ThiingsIcon from '../common/ThiingsIcon';

const SEGMENTS = [
  { value: 'vip', label: 'VIP Guests', description: '10+ visits' },
  { value: 'at_risk', label: 'At Risk', description: 'High churn score' },
  { value: 'inactive_30d', label: 'Inactive 30d', description: 'No visit in 30 days' },
  { value: 'new_customers', label: 'New Guests', description: 'First-time or occasional' },
  { value: 'birthday_this_month', label: 'Birthday', description: 'Birthday this month' },
  { value: 'all', label: 'All Customers', description: 'Everyone' },
];

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Scheduled', classes: 'bg-blue-50 text-blue-700' },
  active: { label: 'Sending', classes: 'bg-amber-50 text-amber-700' },
  sending: { label: 'Sending', classes: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Complete', classes: 'bg-emerald-50 text-emerald-700' },
  sent: { label: 'Sent', classes: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Failed', classes: 'bg-red-50 text-red-700' },
};

export default function CampaignManager() {
  const { data: campaigns, isLoading } = useCampaignList();
  const { data: segments } = useSegmentCounts();
  const createCampaign = useCreateWhatsAppCampaign();
  const sendNow = useSendCampaignNow();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [formSegment, setFormSegment] = useState('vip');
  const [formMessage, setFormMessage] = useState('');
  const { t } = useTranslation();
  const [formError, setFormError] = useState('');

  const handleCreate = () => {
    if (!formMessage.trim()) {
      setFormError(t('campaigns.messageRequired', 'Message is required'));
      return;
    }
    setFormError('');
    createCampaign.mutate(
      { segment: formSegment, message: formMessage },
      {
        onSuccess: () => {
          setShowCreate(false);
          setFormMessage('');
        },
        onError: (err: Error) => setFormError(err.message),
      }
    );
  };

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <ThiingsIcon name="send" pxSize={16} className="text-emerald-600" />
          </div>
          <h3 className="text-sm font-semibold text-deep-charcoal">WhatsApp Campaigns</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-burgundy/10 text-burgundy hover:bg-burgundy/20 transition-colors"
        >
          {showCreate ? t('common.cancel') : t('campaigns.newCampaign', '+ New Campaign')}
        </button>
      </div>

      {/* Create Campaign Form */}
      {showCreate && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
          {/* Segment Picker */}
          <div>
            <label className="block text-xs font-medium text-muted-stone mb-1.5">{t('campaigns.targetAudience', 'Target Audience')}</label>
            <div className="grid grid-cols-2 gap-2">
              {SEGMENTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFormSegment(s.value)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    formSegment === s.value
                      ? 'border-burgundy bg-burgundy/5 text-burgundy'
                      : 'border-border-gray hover:border-muted-stone text-deep-charcoal'
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  {segments && (
                    <span className="text-muted-stone ml-1">
                      ({segments[s.value as keyof typeof segments] ?? 0})
                    </span>
                  )}
                  <br />
                  <span className="text-[10px] text-muted-stone">{s.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-muted-stone mb-1">{t('campaigns.message', 'Message')}</label>
            <textarea
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
              placeholder={t('campaigns.messagePlaceholder', 'Hi {name}, we miss you at our restaurant! Book your next visit...')}
              rows={3}
              className="w-full border border-border-gray rounded-xl px-3 py-2 text-sm text-deep-charcoal resize-none"
              maxLength={500}
            />
            <p className="text-[10px] text-muted-stone mt-0.5">
              Use {'{name}'} to personalize. {formMessage.length}/500
            </p>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <button
            onClick={handleCreate}
            disabled={createCampaign.isPending}
            className="w-full py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {createCampaign.isPending ? t('campaigns.creating', 'Creating...') : t('campaigns.createAndSend', 'Create & Send Campaign')}
          </button>
        </div>
      )}

      {/* Campaign List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !campaigns?.length ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-stone">{t('campaigns.noCampaigns', 'No campaigns yet')}</p>
          <p className="text-xs text-muted-stone mt-1">Create your first WhatsApp campaign to re-engage guests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns
            .filter(c => c.channel === 'whatsapp')
            .slice(0, 10)
            .map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                isSelected={selectedCampaign === campaign.id}
                onSelect={() => setSelectedCampaign(selectedCampaign === campaign.id ? null : campaign.id)}
                onSend={() => sendNow.mutate(campaign.id)}
                isSending={sendNow.isPending}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({
  campaign,
  isSelected,
  onSelect,
  onSend,
  isSending,
}: {
  campaign: { id: string; customer_id: string; message: string; status: string; created_at: string; sent_count: number };
  isSelected: boolean;
  onSelect: () => void;
  onSend: () => void;
  isSending: boolean;
}) {
  const { data: stats } = useCampaignDeliveryStats(isSelected ? campaign.id : null);
  const badge = STATUS_BADGES[campaign.status] || STATUS_BADGES.pending;

  return (
    <div className="border border-border-gray rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-deep-charcoal truncate">
              {campaign.customer_id} campaign
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.classes}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-[11px] text-muted-stone mt-0.5 truncate">{campaign.message}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs text-muted-stone">
            {new Date(campaign.created_at).toLocaleDateString()}
          </span>
          {campaign.sent_count > 0 && (
            <p className="text-[10px] text-muted-stone">{campaign.sent_count} sent</p>
          )}
        </div>
      </button>

      {/* Expanded stats */}
      {isSelected && (
        <div className="border-t border-border-gray bg-gray-50 p-3">
          {stats ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Sent" value={stats.sent + stats.delivered + stats.read} />
              <Stat label="Delivered" value={stats.delivered + stats.read} />
              <Stat label="Read" value={stats.read} />
              <Stat label="Failed" value={stats.failed} />
            </div>
          ) : (
            <p className="text-xs text-muted-stone text-center">Loading stats...</p>
          )}

          {(campaign.status === 'pending' || campaign.status === 'scheduled') && (
            <button
              onClick={onSend}
              disabled={isSending}
              className="mt-2 w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Send Now'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold text-deep-charcoal">{value}</p>
      <p className="text-[10px] text-muted-stone">{label}</p>
    </div>
  );
}
