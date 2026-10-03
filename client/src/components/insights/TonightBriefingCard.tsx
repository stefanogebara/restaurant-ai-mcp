import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useNoShowPredictions } from '../../hooks/usePredictiveAnalytics';
import { usePlanFeature } from '../../hooks/usePlanFeature';
import ServiceRiskTimeline from './ServiceRiskTimeline';

interface TonightBriefingCardProps {
  appearance?: 'default' | 'hero';
}

export default function TonightBriefingCard({ appearance = 'default' }: TonightBriefingCardProps) {
  const { t } = useTranslation();
  const { hasAccess, isLoading: planLoading } = usePlanFeature('mlPerformance');
  const { data, isLoading, isError } = useNoShowPredictions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = data?.predictions.filter((prediction) => prediction.days_until === 0) ?? [];
  const priorities = today
    .filter((prediction) => prediction.risk_level !== 'low')
    .sort((a, b) => b.risk_score - a.risk_score);
  const selected = today.find((prediction) => prediction.reservation_id === selectedId) ?? priorities[0];
  const highCount = today.filter((prediction) => prediction.risk_level === 'high').length;
  const mediumCount = today.filter((prediction) => prediction.risk_level === 'medium').length;

  const hero = appearance === 'hero';
  const reservationAction = selected && (
    <a
      href={hero ? `/host-dashboard/simple?reservation=${encodeURIComponent(selected.reservation_id)}#reservations` : '/host-dashboard/simple'}
      aria-label={hero ? t('insights.openSpecificReservation', { name: selected.customer_name }) : undefined}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${hero ? 'bg-brand-action text-brand-paper hover:bg-brand-ink focus-visible:outline-brand-action' : 'bg-burgundy text-white hover:bg-burgundy-dark focus-visible:outline-burgundy'}`}
    >
      <span>{hero ? t('insights.viewReservation') : t('insights.openReservations')}</span>
      {hero ? <ThiingsIcon name="arrow-right" pxSize={14} /> : <span aria-hidden="true">↗</span>}
    </a>
  );

  if (isLoading || planLoading) {
    return (
      <div className="py-6" aria-busy="true">
        <div className={`mb-3 h-4 w-40 animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-soft-gray'}`} />
        <div className={`h-3 w-32 animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-soft-gray'}`} />
      </div>
    );
  }

  return (
    <section aria-labelledby="tonight-briefing-title" className="min-w-0">
      <header className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b pb-3 sm:pb-4 ${hero ? 'border-brand-line' : 'hairline'}`}>
        <h2 id="tonight-briefing-title" className={hero ? 'font-brand text-[12px] font-medium uppercase leading-none tracking-[0.13em] text-brand-muted' : 'font-serif text-[27px] leading-none text-deep-charcoal sm:text-[31px]'}>
          {t('insights.tonightBriefing')}
        </h2>
        {hasAccess && data && (
          <div className={`flex flex-wrap gap-x-5 gap-y-1 text-[12px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>
            <span role="group" aria-label={t('insights.tonight')}>
              <strong className={`mr-1 font-semibold tabular-nums ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{today.length}</strong>
              {t(hero ? 'insights.reservationsTodayShort' : 'insights.tonight')}
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

      {!hasAccess ? (
        <p className={`py-7 text-[15px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('insights.riskPlanUnavailable')}</p>
      ) : isError || !data ? (
        <p className={`py-7 text-[15px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('insights.riskDataUnavailable')}</p>
      ) : (
        <>
          {today.length > 0 ? (
            <div className={hero
              ? 'grid gap-3 pt-3 pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:items-start xl:gap-10 xl:pt-5'
              : 'grid gap-4 pt-4 pb-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-stretch xl:gap-10 xl:pt-6 xl:pb-3'}>
              <div className={hero ? 'flex min-w-0 flex-col items-start justify-start xl:self-stretch xl:justify-between' : 'flex min-w-0 flex-col justify-center xl:justify-between xl:py-2'}>
                {selected ? (
                  <>
                    <h3 className={hero ? 'max-w-[27ch] text-balance font-brand text-[30px] font-normal leading-[1.12] tracking-[-0.045em] text-brand-ink sm:text-[41px]' : 'max-w-[24ch] text-balance font-serif text-[32px] leading-[1.07] text-deep-charcoal sm:text-[46px]'}>
                      {selected.recommendations?.[0] || t('insights.reviewReservationHint')}
                    </h3>
                    {hero && (
                      <p className="mt-3 hidden max-w-[41ch] font-brand text-[14px] leading-relaxed text-brand-muted xl:block">
                        {t('insights.reservationRiskContext', { score: selected.risk_score })}
                      </p>
                    )}
                    <div className={hero ? 'mt-5 flex w-full flex-col items-start gap-3 sm:mt-5 sm:flex-row sm:items-end sm:gap-5' : 'mt-3 sm:mt-4'}>
                      <div className="min-w-0">
                        <p className={`text-[15px] font-semibold ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{selected.customer_name}</p>
                        <p className={`mt-0.5 text-[14px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>
                          {t('analytics.partyOf', { size: selected.party_size })} · {selected.time || t('insights.timeUnavailable')}
                        </p>
                      </div>
                      {hero && reservationAction}
                    </div>
                    {!hero && <div className="mt-4 sm:mt-5">{reservationAction}</div>}
                  </>
                ) : (
                  <>
                    <h3 className={hero ? 'mt-3 max-w-[22ch] font-brand text-[29px] font-medium leading-[1.1] tracking-[-0.04em] text-brand-ink sm:text-[39px]' : 'mt-3 max-w-[13ch] font-serif text-[38px] leading-[1.05] text-deep-charcoal sm:text-[46px]'}>
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
                appearance={appearance}
              />
            </div>
          ) : (
            <div className={`flex items-center gap-2 py-7 text-[15px] ${hero ? 'text-brand-muted' : 'text-emerald-700'}`}>
              <ThiingsIcon name={hero ? 'calendar' : 'check-circle'} pxSize={17} className="shrink-0" />
              <span>{t('insights.noReservationsToday')}</span>
            </div>
          )}

        </>
      )}
    </section>
  );
}
