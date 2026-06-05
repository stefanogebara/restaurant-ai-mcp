import { useTranslation } from 'react-i18next';
import ThiingsIcon, { type IconName } from '../common/ThiingsIcon';
import { LARGE_PARTY_THRESHOLD, DEPOSIT_RECOMMENDATION } from '../../config/businessDefaults';

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
  const { t } = useTranslation();
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
          color: 'text-burgundy',
          bg: 'bg-burgundy/10',
          label: 'Very High Risk',
          description: 'Strong likelihood of no-show. Deposit or confirmation strongly recommended.',
          iconName: 'siren' as IconName
        };
      case 'high':
        return {
          color: 'text-amber-600',
          bg: 'bg-amber-600/10',
          label: 'High Risk',
          description: 'Elevated no-show risk. Confirmation call recommended.',
          iconName: 'alert-triangle' as IconName
        };
      case 'medium':
        return {
          color: 'text-amber-600',
          bg: 'bg-amber-600/10',
          label: 'Medium Risk',
          description: 'Moderate no-show risk. Consider sending a reminder.',
          iconName: 'lightning' as IconName
        };
      default:
        return {
          color: 'text-rose-600',
          bg: 'bg-rose-600/10',
          label: 'Low Risk',
          description: 'Low no-show probability. Standard handling.',
          iconName: 'green-check' as IconName
        };
    }
  };

  const levelInfo = getRiskLevelInfo();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Risk Explanation" className="glass-modal max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark p-6 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${levelInfo.bg} flex items-center justify-center`}>
              <ThiingsIcon name={levelInfo.iconName} size="md" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-deep-charcoal">No-Show Risk Analysis</h2>
              <p className="text-sm text-stone-gray">
                {reservation.customer_name} • Party of {reservation.party_size}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-soft-gray rounded-xl transition-colors"
          >
            <ThiingsIcon name="close" size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Risk Score Summary */}
          <div className={`${levelInfo.bg} rounded-xl p-4 border border-glass-border-dark`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-lg font-semibold ${levelInfo.color}`}>
                {levelInfo.label}
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-bold ${levelInfo.color}`}>
                  {riskScore}/100
                </span>
                <span className="text-sm text-stone-gray">
                  {confidence}% confidence
                </span>
              </div>
            </div>
            <p className="text-sm text-stone-gray">
              {levelInfo.description}
            </p>
          </div>

          {/* What This Means for Staff */}
          <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ThiingsIcon name="info" size="sm" className="mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-deep-charcoal mb-1">{t('host.whatThisMeans', 'What This Means')}</h3>
                <p className="text-sm text-stone-gray leading-relaxed">
                  {riskLevel === 'very-high' && t('host.riskAction.veryHigh', 'This reservation has multiple red flags. Require a credit card deposit ({{deposit}}/person) or make a confirmation call to verify they\'re still coming. Without action, there\'s a strong chance this party won\'t show up.', { deposit: DEPOSIT_RECOMMENDATION })}
                  {riskLevel === 'high' && t('host.riskAction.high', 'This reservation shows elevated no-show risk. Call the customer 24 hours before to confirm they\'re still coming. A quick 2-minute call can prevent an empty table during peak hours.')}
                  {riskLevel === 'medium' && t('host.riskAction.medium', 'This reservation has some risk factors but nothing alarming. Consider sending an automated reminder a few hours before. No phone call needed unless other concerns arise.')}
                  {riskLevel === 'low' && t('host.riskAction.low', 'This reservation looks reliable! The customer has shown commitment signals. No special action needed - just provide excellent service as usual.')}
                </p>
              </div>
            </div>
          </div>

          {/* Risk Increasing Factors */}
          {riskIncreasing.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ThiingsIcon name="trending-up" size="sm" />
                <h3 className="font-semibold text-deep-charcoal">{t('host.riskFactors', 'Risk Factors')}</h3>
              </div>
              <div className="space-y-2">
                {riskIncreasing.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-soft-gray rounded-xl border border-glass-border-dark"
                  >
                    <div className="w-12 h-12 rounded-full bg-amber-600/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-600 font-bold">
                        +{factor.impact}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-deep-charcoal">
                        {factor.description}
                      </p>
                      <p className="text-xs text-muted-stone mt-0.5">
                        {getFactorExplanation(factor.factor, t)}
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
                <ThiingsIcon name="trending-down" size="sm" />
                <h3 className="font-semibold text-deep-charcoal">{t('host.positiveSignals', 'Positive Signals')}</h3>
              </div>
              <div className="space-y-2">
                {riskDecreasing.map((factor, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-soft-gray rounded-xl border border-glass-border-dark"
                  >
                    <div className="w-12 h-12 rounded-full bg-rose-600/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-rose-600 font-bold">
                        {factor.impact}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-deep-charcoal">
                        {factor.description}
                      </p>
                      <p className="text-xs text-muted-stone mt-0.5">
                        {getFactorExplanation(factor.factor, t)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Factors Available */}
          {riskFactors.length === 0 && (
            <div className="text-center py-8 text-muted-stone">
              <ThiingsIcon name="alert-triangle" size="md" className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {t('host.riskFactorsUnavailable', 'Detailed risk factors not available for this reservation. Risk score calculated using standard criteria.')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-glass-panel backdrop-blur-glass-nav border-t border-glass-border-dark p-4 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-burgundy text-white rounded-xl font-medium hover:bg-burgundy-dark transition-colors"
          >
            {t('host.gotIt', 'Got it')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to provide staff-friendly explanations
function getFactorExplanation(factor: string, t: (key: string, fallback: string, opts?: Record<string, unknown>) => string): string {
  const explanations: Record<string, string> = {
    // Customer History
    new_customer: t('host.riskFactor.newCustomer', 'No previous visits. First-time guests are statistically more likely to no-show.'),
    high_no_show_history: t('host.riskFactor.highNoShowHistory', 'This customer has failed to show up for previous reservations.'),
    moderate_no_show_history: t('host.riskFactor.moderateNoShowHistory', 'This customer has occasionally missed reservations in the past.'),
    good_history: t('host.riskFactor.goodHistory', 'Loyal customer with excellent track record. Very reliable!'),

    // Party Size
    very_large_party: t('host.riskFactor.veryLargeParty', 'Large groups ({{threshold}}+) have higher cancellation rates due to coordination challenges.', { threshold: LARGE_PARTY_THRESHOLD }),
    large_party: t('host.riskFactor.largeParty', 'Larger parties are harder to coordinate, increasing no-show risk.'),
    medium_party: t('host.riskFactor.mediumParty', 'Moderate-sized groups have slightly elevated no-show rates.'),

    // Booking Timing
    same_day_urgent: t('host.riskFactor.sameDayUrgent', "Booked very recently - they're coming NOW. Highly committed!"),
    short_notice: t('host.riskFactor.shortNotice', 'Last-minute bookings (1-2 days) are often impulsive and plans may change.'),
    far_advance: t('host.riskFactor.farAdvance', 'Booked weeks ahead - plans may change, they may forget, or make other arrangements.'),

    // Time Slot
    prime_time: t('host.riskFactor.primeTime', 'Weekend prime-time slots (Fri/Sat 7-9 PM) have highest no-show rates.'),
    peak_hour: t('host.riskFactor.peakHour', 'Popular dinner hours see more no-shows due to high demand and multiple bookings.'),

    // Contact
    no_email: t('host.riskFactor.noEmail', 'Phone-only contact makes confirmation harder and suggests less commitment.'),

    // Customer Type
    tourist: t('host.riskFactor.tourist', 'Tourists have higher no-show rates due to travel uncertainties and itinerary changes.'),
    local: t('host.riskFactor.local', 'Local customers are more reliable and have stronger commitment to showing up.'),

    // Language
    language_barrier: t('host.riskFactor.languageBarrier', 'Potential communication issues may lead to misunderstandings about reservation.'),

    // Special Occasion
    special_occasion: t('host.riskFactor.specialOccasion', 'Birthday/Anniversary bookings show high commitment - people rarely skip these!'),

    // Seating Preference
    terrace_weather_risk: t('host.riskFactor.terraceWeatherRisk', 'Last-minute terrace requests are weather-dependent and may cancel if it rains.'),

    // Dietary Restrictions
    dietary_needs: t('host.riskFactor.dietaryNeeds', 'Customers with special dietary needs show intentionality and planning.'),

    // First Timer
    first_timer: t('host.riskFactor.firstTimer', 'First-time visitors are less familiar with the restaurant and slightly less committed.')
  };

  return explanations[factor] || t('host.riskFactor.default', 'This factor affects the likelihood of the customer showing up.');
}
