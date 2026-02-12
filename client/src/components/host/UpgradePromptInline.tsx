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
    <div className="bg-card rounded-lg shadow-lg p-6 border border-border relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ThiingsIcon name="lock" pxSize={20} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{feature}</h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ThiingsIcon name="sparkles" pxSize={12} />
              {requiredPlan} Feature
            </span>
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-muted-foreground mb-4">
            {description}
          </p>
        )}

        {/* CTA Button */}
        <button
          onClick={handleUpgrade}
          className="w-full bg-primary/10 hover:bg-primary/20 text-primary font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <span>Upgrade to {requiredPlan}</span>
          <ThiingsIcon name="arrow-right" pxSize={16} />
        </button>
      </div>
    </div>
  );
}
