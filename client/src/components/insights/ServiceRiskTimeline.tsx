import { useTranslation } from 'react-i18next';
import type { NoShowPrediction } from '../../hooks/usePredictiveAnalytics';

interface ServiceRiskTimelineProps {
  predictions: NoShowPrediction[];
  selectedId: string | null;
  onSelect: (reservationId: string) => void;
  appearance?: 'default' | 'hero';
}

function reservationMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  return hour < 24 && minute < 60 && second < 60 ? hour * 60 + minute : null;
}

const severity = {
  high: { dot: 'bg-red-600', number: 'text-red-700' },
  medium: { dot: 'bg-amber-600', number: 'text-amber-700' },
  low: { dot: 'bg-emerald-700', number: 'text-emerald-700' },
} as const;

export default function ServiceRiskTimeline({ predictions, selectedId, onSelect, appearance = 'default' }: ServiceRiskTimelineProps) {
  const { t } = useTranslation();
  const hero = appearance === 'hero';
  const sorted = [...predictions].sort((a, b) => {
    const aMinute = reservationMinute(a.time);
    const bMinute = reservationMinute(b.time);
    if (aMinute === null) return bMinute === null ? 0 : 1;
    if (bMinute === null) return -1;
    return aMinute - bMinute || b.risk_score - a.risk_score;
  });

  return (
    <section className={`min-w-0 py-2 ${hero ? '' : 'border-t hairline'}`} aria-label={t('insights.serviceTimeline')}>
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h3 className={`${hero ? 'text-[15px] font-medium' : 'text-[12px] font-semibold'} ${hero ? 'font-brand text-brand-ink' : 'font-sans text-deep-charcoal'}`}>
          {hero && selectedId && sorted.length > 1 ? (
            <>
              <span className="sm:hidden">{t('insights.otherReservationsToday')}</span>
              <span className="hidden sm:inline">{t('insights.serviceTimeline')}</span>
            </>
          ) : t('insights.serviceTimeline')}
        </h3>
        <span className={`${hero ? 'text-[12px] text-brand-muted' : 'text-[11px] text-muted-stone'}`}>
          {hero ? t('insights.noShowRiskLabel') : t('insights.noShowRiskShort')}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className={`py-8 text-[15px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('common.noData')}</p>
      ) : (
        <ol className="relative mt-1" data-testid="risk-timeline-list">
          {sorted.map((prediction, index) => {
            const minute = reservationMinute(prediction.time);
            const time = minute === null ? t('insights.timeUnavailable') : prediction.time.slice(0, 5);
            const palette = severity[prediction.risk_level];
            const isSelected = prediction.reservation_id === selectedId;
            return (
              <li key={prediction.reservation_id} className={`relative ${hero && isSelected && sorted.length > 1 ? 'hidden sm:block' : ''}`}>
                {!hero && index < sorted.length - 1 && (
                  <span className="absolute bottom-0 left-[66px] top-8 w-px bg-deep-charcoal/10 sm:left-[74px]" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(prediction.reservation_id)}
                  aria-pressed={isSelected}
                  aria-label={`${time} · ${prediction.customer_name} · ${t('analytics.partyOf', { size: prediction.party_size })} · ${t('insights.estimatedNoShowRisk', { score: prediction.risk_score })}`}
                  className={`relative grid w-full items-center gap-x-2 rounded-md px-2 text-left outline-none transition-colors focus-visible:ring-2 ${hero ? 'grid-cols-[52px_minmax(0,1fr)_54px] border-b border-brand-line py-2 last:border-b-0 focus-visible:ring-brand-action hover:bg-brand-action/5 sm:grid-cols-[60px_minmax(0,1fr)_60px]' : 'grid-cols-[52px_16px_minmax(0,1fr)_42px] py-2.5 focus-visible:ring-ocre-600 sm:grid-cols-[60px_16px_minmax(0,1fr)_48px]'} ${!hero && isSelected ? 'bg-[#F0ECE4]' : !hero ? 'hover:bg-white/65' : ''}`}
                >
                  <span className={`${hero ? 'text-[13px]' : 'text-[12px]'} font-semibold tabular-nums ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{time}</span>
                  {!hero && <span className={`relative z-10 mx-auto h-2.5 w-2.5 rounded-full ring-2 ring-warm-white ${palette.dot}`} aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className={`block truncate text-[14px] ${hero && isSelected ? 'font-semibold' : 'font-medium'} ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{prediction.customer_name}</span>
                    <span className={`block text-[13px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('analytics.partyOf', { size: prediction.party_size })}</span>
                  </span>
                  <span className={`text-right text-[13px] font-semibold tabular-nums ${palette.number}`} aria-hidden="true" title={hero ? t('insights.estimatedNoShowRisk', { score: prediction.risk_score }) : undefined}>
                    {hero
                      ? t(`analytics.riskBand${prediction.risk_level.charAt(0).toUpperCase()}${prediction.risk_level.slice(1)}`)
                      : prediction.risk_score}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
