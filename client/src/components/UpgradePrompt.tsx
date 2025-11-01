/**
 * Upgrade Prompt Component
 *
 * Displays when user tries to access a premium feature
 */

import { motion } from 'framer-motion';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradePromptProps {
  feature: string;
  featureDescription?: string;
  currentPlan?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function UpgradePrompt({
  feature,
  featureDescription,
  currentPlan = 'Basic',
  size = 'medium',
}: UpgradePromptProps) {
  const navigate = useNavigate();

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
      className={`glass-card ${sizeClasses[size]} text-center`}
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className={`${iconSizes[size]} rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto mb-4`}
      >
        <Lock className={`${size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-8 h-8'} text-white`} />
      </motion.div>

      {/* Heading */}
      <h3 className={`${headingSizes[size]} font-bold mb-2 gradient-text`}>
        Upgrade Required
      </h3>

      {/* Description */}
      <p className="text-gray-400 mb-4">
        {featureDescription ||
          `${feature} is available on Professional and Enterprise plans`}
      </p>

      {/* Current Plan Badge */}
      {currentPlan && (
        <div className="inline-flex items-center gap-2 px-3 py-1 glass-subtle rounded-full text-sm text-gray-300 mb-4">
          <span>Current plan:</span>
          <span className="font-semibold text-indigo-400">{currentPlan}</span>
        </div>
      )}

      {/* Features List */}
      <div className="glass-subtle p-4 rounded-xl mb-6 text-left">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">
            Upgrade to get:
          </span>
        </div>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>Unlimited reservations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>Advanced analytics & insights</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>Waitlist management</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>SMS notifications</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>Priority support</span>
          </li>
        </ul>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleUpgrade}
        className="w-full px-6 py-3 glass-button-primary text-white font-semibold flex items-center justify-center gap-2 group"
      >
        Upgrade Now
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Fine print */}
      <p className="text-xs text-gray-500 mt-3">
        14-day free trial • Cancel anytime
      </p>
    </motion.div>
  );
}
