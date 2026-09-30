import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { parseLocalDate } from '../../utils/timeFormatting';
import { useNoShowPredictions, type NoShowPrediction } from '../../hooks/usePredictiveAnalytics';

const RECOMMENDATION_I18N: Record<string, Record<string, string>> = {
  'pt-BR': {
    'Send confirmation reminder 24 hours before': 'Revisar envio de lembrete de confirmação 24 horas antes',
    'Require credit card deposit': 'Avaliar a política de sinal para esta reserva',
    'Call to confirm 2 hours before reservation': 'Considerar uma ligação de confirmação 2 horas antes',
    'Send automated SMS reminder': 'Revisar envio de lembrete por SMS',
    'Confirm via email 48 hours before': 'Considerar confirmação por email 48 horas antes',
  },
  es: {
    'Send confirmation reminder 24 hours before': 'Revisar el envío de un recordatorio de confirmación 24 horas antes',
    'Require credit card deposit': 'Evaluar la política de depósito para esta reserva',
    'Call to confirm 2 hours before reservation': 'Considerar una llamada de confirmación 2 horas antes',
    'Send automated SMS reminder': 'Revisar el envío de un recordatorio por SMS',
    'Confirm via email 48 hours before': 'Considerar una confirmación por correo 48 horas antes',
  },
};

export default function NoShowPredictions() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es' : 'en';
  const { data, isLoading, isError, refetch } = useNoShowPredictions();
  const rawPredictions = data?.predictions ?? [];
  // Dedup by reservation_id to prevent duplicate cards
  const predictions = rawPredictions
    .filter((p, i, arr) => arr.findIndex(q => q.reservation_id === p.reservation_id) === i)
    .sort((a, b) => b.risk_score - a.risk_score || a.days_until - b.days_until);
  const summary = data?.summary ?? null;
  const [selectedPrediction, setSelectedPrediction] = useState<NoShowPrediction | null>(null);
  const readableDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' }).format(parseLocalDate(date))
    : date || '—';

  // Liquid Glass v2: a linha inteira não é mais uma caixa colorida — só o
  // chip carrega o risco. 'low' era rose-600 (a cor de AÇÃO da marca), então
  // a reserva mais segura gritava mais alto que a de risco médio.
  const getRiskChip = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-700/[0.10] text-red-700';
      case 'medium': return 'bg-amber-600/[0.12] text-amber-700';
      case 'low': return 'bg-emerald-600/[0.10] text-emerald-700';
      default: return 'bg-muted-stone/[0.10] text-muted-stone';
    }
  };
  const riskBand = (level: string) => {
    switch (level) {
      case 'high': return t('analytics.riskBandHigh', 'High');
      case 'medium': return t('analytics.riskBandMedium', 'Medium');
      case 'low': return t('analytics.riskBandLow', 'Low');
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="py-8">
        <div role="status" className="flex items-center justify-center">
          <div aria-hidden="true" className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-muted-stone">{t('analytics.loadingPredictions')}</span>
        </div>
      </div>
    );
  }

  // A failed fetch must not render the green "all upcoming look good" state —
  // that tells the host there's no no-show risk when the model never ran.
  if (isError) {
    return (
      <div className="py-12 text-center">
        <div className="w-14 h-14 mx-auto mb-3 bg-red-50 rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="alert-circle" pxSize={24} />
        </div>
        <p className="font-semibold text-deep-charcoal">{t('dashboard.errorTitle')}</p>
        <p className="text-sm text-stone-gray mt-1 mb-4">{t('errors.serverError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <ThiingsIcon name="refresh" size="xs" />
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <section>
      {/* Cabeçalho: rótulo + prosa direto no canvas, sem caixa */}
      <header className="border-b hairline pb-4">
        <h2 className="font-sans text-[16px] font-medium text-deep-charcoal">
          {t('analytics.noShowPredictions')}
        </h2>
        <p className="text-[15px] text-muted-stone mt-1.5">
          {t('analytics.predictionScopeNote', 'Next 7 days · scores, not probabilities.')}
        </p>
      </header>

      {/* The historical rate in the API combines cancellations and no-shows,
          and can be a default 15% with no history. Do not present it as an
          observed no-show rate. */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 border-b hairline py-5 sm:flex sm:gap-x-10">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-serif text-[27px] leading-none tabular-nums text-deep-charcoal">{summary.total_upcoming}</span>
            <span className="text-[12px] text-muted-stone">{t('analytics.upcomingSevenDays')}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-serif text-[27px] leading-none tabular-nums text-red-700">{summary.high_risk}</span>
            <span className="text-[12px] text-muted-stone">{t('analytics.highRisk')}</span>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-serif text-[27px] leading-none tabular-nums text-amber-700">{summary.medium_risk}</span>
            <span className="text-[12px] text-muted-stone">{t('analytics.mediumRisk')}</span>
          </div>
        </div>
      )}

      {/* Lista: linhas com fio de tinta, não cartões empilhados */}
      {predictions.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-serif text-[22px] text-deep-charcoal">
            {summary ? t('analytics.noUpcomingPredictions', 'No upcoming reservations to assess') : t('analytics.predictionsUnavailable', 'Risk predictions unavailable')}
          </p>
          <p className="text-sm text-muted-stone mt-1">
            {summary ? t('analytics.noUpcomingPredictionsNote', 'No reservations were returned for the next seven days.') : t('analytics.predictionsUnavailableNote', 'No risk conclusion can be drawn from this view.')}
          </p>
        </div>
      ) : (
        <div>
          {predictions.map((prediction) => (
            <button
              key={prediction.reservation_id}
              type="button"
              aria-expanded={selectedPrediction === prediction}
              className="w-full text-left py-4 border-b hairline transition-colors hover:bg-deep-charcoal/[0.02]"
              onClick={() => setSelectedPrediction(selectedPrediction === prediction ? null : prediction)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-[15px] font-medium text-deep-charcoal">{prediction.customer_name}</span>
                    <span aria-label={t('analytics.riskScore', 'Risk score {{score}}', { score: prediction.risk_score })} className={`shrink-0 rounded-[46px] px-2.5 py-1 text-[12px] font-medium tabular-nums ${getRiskChip(prediction.risk_level)}`}>
                      {riskBand(prediction.risk_level) && <span className="mr-1">{riskBand(prediction.risk_level)} ·</span>}{prediction.risk_score}/100
                    </span>
                  </div>
                  <div className="mt-1 grid gap-x-6 gap-y-0.5 text-[13px] text-muted-stone sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <span>{readableDate(prediction.date)} · {prediction.time?.slice(0, 5) || '—'}</span>
                    <span>{t('analytics.partyOf', { size: prediction.party_size })} · {prediction.days_until === 0 ? t('analytics.todayLabel') : prediction.days_until === 1 ? t('analytics.tomorrowLabel') : t('analytics.inDays', { days: prediction.days_until })}</span>
                  </div>
                </div>
                <ThiingsIcon name="chevron-down" pxSize={18} className={`flex-shrink-0 mt-1 transition-transform ${selectedPrediction === prediction ? 'rotate-180' : ''}`} />
              </div>

              {/* Recomendações expandidas */}
              {selectedPrediction === prediction && (prediction.recommendations?.length ?? 0) > 0 && (
                <div className="mt-4 pt-4 border-t hairline">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-stone mb-2">
                    {t('analytics.recommendedActions')}
                  </p>
                  <ul className="space-y-2">
                    {(prediction.recommendations ?? []).map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-[15px] text-deep-charcoal">
                        <span className="text-burgundy mt-0.5" aria-hidden="true">&bull;</span>
                        <span>{RECOMMENDATION_I18N[language]?.[rec] ?? rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-stone pt-4">
        <ThiingsIcon name="info" pxSize={14} />
        <span>{t('analytics.predictionsLimits', 'Up to 10 bookings. Scores are not probabilities and do not confirm a no-show.')}</span>
      </p>
    </section>
  );
}
