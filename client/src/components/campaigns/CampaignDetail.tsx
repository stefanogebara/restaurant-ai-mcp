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
      <div className="flex-1 h-2 bg-soft-gray rounded-full overflow-hidden">
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
  const { t, i18n } = useTranslation();
  const { data: stats, isLoading, isError } = useCampaignDeliveryStats(campaign.id);

  const sent = stats?.sent ?? campaign.sent_count ?? 0;
  const delivered = stats?.delivered ?? campaign.delivered_count ?? 0;
  const read = stats?.read ?? campaign.read_count ?? 0;
  const failed = stats?.failed ?? campaign.failed_count ?? 0;
  const total = Math.max(stats?.total ?? 0, sent, delivered, read, failed);
  const locale = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const formatDate = (iso: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso));

  return (
    <div className="pb-6 pl-4 sm:pl-6 space-y-6">
      {/* Message preview */}
      {campaign.message && (
        <div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('campaigns.message')}</span>
          <p className="text-sm text-deep-charcoal mt-2 whitespace-pre-wrap">{campaign.message}</p>
        </div>
      )}

      {/* Delivery funnel */}
      <div className="space-y-2 max-w-xl">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('campaigns.deliveryFunnel')}</span>
        {total > 0 ? (
          <>
            <ProgressBar label={t('campaigns.sent')} value={sent} max={total} color="bg-muted-stone" />
            <ProgressBar label={t('campaigns.delivered')} value={delivered} max={total} color="bg-emerald-500" />
            <ProgressBar label={t('campaigns.read')} value={read} max={total} color="bg-ocre-500" />
            {failed > 0 && <ProgressBar label={t('campaigns.failed')} value={failed} max={total} color="bg-red-500" />}
          </>
        ) : (
          <p className="text-sm text-stone-gray">
            {isLoading ? t('campaigns.loading') : isError ? t('campaigns.loadFailed') : t('campaigns.deliveryUnavailable')}
          </p>
        )}
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-stone-gray">
        {campaign.scheduled_at && (
          <span>
            {t('campaigns.schedule')}: {formatDate(campaign.scheduled_at)}
          </span>
        )}
        <span>
          {t('campaigns.colCreated')}: {formatDate(campaign.created_at)}
        </span>
      </div>
    </div>
  );
}
