/**
 * Upgrade Prompt Component
 *
 * Displays when user tries to access a premium feature
 */

import { motion } from 'framer-motion';
import ThiingsIcon from './common/ThiingsIcon';

interface UpgradePromptProps {
  feature: string;
  featureDescription?: string;
  currentPlan?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function UpgradePrompt({
  feature,
  featureDescription,
  currentPlan = 'Starter',
  size = 'medium',
}: UpgradePromptProps) {
  const handleUpgrade = () => {
    // Navigate to pricing section
    window.location.href = '/#pricing';
  };

  // Size variants
  const sizeClasses = {
    small: 'p-4',
    medium: 'p-6',
    large: 'p-8',
  };

  const iconSizes = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
  };

  const headingSizes = {
    small: 'text-lg',
    medium: 'text-xl',
    large: 'text-2xl',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white rounded-2xl shadow-lg border border-[#E7E5E4] ${sizeClasses[size]} text-center`}
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className={`${iconSizes[size]} rounded-full bg-[#9F1239] flex items-center justify-center mx-auto mb-4`}
      >
        <ThiingsIcon name="lock" pxSize={size === 'small' ? 16 : size === 'medium' ? 24 : 32} />
      </motion.div>

      {/* Heading */}
      <h3 className={`${headingSizes[size]} font-bold mb-2 text-[#1C1917]`}>
        Upgrade Required
      </h3>

      {/* Description */}
      <p className="text-[#57534E] mb-4">
        {featureDescription ||
          `${feature} is available on Growth or Scale plans`}
      </p>

      {/* Current Plan Badge */}
      {currentPlan && (
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F5F5F4] rounded-full text-sm text-[#57534E] mb-4 border border-[#E7E5E4]">
          <span>Current plan:</span>
          <span className="font-semibold text-[#9F1239]">{currentPlan}</span>
        </div>
      )}

      {/* Features List */}
      <div className="bg-[#F5F5F4] p-4 rounded-xl mb-6 text-left border border-[#E7E5E4]">
        <div className="flex items-center gap-2 mb-3">
          <ThiingsIcon name="sparkles" pxSize={16} />
          <span className="text-sm font-semibold text-[#1C1917]">
            Upgrade to get:
          </span>
        </div>
        <ul className="space-y-2 text-sm text-[#57534E]">
          <li className="flex items-start gap-2">
            <span className="text-[#16a34a] mt-0.5">✓</span>
            <span>Unlimited reservations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#16a34a] mt-0.5">✓</span>
            <span>Advanced analytics & insights</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#16a34a] mt-0.5">✓</span>
            <span>Waitlist management</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#16a34a] mt-0.5">✓</span>
            <span>Automated notifications</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#16a34a] mt-0.5">✓</span>
            <span>Priority support</span>
          </li>
        </ul>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleUpgrade}
        className="w-full px-6 py-3 bg-[#9F1239] hover:bg-[#881337] rounded-xl text-white font-semibold flex items-center justify-center gap-2 group transition-colors"
      >
        Upgrade Now
        <span className="group-hover:translate-x-1 transition-transform inline-flex"><ThiingsIcon name="arrow-right" pxSize={16} /></span>
      </button>

      {/* Fine print */}
      <p className="text-xs text-[#A8A29E] mt-3">
        14-day free trial • Cancel anytime
      </p>
    </motion.div>
  );
}
