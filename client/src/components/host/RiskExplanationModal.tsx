import { X, AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';

interface RiskFactor {
  factor: string;
  impact: number;
  description: string;
}

interface RiskExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: {
    customer_name: string;
    party_size: number;
    date: string;
    time: string;
    ml_risk_score?: number;
    ml_risk_level?: string;
    ml_confidence?: number;
  };
  riskFactors?: RiskFactor[];
}

export default function RiskExplanationModal({
  isOpen,
  onClose,
  reservation,
  riskFactors = []
}: RiskExplanationModalProps) {
  if (!isOpen) return null;

  const riskScore = reservation.ml_risk_score || 0;
  const riskLevel = reservation.ml_risk_level || 'unknown';
  const confidence = reservation.ml_confidence || 0;

  // Group factors by positive (risk increasing) and negative (risk decreasing)
  const riskIncreasing = riskFactors.filter(f => f.impact > 0);
  const riskDecreasing = riskFactors.filter(f => f.impact < 0);

  // Get risk level color and description
  const getRiskLevelInfo = () => {
    switch (riskLevel) {
      case 'very-high':
        return {
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-500/10',
          label: 'Very High Risk',
          description: 'Strong likelihood of no-show. Deposit or confirmation strongly recommended.',
          emoji: '🚨'
        };
      case 'high':
        return {
          color: 'text-orange-600 dark:text-orange-400',
          bg: 'bg-orange-500/10',
          label: 'High Risk',
          description: 'Elevated no-show risk. Confirmation call recommended.',
          emoji: '⚠️'
        };
      case 'medium':
        return {
          color: 'text-yellow-600 dark:text-yellow-400',
          bg: 'bg-yellow-500/10',
          label: 'Medium Risk',
          description: 'Moderate no-show risk. Consider SMS reminder.',
          emoji: '⚡'
        };
      default:
        return {
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-500/10',
          label: 'Low Risk',
          description: 'Low no-show probability. Standard handling.',
          emoji: '✅'
        };
    }
  };

  const levelInfo = getRiskLevelInfo();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${levelInfo.bg} flex items-center justify-center text-2xl`}>
              {levelInfo.emoji}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">No-Show Risk Analysis</h2>
              <p className="text-sm text-muted-foreground">
                {reservation.customer_name} • Party of {reservation.party_size}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Risk Score Summary */}
          <div className={`${levelInfo.bg} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-lg font-semibold ${levelInfo.color}`}>
                {levelInfo.label}
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-bold ${levelInfo.color}`}>
                  {riskScore}/100
                </span>
                <span className="text-sm text-muted-foreground">
                  {confidence}% confidence
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {levelInfo.description}
            </p>
          </div>

          {/* What This Means for Staff */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">What This Means</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {riskLevel === 'very-high' && (
                    <>This reservation has multiple red flags. <strong>Require a credit card deposit</strong> (€10-20/person)
                    or make a confirmation call to verify they're still coming. Without action, there's a strong chance this party won't show up.</>
                  )}
                  {riskLevel === 'high' && (
                    <>This reservation shows elevated no-show risk. <strong>Call the customer 24 hours before</strong> to confirm
                    they're still coming. A quick 2-minute call can prevent an empty table during peak hours.</>
                  )}
                  {riskLevel === 'medium' && (
                    <>This reservation has some risk factors but nothing alarming. Consider sending an <strong>automated SMS reminder</strong>
                    a few hours before. No phone call needed unless other concerns arise.</>
                  )}
                  {riskLevel === 'low' && (
                    <>This reservation looks reliable! The customer has shown commitment signals. <strong>No special action needed</strong> -
                    just provide excellent service as usual.</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Risk Increasing Factors */}
          {riskIncreasing.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <h3 className="font-semibold text-foreground">Risk Factors</h3>
              </div>
              <div className="space-y-2">
                {riskIncreasing.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-orange-600 dark:text-orange-400 font-bold">
                        +{factor.impact}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {factor.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getFactorExplanation(factor.factor)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Decreasing Factors */}
          {riskDecreasing.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-green-600 dark:text-green-400" />
                <h3 className="font-semibold text-foreground">Positive Signals</h3>
              </div>
              <div className="space-y-2">
                {riskDecreasing.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 dark:text-green-400 font-bold">
                        {factor.impact}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {factor.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getFactorExplanation(factor.factor)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Factors Available */}
          {riskFactors.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                Detailed risk factors not available for this reservation.
                <br />
                Risk score calculated using standard criteria.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to provide staff-friendly explanations
function getFactorExplanation(factor: string): string {
  const explanations: Record<string, string> = {
    // Customer History
    new_customer: "No previous visits. First-time guests are statistically more likely to no-show.",
    high_no_show_history: "This customer has failed to show up for previous reservations.",
    moderate_no_show_history: "This customer has occasionally missed reservations in the past.",
    good_history: "Loyal customer with excellent track record. Very reliable!",

    // Party Size
    very_large_party: "Large groups (8+) have higher cancellation rates due to coordination challenges.",
    large_party: "Larger parties are harder to coordinate, increasing no-show risk.",
    medium_party: "Moderate-sized groups have slightly elevated no-show rates.",

    // Booking Timing
    same_day_urgent: "Booked very recently - they're coming NOW. Highly committed!",
    short_notice: "Last-minute bookings (1-2 days) are often impulsive and plans may change.",
    far_advance: "Booked weeks ahead - plans may change, they may forget, or make other arrangements.",

    // Time Slot
    prime_time: "Weekend prime-time slots (Fri/Sat 7-9 PM) have highest no-show rates.",
    peak_hour: "Popular dinner hours see more no-shows due to high demand and multiple bookings.",

    // Contact
    no_email: "Phone-only contact makes confirmation harder and suggests less commitment.",

    // Customer Type
    tourist: "Tourists have higher no-show rates due to travel uncertainties and itinerary changes.",
    local: "Local customers are more reliable and have stronger commitment to showing up.",

    // Language
    language_barrier: "Potential communication issues may lead to misunderstandings about reservation.",

    // Special Occasion
    special_occasion: "Birthday/Anniversary bookings show high commitment - people rarely skip these!",

    // Seating Preference
    terrace_weather_risk: "Last-minute terrace requests are weather-dependent and may cancel if it rains.",

    // Dietary Restrictions
    dietary_needs: "Customers with special dietary needs show intentionality and planning.",

    // First Timer
    first_timer: "First-time visitors are less familiar with the restaurant and slightly less committed."
  };

  return explanations[factor] || "This factor affects the likelihood of the customer showing up.";
}
