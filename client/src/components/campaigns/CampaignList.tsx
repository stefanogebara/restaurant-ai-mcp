import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaignList } from '../../hooks/useCampaigns';
import type { Campaign } from '../../hooks/useCampaigns';
import CampaignDetail from './CampaignDetail';
import ThiingsIcon from '../common/ThiingsIcon';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-700',
  scheduled: 'bg-blue-50 text-blue-700',
  active: 'bg-amber-50 text-amber-700',
  sending: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

const SEGMENT_LABELS: Record<string, string> = {
  all: 'campaigns.segmentAll',
  vip: 'campaigns.segmentVip',
  at_risk: 'campaigns.segmentAtRisk',
  inactive_30d: 'campaigns.segmentInactive',
  birthday_this_month: 'campaigns.segmentBirthday',
  new_customers: 'campaigns.segmentNew',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'campaigns.statusDraft',
  scheduled: 'campaigns.statusScheduled',
  active: 'campaigns.statusActive',
  sending: 'campaigns.statusSending',
  completed: 'campaigns.statusCompleted',
  failed: 'campaigns.statusFailed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CampaignList() {
  const { t } = useTranslation();
  const { data: campaigns, isLoading } = useCampaignList();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="glass-panel p-8 text-center">
        <p className="text-sm text-stone-gray">{t('campaigns.loading')}</p>
      </div>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="glass-panel p-10 text-center">
        <div className="w-12 h-12 bg-[#F3F4F6] rounded-full flex items-center justify-center mx-auto mb-3">
          <ThiingsIcon name="send" size="xs" className="text-stone-gray" />
        </div>
        <h3 className="text-sm font-medium text-deep-charcoal mb-1">{t('campaigns.noCampaigns')}</h3>
        <p className="text-xs text-stone-gray">{t('campaigns.noCampaignsHint')}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[1fr_1fr_100px_80px_160px_120px] gap-2 px-4 py-2.5 bg-[#FAFAFA] border-b border-glass-border-dark text-xs font-medium text-stone-gray">
        <span>{t('campaigns.colName')}</span>
        <span>{t('campaigns.colSegment')}</span>
        <span>{t('campaigns.colStatus')}</span>
        <span className="text-right">{t('campaigns.colRecipients')}</span>
        <span className="text-center">{t('campaigns.colDelivery')}</span>
        <span>{t('campaigns.colCreated')}</span>
      </div>

      {/* Rows */}
      {campaigns.map((c: Campaign) => {
        const isExpanded = expandedId === c.id;
        const segmentLabel = SEGMENT_LABELS[c.segment_name] ?? c.segment_name;
        const statusStyle = STATUS_STYLES[c.status] ?? STATUS_STYLES.draft;
        const statusLabel = STATUS_LABELS[c.status] ?? c.status;

        return (
          <div key={c.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
              className="w-full text-left grid grid-cols-1 sm:grid-cols-[1fr_1fr_100px_80px_160px_120px] gap-2 px-4 py-3 border-b border-glass-border-dark hover:bg-[#FAFAFA] transition-colors items-center"
            >
              {/* Name — message preview is the most identifying content because
                  the user-entered `name` field from CampaignBuilder is silently
                  dropped at the backend (campaignService.js doesn't persist it).
                  Falls back to a localized generic label so we never render the
                  raw campaign_type enum string or hardcoded English "Campaign". */}
              <span className="text-sm font-medium text-deep-charcoal truncate">
                {c.message?.slice(0, 60) || t('campaigns.unnamedCampaign', 'Campaign')}
              </span>

              {/* Segment */}
              <span className="text-xs text-stone-gray">{t(segmentLabel)}</span>

              {/* Status badge */}
              <span>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>
                  {t(statusLabel)}
                </span>
              </span>

              {/* Recipients */}
              <span className="text-xs text-deep-charcoal text-right">
                {c.recipient_count ?? '—'}
              </span>

              {/* Delivery stats */}
              <span className="text-xs text-stone-gray text-center">
                {c.sent_count ?? 0} / {c.delivered_count ?? 0} / {c.read_count ?? 0}
              </span>

              {/* Created date */}
              <span className="text-xs text-stone-gray">
                {formatDate(c.created_at)}
              </span>
            </button>

            {/* Expandable detail */}
            {isExpanded && <CampaignDetail campaign={c} />}
          </div>
        );
      })}
    </div>
  );
}
