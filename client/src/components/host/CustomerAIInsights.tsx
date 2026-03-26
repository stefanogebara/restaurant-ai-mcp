import ThiingsIcon from '../common/ThiingsIcon';
import { getSentimentColor } from './customerProfileHelpers';
import type { TextSignals } from './customerProfile.types';

interface CustomerAIInsightsProps {
  textSignals: TextSignals | null;
  onAnalyze: () => void;
}

export default function CustomerAIInsights({ textSignals, onAnalyze }: CustomerAIInsightsProps) {
  return (
    <div className="bg-white rounded-2xl border border-border-gray p-6">
      <h2 className="text-lg font-semibold font-serif text-deep-charcoal mb-4 flex items-center gap-2">
        <ThiingsIcon name="sparkles" size="sm" />
        AI Insights
      </h2>

      {textSignals ? (
        <div className="space-y-4">
          <div className="p-3 bg-amber-600/5 rounded-xl border border-amber-600/20">
            <div className="text-xs text-stone-gray">
              Based on {textSignals.text_sources_count} text sources (AI confidence: {textSignals.ai_confidence}%)
            </div>
          </div>

          {textSignals.key_phrases && textSignals.key_phrases.length > 0 && (
            <div>
              <div className="text-xs text-stone-gray mb-2">Key Phrases</div>
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
              <div className="text-xs text-stone-gray mb-1">Detected Occasions</div>
              <div className="flex flex-wrap gap-1">
                {textSignals.occasion_types.map((o) => (
                  <span key={o} className="px-2 py-0.5 bg-burgundy/10 text-burgundy text-xs rounded-full capitalize">{o.replace('_', ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {textSignals.seating_preferences && textSignals.seating_preferences.length > 0 && (
            <div>
              <div className="text-xs text-stone-gray mb-1">Seating Preferences (AI)</div>
              <div className="flex flex-wrap gap-1">
                {textSignals.seating_preferences.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-violet-600/10 text-violet-600 text-xs rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}

          {textSignals.sentiment_summary && (
            <div>
              <div className="text-xs text-stone-gray mb-1">AI Sentiment</div>
              <div className={`text-sm font-medium capitalize ${getSentimentColor(textSignals.sentiment_summary)}`}>
                {textSignals.sentiment_summary.replace('_', ' ')}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-stone-gray">
          <ThiingsIcon name="sparkles" pxSize={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No AI insights available yet.</p>
          <p className="text-xs mt-1">Run analysis to extract signals from text data.</p>
          <button type="button" onClick={onAnalyze} className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm rounded-xl hover:bg-amber-700 transition-colors">
            Analyze with AI
          </button>
        </div>
      )}
    </div>
  );
}
