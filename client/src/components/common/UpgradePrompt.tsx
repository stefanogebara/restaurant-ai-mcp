import ThiingsIcon from './ThiingsIcon';
import { PLAN_NAMES, PLAN_PRICES, type PlanType } from '../../config/planFeatures';

interface UpgradePromptProps {
  requiredPlan: PlanType;
  feature: string;
  description?: string;
}

export default function UpgradePrompt({ requiredPlan, feature, description }: UpgradePromptProps) {
  const planName = PLAN_NAMES[requiredPlan];
  const price = PLAN_PRICES[requiredPlan as keyof typeof PLAN_PRICES];

  const handleUpgrade = () => {
    // Navigate to pricing page or open upgrade modal
    window.location.href = '/#pricing';
  };

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white border border-border-gray rounded-2xl shadow-xl overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-burgundy/10 p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-burgundy/10 border-2 border-burgundy/20 mb-4">
            <ThiingsIcon name="lock" pxSize={40} />
          </div>
          <h1 className="text-3xl font-bold text-deep-charcoal mb-2">{feature}</h1>
          {description && (
            <p className="text-stone-gray text-lg">{description}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6 p-4 bg-soft-gray rounded-xl border border-border-gray">
            <ThiingsIcon name="sparkles" pxSize={24} className="flex-shrink-0" />
            <p className="text-deep-charcoal">
              This feature is available on the <span className="font-bold text-burgundy">{planName}</span> plan
              {price && (
                <span className="text-stone-gray"> (€{price}/month)</span>
              )}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <h3 className="font-semibold text-deep-charcoal text-lg mb-4">Unlock with {planName}:</h3>
            {(requiredPlan === 'growth' || requiredPlan === 'scale') && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>ML-powered performance insights and ROI tracking</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>Customer lifetime value analytics</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>Voice AI agent and advanced analytics</span>
                </li>
                <li className="flex items-start gap-2 text-stone-gray">
                  <div className="w-1.5 h-1.5 rounded-full bg-burgundy mt-2 flex-shrink-0" />
                  <span>Customer DNA behavioral profiling</span>
                </li>
              </ul>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleUpgrade}
              className="flex-1 bg-burgundy hover:bg-burgundy-dark text-white font-semibold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
            >
              <span>Upgrade to {planName}</span>
              <ThiingsIcon name="arrow-right" pxSize={20} />
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex-1 bg-soft-gray hover:bg-border-gray text-deep-charcoal font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              Go Back
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-sm text-stone-gray mt-6">
            14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
