import { useState, useEffect } from 'react';

interface NoShowPrediction {
  reservation_id: string;
  customer_name: string;
  party_size: number;
  date: string;
  time: string;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  days_until: number;
  recommendations: string[];
}

interface NoShowSummary {
  total_upcoming: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  historical_no_show_rate: number;
  estimated_potential_no_shows: number;
}

export default function NoShowPredictions() {
  const [predictions, setPredictions] = useState<NoShowPrediction[]>([]);
  const [summary, setSummary] = useState<NoShowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPrediction, setSelectedPrediction] = useState<NoShowPrediction | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/predictive-analytics?type=no-show');
      const result = await response.json();

      if (result.success) {
        setPredictions(result.predictions || []);
        setSummary(result.summary);
      }
    } catch (error) {
      console.error('Error fetching no-show predictions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-600 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-muted-foreground">Loading predictions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 p-6">
        <h2 className="text-2xl font-bold text-primary-foreground mb-2">🔮 No-Show Risk Predictions</h2>
        <p className="text-primary-foreground/90 text-sm">
          AI-powered analysis of upcoming reservations with high no-show probability
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-muted/30 border-b border-border">
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground">{summary.total_upcoming}</div>
            <div className="text-xs text-muted-foreground mt-1">Upcoming (7 days)</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.high_risk}</div>
            <div className="text-xs text-muted-foreground mt-1">High Risk</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">{summary.medium_risk}</div>
            <div className="text-xs text-muted-foreground mt-1">Medium Risk</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{summary.historical_no_show_rate}%</div>
            <div className="text-xs text-muted-foreground mt-1">Historical Rate</div>
          </div>
        </div>
      )}

      {/* Predictions List */}
      <div className="p-6">
        {predictions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <div className="text-xl text-muted-foreground">No high-risk reservations found!</div>
            <p className="text-sm text-muted-foreground mt-2">All upcoming reservations look good.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {predictions.map((prediction, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all ${getRiskColor(prediction.risk_level)}`}
                onClick={() => setSelectedPrediction(selectedPrediction === prediction ? null : prediction)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskBadgeColor(prediction.risk_level)}`}>
                        {prediction.risk_score}% Risk
                      </span>
                      <span className="font-bold text-lg">{prediction.customer_name}</span>
                      <span className="text-sm text-muted-foreground">Party of {prediction.party_size}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {new Date(prediction.date).toLocaleDateString()} at {prediction.time}
                      </span>
                      <span className="text-muted-foreground">
                        {prediction.days_until === 0 ? 'Today' : prediction.days_until === 1 ? 'Tomorrow' : `In ${prediction.days_until} days`}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <svg
                      className={`w-5 h-5 transition-transform ${selectedPrediction === prediction ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Recommendations */}
                {selectedPrediction === prediction && prediction.recommendations.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="font-semibold mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recommended Actions:
                    </div>
                    <ul className="space-y-2">
                      {prediction.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-muted/30 px-6 py-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Predictions based on historical no-show patterns, party size, booking timing, and reservation time slots.
            Risk scores update in real-time as new data becomes available.
          </span>
        </div>
      </div>
    </div>
  );
}
