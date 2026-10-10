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

export default function NoShowPredictions({ featured = false }: { featured?: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith('pt') ? 'pt-BR' : i18n.language.startsWith('es') ? 'es' : 'en';
  const { data, isLoading, isError, refetch } = useNoShowPredictions();
  const rawPredictions = data?.predictions ?? [];
  // Dedup by reservation_id to prevent duplicate cards
  const predictions = rawPredictions
    .filter((p, i, arr) => arr.findIndex(q => q.reservation_id === p.reservation_id) === i)
    .sort((a, b) => b.risk_score - a.risk_score || a.days_until - b.days_until);
  const isForReview = (prediction: NoShowPrediction) => prediction.risk_level === 'high' || prediction.risk_level === 'medium';
  const reviewPredictions = predictions.filter(isForReview);
  const otherPredictions = predictions.filter(prediction => !isForReview(prediction));
  const summary = data?.summary ?? null;
  const reviewCount = (summary?.high_risk ?? 0) + (summary?.medium_risk ?? 0);
  const reviewRows = reviewPredictions.length;
  const [selectedPrediction, setSelectedPrediction] = useState<NoShowPrediction | null>(null);
  // This list is scoped to the next seven days, so the year adds a whole line
  // on mobile without disambiguating any booking.
  const readableDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short' }).format(parseLocalDate(date))
    : date || '—';

  // Risk is a semantic text signal. A bordered pill made each score compete
  // with the actual review task, especially in the narrow mobile rows.
  const getRiskChip = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-800';
      case 'medium': return 'text-amber-800';
      case 'low': return 'text-emerald-800';
      default: return 'text-brand-muted';
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
  const riskRowLabel = (level: string) => {
    switch (level) {
      case 'high': return t('analytics.riskRowHigh', 'High risk');
      case 'medium': return t('analytics.riskRowMedium', 'Medium risk');
      case 'low': return t('analytics.riskRowLow', 'Low risk');
      default: return t('analytics.riskScore', 'Risk score');
    }
  };

  const renderPredictionRow = (prediction: NoShowPrediction) => (
    <button
      key={prediction.reservation_id}
      type="button"
      aria-expanded={selectedPrediction === prediction}
      className={`w-full border-b border-brand-line text-left transition-colors hover:bg-brand-ink/[0.02] focus-visible:outline-2 focus-visible:outline-brand-action ${featured ? 'min-h-[70px] py-3.5 max-[359px]:min-h-[64px] max-[359px]:py-3' : 'min-h-[56px] py-2.5'}`}
      onClick={() => setSelectedPrediction(selectedPrediction === prediction ? null : prediction)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-x-3 gap-y-1">
            <span className={`min-w-0 truncate text-brand-ink ${featured ? 'text-[16px] font-semibold' : 'text-[15px] font-medium'}`}>{prediction.customer_name}</span>
            <span
              aria-label={featured ? riskRowLabel(prediction.risk_level) : t('analytics.riskScore', 'Risk score {{score}}', { score: prediction.risk_score })}
              className={`inline-flex min-w-[91px] shrink-0 justify-end py-1 tabular-nums ${featured ? 'text-[13px] font-semibold' : 'text-[12px] font-medium'} ${getRiskChip(prediction.risk_level)}`}
            >
              {featured ? riskRowLabel(prediction.risk_level) : <>{riskBand(prediction.risk_level) && <span className="mr-1">{riskBand(prediction.risk_level)} ·</span>}{prediction.risk_score}/100</>}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-brand-muted sm:text-[13px]">
            <span>{readableDate(prediction.date)} · {prediction.time?.slice(0, 5) || '—'}</span>
            <span aria-hidden="true">·</span>
            <span>{t('analytics.partyOf', { size: prediction.party_size })}</span>
          </div>
        </div>
        <ThiingsIcon name="chevron-down" pxSize={18} className={`mt-1 flex-shrink-0 transition-transform ${selectedPrediction === prediction ? 'rotate-180' : ''}`} />
      </div>
      {selectedPrediction === prediction && (featured || (prediction.recommendations?.length ?? 0) > 0) && (
        <div className="mt-4 border-t border-brand-line pt-4">
          {featured && <p className="mb-3 text-[12px] tabular-nums text-brand-muted">{t('analytics.riskScore', 'Risk score {{score}}', { score: prediction.risk_score })}</p>}
          {(prediction.recommendations?.length ?? 0) > 0 && <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-muted">{t('analytics.recommendedActions')}</p>
            <ul className="space-y-2">
              {(prediction.recommendations ?? []).map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[15px] text-brand-ink">
                  <span className="mt-0.5 text-brand-action" aria-hidden="true">&bull;</span>
                  <span>{RECOMMENDATION_I18N[language]?.[rec] ?? rec}</span>
                </li>
              ))}
            </ul>
          </>}
        </div>
      )}
    </button>
  );

  if (isLoading) {
    return (
      <div className="py-8">
        <div role="status" className="flex items-center justify-center">
          <div aria-hidden="true" className="w-8 h-8 border-4 border-brand-action border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-brand-muted">{t('analytics.loadingPredictions')}</span>
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
        <p className="font-semibold text-brand-ink">{t('dashboard.errorTitle')}</p>
        <p className="text-sm text-brand-muted mt-1 mb-4">{t('errors.serverError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-action hover:bg-brand-ink text-brand-paper text-sm font-semibold rounded-[100px] transition-colors"
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
      {featured && summary && summary.total_upcoming > 0 ? (
        <header className="pb-3 sm:pb-5">
          <p className="text-[13px] font-medium text-brand-muted">{t('analytics.nextSevenDays', 'Next 7 days')}</p>
          <h2 aria-label={`${reviewCount > 0 ? reviewCount : summary.total_upcoming} ${reviewCount > 0 ? t('analytics.toReview', 'to review') : t('analytics.upcomingReservations', 'upcoming bookings')}`} className="mt-1 flex items-baseline gap-2 font-brand text-brand-ink">
            <span className="text-[46px] leading-none tracking-[-0.06em] tabular-nums sm:text-[54px]">{reviewCount > 0 ? reviewCount : summary.total_upcoming}</span>
            <span className="text-[27px] leading-tight tracking-[-0.04em] sm:text-[30px]">{reviewCount > 0 ? t('analytics.toReview', 'to review') : t('analytics.upcomingReservations', 'upcoming bookings')}</span>
          </h2>
          {reviewCount > 0 && <p className="mt-1 text-[14px] leading-[1.45] text-brand-muted">
            {t('analytics.among', 'Among')}{' '}
            <span className="tabular-nums text-brand-ink">{summary.total_upcoming}</span>{' '}
            {t('analytics.upcomingReservations', 'upcoming bookings')}
          </p>}
          <p className="mt-2 text-[12px] leading-[1.45] text-brand-muted">{t('analytics.riskScoreNote', 'Estimated risk, not a no-show probability.')}</p>
        </header>
      ) : (
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-1 sm:border-b sm:border-brand-line sm:pb-4">
          <h2 className="font-brand text-[16px] font-medium text-brand-ink">{t('analytics.noShowPredictions')}</h2>
          {predictions.length > 0 && <p className="text-[12px] text-brand-muted">{t('analytics.predictionsListLimit', 'Up to 10 in this list')}</p>}
        </header>
      )}

      {/* The historical rate in the API combines cancellations and no-shows,
          and can be a default 15% with no history. Do not present it as an
          observed no-show rate. */}
      {summary && summary.total_upcoming > 0 && !featured && (
        <div className="border-b border-brand-line pb-4 pt-3 sm:py-5">
          <p className="flex items-baseline gap-2">
            <span className="font-brand text-[32px] leading-none tabular-nums text-brand-ink sm:text-[36px]">{summary.total_upcoming}</span>
            <span className="text-[13px] text-brand-muted">{t('analytics.upcomingReservations', 'upcoming bookings')}</span>
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]">
            <span className="text-red-700"><span className="font-brand text-[17px] tabular-nums">{summary.high_risk}</span> {t('analytics.highRisk')}</span>
            <span className="text-amber-700"><span className="font-brand text-[17px] tabular-nums">{summary.medium_risk}</span> {t('analytics.mediumRisk')}</span>
          </p>
        </div>
      )}

      {/* The actionable shortlist stays visible; lower-risk rows are available
          without competing with the review task on the first fold. */}
      {predictions.length === 0 ? (
        <div className="py-7">
          <p className="font-brand text-[22px] text-brand-ink">
            {summary && summary.total_upcoming === 0 ? t('analytics.noUpcomingPredictions', 'No upcoming reservations to assess') : t('analytics.predictionsUnavailable', 'Risk predictions unavailable')}
          </p>
          <p className="text-sm text-brand-muted mt-1">
            {summary && summary.total_upcoming === 0 ? t('analytics.noUpcomingPredictionsNote', 'No reservations were returned for the next seven days.') : t('analytics.predictionsUnavailableNote', 'No risk conclusion can be drawn from this view.')}
          </p>
        </div>
      ) : (
        <div>
          {featured && reviewRows > 0 ? <>
            {reviewPredictions.map(renderPredictionRow)}
            {reviewCount > reviewRows && <p className="pt-2 text-[12px] text-brand-muted">{t('analytics.reviewShortlistCount', { shown: reviewRows, total: reviewCount })}</p>}
            {otherPredictions.length > 0 && <details className="group">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-2 text-[12px] text-brand-muted focus-visible:outline-2 focus-visible:outline-brand-action">
                <span>{t('analytics.otherRiskRowsWithLimit', 'Other assessed bookings · up to 10 shown')}</span>
                <ThiingsIcon name="chevron-down" pxSize={16} className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pl-3">{otherPredictions.map(renderPredictionRow)}</div>
            </details>}
          </> : predictions.map(renderPredictionRow)}
        </div>
      )}

      {featured && predictions.length > 0 && reviewRows === 0 && <p className="pt-2 text-[12px] text-brand-muted">{t('analytics.predictionsListLimit', 'Up to 10 in this list')}</p>}
      {!featured && predictions.length > 0 && <p className="pb-2 pt-5 text-[12px] leading-[1.5] text-brand-muted sm:pt-6">{t('analytics.predictionsLimits', 'Scores are not probabilities and do not confirm a no-show.')}</p>}
    </section>
  );
}
