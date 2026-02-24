/**
 * Upgrade Banner Component
 *
 * Compact banner to show upgrade prompts inline
 */

import ThiingsIcon from './common/ThiingsIcon';

interface UpgradeBannerProps {
  feature: string;
  compact?: boolean;
}

export default function UpgradeBanner({
  feature,
  compact = false,
}: UpgradeBannerProps) {
  const handleUpgrade = () => {
    window.location.href = '/#pricing';
  };

  if (compact) {
    return (
      <div className="bg-soft-gray p-3 rounded-2xl flex items-center justify-between gap-3 border border-border-gray">
        <div className="flex items-center gap-2">
          <ThiingsIcon name="sparkles" pxSize={16} className="flex-shrink-0" />
          <span className="text-sm text-stone-gray">
            <span className="font-semibold text-deep-charcoal">{feature}</span> available
            on Growth
          </span>
        </div>
        <button
          onClick={handleUpgrade}
          className="px-3 py-1 bg-burgundy hover:bg-burgundy-dark rounded-lg text-xs text-white font-semibold flex-shrink-0 transition-colors"
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-burgundy/30 shadow-lg">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-burgundy flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name="sparkles" pxSize={20} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-deep-charcoal font-semibold mb-1">
            Unlock {feature}
          </h4>
          <p className="text-sm text-stone-gray mb-3">
            Upgrade to Growth or Scale to access this feature
          </p>

          <button
            onClick={handleUpgrade}
            className="inline-flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark rounded-xl text-sm text-white font-semibold group transition-colors"
          >
            View Plans
            <span className="group-hover:translate-x-1 transition-transform inline-flex"><ThiingsIcon name="arrow-right" pxSize={16} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
