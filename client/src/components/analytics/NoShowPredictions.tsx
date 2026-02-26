import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import { useNoShowPredictions, type NoShowPrediction } from '../../hooks/usePredictiveAnalytics';

export default function NoShowPredictions() {
  const { data, isLoading } = useNoShowPredictions();
  const predictions = data?.predictions ?? [];
  const summary = data?.summary ?? null;
  const [selectedPrediction, setSelectedPrediction] = useState<NoShowPrediction | null>(null);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-600/10 border-red-600/20';
      case 'medium': return 'text-amber-600 bg-amber-600/10 border-amber-600/20';
      case 'low': return 'text-green-600 bg-green-500/10 border-green-500/20';
      default: return 'text-stone-gray bg-warm-white border-border-gray';
    }
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-600 text-white';
      case 'medium': return 'bg-amber-600 text-white';
      case 'low': return 'bg-green-600 text-white';
      default: return 'bg-stone-gray text-white';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-8 shadow-sm">
        <div role="status" className="flex items-center justify-center">
          <div aria-hidden="true" className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-warm-stone">Loading predictions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-border-gray">
        <h2 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-1">No-Show Risk Predictions</h2>
        <p className="text-sm text-warm-stone">
          AI-powered analysis of upcoming reservations with high no-show probability
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-soft-gray/30 border-b border-border-gray">
          <div className="text-center">
            <div className="text-3xl font-bold text-deep-charcoal">{summary.total_upcoming}</div>
            <div className="text-xs text-warm-stone mt-1">Upcoming (7 days)</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.high_risk}</div>
            <div className="text-xs text-warm-stone mt-1">High Risk</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-600">{summary.medium_risk}</div>
            <div className="text-xs text-warm-stone mt-1">Medium Risk</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-burgundy">{summary.historical_no_show_rate}%</div>
            <div className="text-xs text-warm-stone mt-1">Historical Rate</div>
          </div>
        </div>
      )}

      {/* Predictions List */}
      <div className="p-6">
        {predictions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-600/10 rounded-2xl flex items-center justify-center">
              <ThiingsIcon name="check-circle" pxSize={28} />
            </div>
            <p className="font-semibold text-deep-charcoal">No high-risk reservations</p>
            <p className="text-sm text-stone-gray mt-1">All upcoming reservations look good.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {predictions.map((prediction, index) => (
              <button
                key={index}
                type="button"
                aria-expanded={selectedPrediction === prediction}
                className={`w-full text-left border rounded-xl p-4 hover:shadow-md transition-all ${getRiskColor(prediction.risk_level)}`}
                onClick={() => setSelectedPrediction(selectedPrediction === prediction ? null : prediction)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskBadgeColor(prediction.risk_level)}`}>
                        {prediction.risk_score}% Risk
                      </span>
                      <span className="font-bold text-lg">{prediction.customer_name}</span>
                      <span className="text-sm text-warm-stone">Party of {prediction.party_size}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <ThiingsIcon name="calendar" pxSize={16} />
                        {new Date(prediction.date).toLocaleDateString()} at {prediction.time}
                      </span>
                      <span className="text-warm-stone">
                        {prediction.days_until === 0 ? 'Today' : prediction.days_until === 1 ? 'Tomorrow' : `In ${prediction.days_until} days`}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <ThiingsIcon name="chevron-down" pxSize={20} className={`transition-transform ${selectedPrediction === prediction ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded Recommendations */}
                {selectedPrediction === prediction && prediction.recommendations.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="font-semibold mb-2 flex items-center gap-2">
                      <ThiingsIcon name="check-circle" pxSize={16} />
                      Recommended Actions:
                    </div>
                    <ul className="space-y-2">
                      {prediction.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-burgundy mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-soft-gray/30 px-6 py-4 border-t border-border-gray">
        <div className="flex items-center gap-2 text-xs text-warm-stone">
          <ThiingsIcon name="info" pxSize={16} />
          <span>
            Predictions based on historical no-show patterns, party size, booking timing, and reservation time slots.
            Risk scores update in real-time as new data becomes available.
          </span>
        </div>
      </div>
    </div>
  );
}
