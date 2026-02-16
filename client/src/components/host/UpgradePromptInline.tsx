/**
 * Inline Upgrade Prompt - Compact version for dashboard panels
 *
 * Shows a teaser for Pro features within the dashboard layout
 */

import ThiingsIcon from '../common/ThiingsIcon';

interface UpgradePromptInlineProps {
  feature: string;
  description?: string;
  requiredPlan?: string;
}

export default function UpgradePromptInline({
  feature,
  description,
  requiredPlan = 'Professional'
}: UpgradePromptInlineProps) {
  const handleUpgrade = () => {
    window.location.href = '/#pricing';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-[#E7E5E4] relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#9F1239]/5 via-transparent to-[#F5F5F4]/50 pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[#9F1239]/10 rounded-xl">
            <ThiingsIcon name="lock" pxSize={20} />
          </div>
          <div>
            <h3 className="font-semibold text-[#1C1917]">{feature}</h3>
            <span className="text-xs text-[#78716C] flex items-center gap-1">
              <ThiingsIcon name="sparkles" pxSize={12} />
              {requiredPlan} Feature
            </span>
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-[#78716C] mb-4">
            {description}
          </p>
        )}

        {/* CTA Button */}
        <button
          onClick={handleUpgrade}
          className="w-full bg-[#9F1239]/10 hover:bg-[#9F1239]/20 text-[#9F1239] font-medium py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <span>Upgrade to {requiredPlan}</span>
          <ThiingsIcon name="arrow-right" pxSize={16} />
        </button>
      </div>
    </div>
  );
}
