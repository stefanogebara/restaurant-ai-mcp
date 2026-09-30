/** Read-only history of legacy bulk email campaigns. Bulk delivery is unavailable. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaignList, useCampaignDeliveryStats } from '../../hooks/useCampaigns';

const SEGMENT_LABEL_MAP: Record<string, string> = {
  vip: 'campaigns.segmentVip',
  at_risk: 'campaigns.segmentAtRisk',
  inactive_30d: 'campaigns.segmentInactive',
  new_customers: 'campaigns.segmentNew',
  birthday_this_month: 'campaigns.segmentBirthday',
  all: 'campaigns.segmentAll',
};

const STATUS_BADGES: Record<string, { key: string; classes: string }> = {
  completed: { key: 'campaigns.statusCompleted', classes: 'bg-emerald-500/10 text-emerald-700' },
  sent: { key: 'campaigns.statusCompleted', classes: 'bg-emerald-500/10 text-emerald-700' },
  failed: { key: 'campaigns.statusFailed', classes: 'bg-red-500/10 text-red-700' },
};

export default function CampaignManager() {
  const { data: campaigns, isLoading, isError } = useCampaignList();
  const { t } = useTranslation();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const emailCampaigns = campaigns?.filter((campaign) => campaign.channel === 'email').slice(0, 10) ?? [];
  // This is legacy history, not a call to action. A restaurant with no email
  // history should not end its Insights page with an unavailable feature.
  if (!isLoading && !isError && emailCampaigns.length === 0) return null;

  return (
    <section aria-labelledby="campaigns-heading" className="border-t hairline pt-9">
      <div className="mb-8">
        <h2 id="campaigns-heading" className="font-serif text-3xl text-deep-charcoal sm:text-4xl">
          {t('campaigns.title')}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-stone">
          {t('campaigns.emailUnavailable')}
        </p>
      </div>

      {isLoading ? (
        <div aria-label={t('campaigns.loading')} aria-busy="true">
          {[1, 2, 3].map((row) => <div key={row} className="h-20 animate-pulse border-b border-deep-charcoal/10" />)}
        </div>
      ) : isError ? (
        <p role="alert" className="border-t border-deep-charcoal/10 py-8 text-[15px] text-red-700">
          {t('common.error')}
        </p>
      ) : emailCampaigns.length === 0 ? (
        <div className="border-t border-deep-charcoal/10 py-10">
          <p className="text-[15px] text-muted-stone">{t('campaigns.noCampaigns')}</p>
        </div>
      ) : (
        <div className="border-t border-deep-charcoal/10">
          {emailCampaigns.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              isSelected={selectedCampaign === campaign.id}
              onSelect={() => setSelectedCampaign(selectedCampaign === campaign.id ? null : campaign.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CampaignRow({
  campaign,
  isSelected,
  onSelect,
}: {
  campaign: { id: string; segment_name?: string; campaign_type?: string; message: string; status: string; created_at: string; sent_count?: number };
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: stats, isError: statsFailed } = useCampaignDeliveryStats(isSelected ? campaign.id : null);
  const badge = STATUS_BADGES[campaign.status] ?? {
    key: 'campaigns.deliveryDisabled',
    classes: 'bg-deep-charcoal/5 text-muted-stone',
  };
  const segmentKey = campaign.segment_name || campaign.campaign_type || '';
  const campaignLabel = SEGMENT_LABEL_MAP[segmentKey]
    ? t(SEGMENT_LABEL_MAP[segmentKey])
    : segmentKey || t('campaigns.unnamedCampaign');
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(campaign.created_at));

  return (
    <div className="border-b border-deep-charcoal/10">
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={isSelected}
        aria-controls={`campaign-details-${campaign.id}`}
        className="flex min-h-[86px] w-full items-start justify-between gap-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy sm:items-center"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[15px] font-semibold text-deep-charcoal">{campaignLabel}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.classes}`}>
              {t(badge.key)}
            </span>
          </span>
          <span className="mt-1 block truncate text-sm text-muted-stone">{campaign.message}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-muted-stone">
          <span className="block">{date}</span>
          {(campaign.sent_count ?? 0) > 0 && (
            <span className="mt-1 block tabular-nums">{campaign.sent_count} {t('campaigns.sent')}</span>
          )}
        </span>
      </button>

      {isSelected && (
        <div id={`campaign-details-${campaign.id}`} className="pb-6 pt-1">
          {stats ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Stat label={t('campaigns.sent')} value={stats.sent + stats.delivered + stats.read} />
              <Stat label={t('campaigns.delivered')} value={stats.delivered + stats.read} />
              <Stat label={t('campaigns.read')} value={stats.read} />
              <Stat label={t('campaigns.failed')} value={stats.failed} />
            </dl>
          ) : (
            <p className="text-sm text-muted-stone">{statsFailed ? t('common.error') : t('common.loadingStats')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums text-deep-charcoal">{value}</dd>
    </div>
  );
}
