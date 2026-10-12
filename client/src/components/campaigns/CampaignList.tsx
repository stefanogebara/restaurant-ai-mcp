import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaignList } from '../../hooks/useCampaigns';
import type { Campaign } from '../../hooks/useCampaigns';
import CampaignDetail from './CampaignDetail';
import ThiingsIcon from '../common/ThiingsIcon';

const STATUS: Record<string, { label: string; style: string }> = {
  draft: { label: 'campaigns.statusDraft', style: 'bg-soft-gray text-stone-gray' },
  pending: { label: 'campaigns.statusPending', style: 'bg-amber-50 text-amber-800' },
  scheduled: { label: 'campaigns.statusScheduled', style: 'bg-amber-50 text-amber-800' },
  active: { label: 'campaigns.statusActive', style: 'bg-amber-50 text-amber-800' },
  sending: { label: 'campaigns.statusSending', style: 'bg-amber-50 text-amber-800' },
  sent: { label: 'campaigns.statusSent', style: 'bg-emerald-50 text-emerald-800' },
  completed: { label: 'campaigns.statusCompleted', style: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'campaigns.statusFailed', style: 'bg-red-50 text-red-800' },
};

const SEGMENT_LABELS: Record<string, string> = {
  all: 'campaigns.segmentAll',
  vip: 'campaigns.segmentVip',
  at_risk: 'campaigns.segmentAtRisk',
  inactive_30d: 'campaigns.segmentInactive',
  birthday_this_month: 'campaigns.segmentBirthday',
  new_customers: 'campaigns.segmentNew',
};

function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language.startsWith('pt') ? 'pt-BR' : language.startsWith('es') ? 'es-ES' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export default function CampaignList() {
  const { t, i18n } = useTranslation();
  const { data: campaigns, isLoading, isError, refetch } = useCampaignList();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <p role="status" className="py-12 text-sm text-stone-gray">{t('campaigns.loading')}</p>;
  }

  if (isError) {
    return (
      <div role="alert" className="py-10 space-y-3">
        <p className="text-sm text-red-700">{t('campaigns.loadFailed')}</p>
        <button type="button" onClick={() => void refetch()} className="text-sm font-semibold text-burgundy hover:underline">
          {t('campaigns.retry')}
        </button>
      </div>
    );
  }

  if (!campaigns?.length) {
    return (
      <div className="py-12 text-center">
        <ThiingsIcon name="send" size="sm" className="text-muted-stone mx-auto mb-4" />
        <h2 className="font-serif text-2xl text-deep-charcoal">{t('campaigns.noCampaigns')}</h2>
        <p className="text-sm text-stone-gray mt-2">{t('campaigns.noCampaignsHint')}</p>
      </div>
    );
  }

  return (
    <section aria-label={t('campaigns.history')}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {t('campaigns.history')}
        </h2>
        <span className="text-sm text-stone-gray">{campaigns.length}</span>
      </div>
      <ul className="hairline">
        {campaigns.map((campaign: Campaign) => {
          const expanded = expandedId === campaign.id;
          const detailId = `campaign-detail-${campaign.id}`;
          const status = STATUS[campaign.status] ?? { label: 'campaigns.statusUnknown', style: 'bg-soft-gray text-stone-gray' };
          const name = campaign.name?.trim() || campaign.message?.slice(0, 60) || t('campaigns.unnamedCampaign');
          const segment = SEGMENT_LABELS[campaign.segment_name];

          return (
            <li key={campaign.id} className="border-b border-glass-border-dark last:border-b-0">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpandedId(expanded ? null : campaign.id)}
                className="w-full py-5 flex items-start gap-4 text-left hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-burgundy rounded-lg transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-deep-charcoal break-words">{name}</span>
                  {campaign.name && campaign.message && (
                    <span className="block text-sm text-stone-gray mt-1 line-clamp-1">{campaign.message}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-gray mt-2">
                    {segment && <span>{t(segment)}</span>}
                    {segment && <span aria-hidden="true">·</span>}
                    <span>{formatDate(campaign.created_at, i18n.language)}</span>
                    {campaign.sent_count > 0 && (
                      <span>· {t('campaigns.sentCount', { count: campaign.sent_count })}</span>
                    )}
                  </span>
                </span>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${status.style}`}>
                  {t(status.label)}
                </span>
                <ThiingsIcon name={expanded ? 'chevron-up' : 'chevron-down'} size="xs" className="shrink-0 text-stone-gray mt-1" />
              </button>
              {expanded && <div id={detailId}><CampaignDetail campaign={campaign} /></div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
