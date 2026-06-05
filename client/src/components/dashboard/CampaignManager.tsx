/**
 * CampaignManager â€” Email campaign creation, listing, and delivery stats.
 * Added as a section in the AI Insights page.
 * WhatsApp and SMS channels removed â€” email is the only channel that actually sends.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCampaignList,
  useSegmentCounts,
  useCreateEmailCampaign,
  useSendCampaignNow,
  useCampaignDeliveryStats,
} from '../../hooks/useCampaigns';
import ThiingsIcon from '../common/ThiingsIcon';

const SEGMENTS = [
  { value: 'vip', i18nLabel: 'campaigns.segmentVip', label: 'VIP Guests', i18nDesc: 'campaigns.segmentVipDesc', description: '10+ visits' },
  { value: 'at_risk', i18nLabel: 'campaigns.segmentAtRisk', label: 'At Risk', i18nDesc: 'campaigns.segmentAtRiskDesc', description: 'High churn score' },
  { value: 'inactive_30d', i18nLabel: 'campaigns.segmentInactive', label: 'Inactive 30d', i18nDesc: 'campaigns.segmentInactiveDesc', description: 'No visit in 30 days' },
  { value: 'new_customers', i18nLabel: 'campaigns.segmentNew', label: 'New Guests', i18nDesc: 'campaigns.segmentNewDesc', description: 'First-time or occasional' },
  { value: 'birthday_this_month', i18nLabel: 'campaigns.segmentBirthday', label: 'Birthday', i18nDesc: 'campaigns.segmentBirthdayDesc', description: 'Birthday this month' },
  { value: 'all', i18nLabel: 'campaigns.segmentAll', label: 'All Customers', i18nDesc: 'campaigns.segmentAllDesc', description: 'Everyone' },
];

const STATUS_BADGES: Record<string, { i18nKey: string; label: string; classes: string }> = {
  pending: { i18nKey: 'campaigns.statusDraft', label: 'Draft', classes: 'bg-gray-100 text-gray-600' },
  scheduled: { i18nKey: 'campaigns.statusScheduled', label: 'Scheduled', classes: 'bg-blue-50 text-blue-700' },
  active: { i18nKey: 'campaigns.statusSending', label: 'Sending', classes: 'bg-amber-50 text-amber-700' },
  sending: { i18nKey: 'campaigns.statusSending', label: 'Sending', classes: 'bg-amber-50 text-amber-700' },
  completed: { i18nKey: 'campaigns.statusCompleted', label: 'Completed', classes: 'bg-rose-50 text-rose-700' },
  sent: { i18nKey: 'campaigns.statusCompleted', label: 'Sent', classes: 'bg-rose-50 text-rose-700' },
  failed: { i18nKey: 'campaigns.statusFailed', label: 'Failed', classes: 'bg-red-50 text-red-700' },
};

export default function CampaignManager() {
  const { data: campaigns, isLoading } = useCampaignList();
  const { data: segments } = useSegmentCounts();
  const createCampaign = useCreateEmailCampaign();
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
      { name: formSegment, segment: formSegment, message: formMessage },
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
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
            <ThiingsIcon name="send" pxSize={16} className="text-rose-600" />
          </div>
          <h3 className="text-sm font-semibold text-deep-charcoal">{t('insights.campaigns', 'Campaigns')}</h3>
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
                      : 'border-glass-border-dark hover:border-muted-stone text-deep-charcoal'
                  }`}
                >
                  <span className="font-medium">{t(s.i18nLabel, s.label)}</span>
                  {segments && (
                    <span className="text-muted-stone ml-1">
                      ({segments[s.value as keyof typeof segments] ?? 0})
                    </span>
                  )}
                  <br />
                  <span className="text-[10px] text-muted-stone">{t(s.i18nDesc, s.description)}</span>
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
              className="w-full border border-glass-border-dark rounded-xl px-3 py-2 text-sm text-deep-charcoal resize-none"
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
          <p className="text-xs text-muted-stone mt-1">{t('campaigns.noCampaignsHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns
            .filter(c => c.channel === 'email')
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

const SEGMENT_LABEL_MAP: Record<string, string> = {
  vip: 'campaigns.segmentVip',
  at_risk: 'campaigns.segmentAtRisk',
  inactive_30d: 'campaigns.segmentInactive',
  new_customers: 'campaigns.segmentNew',
  birthday_this_month: 'campaigns.segmentBirthday',
  all: 'campaigns.segmentAll',
};

function CampaignRow({
  campaign,
  isSelected,
  onSelect,
  onSend,
  isSending,
}: {
  campaign: { id: string; segment_name?: string; campaign_type?: string; message: string; status: string; created_at: string; sent_count?: number };
  isSelected: boolean;
  onSelect: () => void;
  onSend: () => void;
  isSending: boolean;
}) {
  const { t } = useTranslation();
  const { data: stats } = useCampaignDeliveryStats(isSelected ? campaign.id : null);
  const badge = STATUS_BADGES[campaign.status] || STATUS_BADGES.pending;

  const segmentKey = campaign.segment_name || campaign.campaign_type || '';
  const segmentI18nKey = SEGMENT_LABEL_MAP[segmentKey];
  const campaignLabel = segmentI18nKey
    ? t(segmentI18nKey)
    : segmentKey || t('campaigns.title', 'Campaign');

  return (
    <div className="border border-glass-border-dark rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-deep-charcoal truncate">
              {campaignLabel}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.classes}`}>
              {t(badge.i18nKey, badge.label)}
            </span>
          </div>
          <p className="text-[11px] text-muted-stone mt-0.5 truncate">{campaign.message}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs text-muted-stone">
            {new Date(campaign.created_at).toLocaleDateString()}
          </span>
          {(campaign.sent_count ?? 0) > 0 && (
            <p className="text-[10px] text-muted-stone">{campaign.sent_count} {t('campaigns.sent', 'sent')}</p>
          )}
        </div>
      </button>

      {/* Expanded stats */}
      {isSelected && (
        <div className="border-t border-glass-border-dark bg-gray-50 p-3">
          {stats ? (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label={t('campaigns.sent', 'Sent')} value={stats.sent + stats.delivered + stats.read} />
              <Stat label={t('campaigns.delivered', 'Delivered')} value={stats.delivered + stats.read} />
              <Stat label={t('campaigns.read', 'Read')} value={stats.read} />
              <Stat label={t('campaigns.failed', 'Failed')} value={stats.failed} />
            </div>
          ) : (
            <p className="text-xs text-muted-stone text-center">{t('common.loadingStats')}</p>
          )}

          {(campaign.status === 'pending' || campaign.status === 'scheduled') && (
            <button
              onClick={onSend}
              disabled={isSending}
              className="mt-2 w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSending ? t('campaigns.statusSending', 'Sending...') : t('campaigns.sendNow', 'Send Now')}
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
