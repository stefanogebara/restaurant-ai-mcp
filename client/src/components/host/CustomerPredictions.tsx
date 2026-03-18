import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { Prediction, Occasion } from './customerProfile.types';

interface CustomerPredictionsProps {
  predictions: Prediction[];
  occasions: Occasion[];
}

export default function CustomerPredictions({ predictions, occasions }: CustomerPredictionsProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';

  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6 shadow-lg">
      <h2 className="text-lg font-semibold font-serif text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="trending-up" size="sm" />
        {t('customerPredictions.title')}
      </h2>

      {predictions.length > 0 ? (
        <div className="space-y-3">
          {predictions.map((pred, i) => (
            <div key={i} className="p-3 bg-rose-600/5 rounded-xl border border-rose-600/20">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-deep-charcoal capitalize">{pred.prediction_type.replace(/_/g, ' ')}</div>
                <div className="text-xs text-stone-gray">{t('customerPredictions.confidence', { value: Math.round(pred.confidence_score * 100) })}</div>
              </div>
              <div className="text-lg font-bold text-rose-600 mt-1">{pred.predicted_value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="w-10 h-10 mx-auto mb-2 bg-soft-gray rounded-xl flex items-center justify-center">
            <ThiingsIcon name="trending-up" pxSize={18} />
          </div>
          <p className="text-sm text-stone-gray">{t('customerPredictions.noPredictions')}</p>
          <p className="text-xs text-muted-stone mt-1">{t('customerPredictions.noPredictionsHint')}</p>
        </div>
      )}

      {occasions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-gray">
          <div className="text-sm font-semibold text-deep-charcoal mb-2">{t('customerPredictions.upcomingOccasions')}</div>
          {occasions.map((occ, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-burgundy/5 rounded-xl mb-1">
              <span className="text-sm text-deep-charcoal capitalize">{occ.occasion_type}</span>
              <span className="text-sm font-medium text-burgundy">
                {new Date(occ.next_predicted_date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
