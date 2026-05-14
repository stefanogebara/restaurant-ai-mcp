import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { getSentimentColor } from './customerProfileHelpers';
import type { TextSignals } from './customerProfile.types';

interface CustomerAIInsightsProps {
  textSignals: TextSignals | null;
  onAnalyze: () => void;
}

export default function CustomerAIInsights({ textSignals, onAnalyze }: CustomerAIInsightsProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6">
      <h2 className="text-lg font-semibold font-serif text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="sparkles" size="sm" />
        {t('host.customerProfile.aiInsights.title')}
      </h2>

      {textSignals ? (
        <div className="space-y-4">
          <div className="p-3 bg-amber-600/5 rounded-xl border border-amber-600/20">
            <div className="text-xs text-stone-gray">
              {t('host.customerProfile.aiInsights.basedOn', {
                count: textSignals.text_sources_count,
                confidence: textSignals.ai_confidence,
              })}
            </div>
          </div>

          {textSignals.key_phrases && textSignals.key_phrases.length > 0 && (
            <div>
              <div className="text-xs text-stone-gray mb-2">{t('host.customerProfile.aiInsights.keyPhrases')}</div>
              <div className="space-y-1">
                {textSignals.key_phrases.map((phrase, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ThiingsIcon name="chat" pxSize={12} className="mt-1 shrink-0" />
                    <span className="text-sm text-deep-charcoal italic">"{phrase}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {textSignals.occasion_types && textSignals.occasion_types.length > 0 && (
            <div>
              <div className="text-xs text-stone-gray mb-1">{t('host.customerProfile.aiInsights.detectedOccasions')}</div>
              <div className="flex flex-wrap gap-1">
                {textSignals.occasion_types.map((o) => (
                  <span key={o} className="px-2 py-0.5 bg-burgundy/10 text-burgundy text-xs rounded-full capitalize">{o.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {textSignals.seating_preferences && textSignals.seating_preferences.length > 0 && (
            <div>
              <div className="text-xs text-stone-gray mb-1">{t('host.customerProfile.aiInsights.seatingPreferences')}</div>
              <div className="flex flex-wrap gap-1">
                {textSignals.seating_preferences.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-violet-600/10 text-violet-600 text-xs rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {textSignals.sentiment_summary && (
            <div>
              <div className="text-xs text-stone-gray mb-1">{t('host.customerProfile.aiInsights.sentiment')}</div>
              <div className={`text-sm font-medium capitalize ${getSentimentColor(textSignals.sentiment_summary)}`}>
                {textSignals.sentiment_summary.replace(/_/g, ' ')}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-stone-gray">
          <ThiingsIcon name="sparkles" pxSize={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('host.customerProfile.aiInsights.empty')}</p>
          <p className="text-xs mt-1">{t('host.customerProfile.aiInsights.emptyHint')}</p>
          <button type="button" onClick={onAnalyze} className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm rounded-xl hover:bg-amber-700 transition-colors">
            {t('host.customerProfile.aiInsights.analyzeButton')}
          </button>
        </div>
      )}
    </div>
  );
}
