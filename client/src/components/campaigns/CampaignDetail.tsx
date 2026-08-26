import { useTranslation } from 'react-i18next';
import type { Campaign } from '../../hooks/useCampaigns';
import { useCampaignDeliveryStats } from '../../hooks/useCampaigns';

interface CampaignDetailProps {
  campaign: Campaign;
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-stone-gray w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#F5F5F4] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-deep-charcoal w-12 text-right">
        {value} ({pct}%)
      </span>
    </div>
  );
}

export default function CampaignDetail({ campaign }: CampaignDetailProps) {
  const { t } = useTranslation();
  const { data: stats } = useCampaignDeliveryStats(campaign.id);

  const total = stats?.total ?? campaign.recipient_count ?? 0;
  const sent = stats?.sent ?? campaign.sent_count ?? 0;
  const delivered = stats?.delivered ?? campaign.delivered_count ?? 0;
  const read = stats?.read ?? campaign.read_count ?? 0;
  const failed = stats?.failed ?? campaign.failed_count ?? 0;

  return (
    <div className="px-4 py-3 bg-[#FAFAFA] border-t border-glass-border-dark">
      {/* Message preview */}
      {campaign.message && (
        <div className="mb-3">
          <span className="text-xs font-medium text-stone-gray">{t('campaigns.message')}</span>
          <p className="text-sm text-deep-charcoal mt-1 whitespace-pre-wrap">{campaign.message}</p>
        </div>
      )}

      {/* Delivery funnel */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-stone-gray">{t('campaigns.deliveryFunnel')}</span>
        <ProgressBar label={t('campaigns.sent')} value={sent} max={total} color="bg-stone-500" />
        <ProgressBar label={t('campaigns.delivered')} value={delivered} max={total} color="bg-emerald-500" />
        <ProgressBar label={t('campaigns.read')} value={read} max={total} color="bg-ocre-500" />
        {failed > 0 && (
          <ProgressBar label={t('campaigns.failed')} value={failed} max={total} color="bg-red-500" />
        )}
      </div>

      {/* Dates */}
      <div className="flex gap-6 mt-3 text-xs text-stone-gray">
        {campaign.scheduled_at && (
          <span>
            {t('campaigns.schedule')}: {new Date(campaign.scheduled_at).toLocaleString()}
          </span>
        )}
        <span>
          {t('campaigns.colCreated')}: {new Date(campaign.created_at).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
