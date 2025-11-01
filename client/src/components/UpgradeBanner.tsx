/**
 * Upgrade Banner Component
 *
 * Compact banner to show upgrade prompts inline
 */

import { Sparkles, ArrowRight } from 'lucide-react';

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
      <div className="glass-subtle p-3 rounded-lg flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-gray-300">
            <span className="font-semibold text-white">{feature}</span> available
            on Pro
          </span>
        </div>
        <button
          onClick={handleUpgrade}
          className="px-3 py-1 glass-button text-xs text-white font-semibold flex-shrink-0"
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 border-2 border-indigo-500/30">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-semibold mb-1">
            Unlock {feature}
          </h4>
          <p className="text-sm text-gray-400 mb-3">
            Upgrade to Professional or Enterprise to access this feature
          </p>

          <button
            onClick={handleUpgrade}
            className="inline-flex items-center gap-2 px-4 py-2 glass-button-primary text-sm text-white font-semibold group"
          >
            View Plans
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
