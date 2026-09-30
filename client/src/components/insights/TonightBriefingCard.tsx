import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useNoShowPredictions } from '../../hooks/usePredictiveAnalytics';
import ServiceRiskTimeline from './ServiceRiskTimeline';

export default function TonightBriefingCard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useNoShowPredictions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = data?.predictions.filter((prediction) => prediction.days_until === 0) ?? [];
  const priorities = today
    .filter((prediction) => prediction.risk_level !== 'low')
    .sort((a, b) => b.risk_score - a.risk_score);
  const selected = priorities.find((prediction) => prediction.reservation_id === selectedId) ?? priorities[0];
  const highCount = today.filter((prediction) => prediction.risk_level === 'high').length;
  const mediumCount = today.filter((prediction) => prediction.risk_level === 'medium').length;

  if (isLoading) {
    return (
      <div className="py-6" aria-busy="true">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-soft-gray" />
        <div className="h-3 w-32 animate-pulse rounded bg-soft-gray" />
      </div>
    );
  }

  return (
    <section aria-labelledby="tonight-briefing-title" className="min-w-0">
      <header className="hairline flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b pb-3 sm:pb-4">
        <h2 id="tonight-briefing-title" className="font-serif text-[27px] leading-none text-deep-charcoal sm:text-[31px]">
          {t('insights.tonightBriefing')}
        </h2>
        {data && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-stone">
            <span role="group" aria-label={t('insights.tonight')}>
              <strong className="mr-1 font-semibold tabular-nums text-deep-charcoal">{today.length}</strong>
              {t('insights.tonight')}
            </span>
            <span role="group" aria-label={t('insights.highRisk')}>
              <strong className="mr-1 font-semibold tabular-nums text-red-700">{highCount}</strong>
              {t('insights.highRisk')}
            </span>
            <span role="group" aria-label={t('insights.mediumRisk')}>
              <strong className="mr-1 font-semibold tabular-nums text-amber-700">{mediumCount}</strong>
              {t('insights.mediumRisk')}
            </span>
          </div>
        )}
      </header>

      {isError || !data ? (
        <p className="hairline border-t py-7 text-[15px] text-muted-stone">{t('common.noData')}</p>
      ) : (
        <>
          {today.length > 0 ? (
            <div className="grid gap-4 pt-4 pb-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-stretch xl:gap-10 xl:pt-6 xl:pb-3">
              <div className="flex min-w-0 flex-col justify-center xl:justify-between xl:py-2">
                {selected ? (
                  <>
                    <h3 className="max-w-[24ch] text-balance font-serif text-[32px] leading-[1.07] text-deep-charcoal sm:text-[46px]">
                      {selected.recommendations?.[0] || t('insights.reviewReservationHint')}
                    </h3>
                    <p className="mt-3 text-[15px] font-semibold text-deep-charcoal sm:mt-4">{selected.customer_name}</p>
                    <p className="mt-1 text-[14px] text-muted-stone">
                      {t('analytics.partyOf', { size: selected.party_size })} · {selected.time || t('insights.timeUnavailable')}
                    </p>
                    <div className="mt-4 sm:mt-5">
                      <a
                        href="/host-dashboard/simple"
                        className="inline-flex items-center gap-2 rounded-full bg-burgundy px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-burgundy-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy"
                      >
                        {t('insights.openReservations')}
                        <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="mt-3 max-w-[13ch] font-serif text-[38px] leading-[1.05] text-deep-charcoal sm:text-[46px]">
                      {t('insights.noHighRiskTonight')}
                    </h3>
                    <p className="mt-4 flex items-center gap-2 text-[14px] text-emerald-700">
                      <ThiingsIcon name="check-circle" pxSize={17} className="shrink-0" />
                      {t('insights.allClearToday')}
                    </p>
                  </>
                )}
              </div>
              <ServiceRiskTimeline
                predictions={today}
                selectedId={selected?.reservation_id ?? null}
                onSelect={setSelectedId}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 py-7 text-[15px] text-emerald-700">
              <ThiingsIcon name="check-circle" pxSize={17} className="shrink-0" />
              <span>{t('insights.noReservationsToday')}</span>
            </div>
          )}

        </>
      )}
    </section>
  );
}
