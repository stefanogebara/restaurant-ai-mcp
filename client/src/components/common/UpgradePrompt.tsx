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
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white border border-[#E7E5E4] rounded-2xl shadow-xl overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-[#9F1239]/10 p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#9F1239]/10 border-2 border-[#9F1239]/20 mb-4">
            <ThiingsIcon name="lock" pxSize={40} />
          </div>
          <h1 className="text-3xl font-bold text-[#1C1917] mb-2">{feature}</h1>
          {description && (
            <p className="text-[#57534E] text-lg">{description}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6 p-4 bg-[#F5F5F4] rounded-xl border border-[#E7E5E4]">
            <ThiingsIcon name="sparkles" pxSize={24} className="flex-shrink-0" />
            <p className="text-[#1C1917]">
              This feature is available on the <span className="font-bold text-[#9F1239]">{planName}</span> plan
              {price && (
                <span className="text-[#57534E]"> (€{price}/month)</span>
              )}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <h3 className="font-semibold text-[#1C1917] text-lg mb-4">Unlock with {planName}:</h3>
            {(requiredPlan === 'growth' || requiredPlan === 'scale') && (
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-[#57534E]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9F1239] mt-2 flex-shrink-0" />
                  <span>ML-powered performance insights and ROI tracking</span>
                </li>
                <li className="flex items-start gap-2 text-[#57534E]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9F1239] mt-2 flex-shrink-0" />
                  <span>Customer lifetime value analytics</span>
                </li>
                <li className="flex items-start gap-2 text-[#57534E]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9F1239] mt-2 flex-shrink-0" />
                  <span>Voice AI agent and advanced analytics</span>
                </li>
                <li className="flex items-start gap-2 text-[#57534E]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9F1239] mt-2 flex-shrink-0" />
                  <span>Customer DNA behavioral profiling</span>
                </li>
              </ul>
            )}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleUpgrade}
              className="flex-1 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
            >
              <span>Upgrade to {planName}</span>
              <ThiingsIcon name="arrow-right" pxSize={20} />
            </button>
            <button
              onClick={() => window.history.back()}
              className="flex-1 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              Go Back
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-sm text-[#57534E] mt-6">
            14-day free trial • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
