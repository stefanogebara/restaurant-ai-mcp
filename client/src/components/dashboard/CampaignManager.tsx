import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCampaignList } from '../../hooks/useCampaigns';
import ThiingsIcon from '../common/ThiingsIcon';

/** Read-only overview. Creation and sending live nowhere until delivery is verified. */
export default function CampaignManager() {
  const { t } = useTranslation();
  const { data: campaigns, isLoading, isError } = useCampaignList();
  const latest = campaigns?.[0];

  return (
    <section aria-label={t('campaigns.title')} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-2">
            {t('campaigns.eyebrow')}
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-deep-charcoal">
            {t('campaigns.title')}
          </h2>
        </div>
        <Link
          to="/host-dashboard/campaigns"
          className="inline-flex items-center gap-2 text-sm font-semibold text-burgundy hover:underline"
        >
          {t('campaigns.viewHistory')}
          <ThiingsIcon name="chevron-right" size="xs" />
        </Link>
      </div>
      <p className="text-sm text-stone-gray max-w-xl">{t('campaigns.manualUnavailable')}</p>
      {isLoading && <p role="status" className="text-sm text-stone-gray">{t('campaigns.loading')}</p>}
      {isError && <p role="alert" className="text-sm text-red-700">{t('campaigns.loadFailed')}</p>}
      {latest && (
        <div className="hairline pt-4 flex items-center justify-between gap-4">
          <span className="text-sm text-deep-charcoal truncate">
            {latest.name?.trim() || latest.message?.slice(0, 60) || t('campaigns.unnamedCampaign')}
          </span>
          <span className="text-xs text-stone-gray shrink-0">{t('campaigns.latestCampaign')}</span>
        </div>
      )}
    </section>
  );
}
