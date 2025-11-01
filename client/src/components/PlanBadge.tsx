/**
 * Plan Badge Component
 *
 * Displays user's current subscription plan
 */

import { Crown, Zap, Star } from 'lucide-react';

interface PlanBadgeProps {
  plan: string;
  isTrial?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function PlanBadge({
  plan,
  isTrial = false,
  size = 'medium',
}: PlanBadgeProps) {
  const planLower = plan.toLowerCase();

  // Get plan styling
  const getPlanStyle = () => {
    switch (planLower) {
      case 'basic':
        return {
          bg: 'from-blue-500 to-cyan-500',
          icon: Zap,
          color: 'text-blue-400',
        };
      case 'professional':
        return {
          bg: 'from-purple-500 to-pink-500',
          icon: Star,
          color: 'text-purple-400',
        };
      case 'enterprise':
        return {
          bg: 'from-amber-500 to-orange-500',
          icon: Crown,
          color: 'text-amber-400',
        };
      default:
        return {
          bg: 'from-gray-500 to-gray-600',
          icon: Zap,
          color: 'text-gray-400',
        };
    }
  };

  const { bg, icon: Icon, color } = getPlanStyle();

  // Size variants
  const sizeClasses = {
    small: {
      container: 'px-2 py-1 text-xs',
      icon: 'w-3 h-3',
    },
    medium: {
      container: 'px-3 py-1.5 text-sm',
      icon: 'w-4 h-4',
    },
    large: {
      container: 'px-4 py-2 text-base',
      icon: 'w-5 h-5',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`inline-flex items-center gap-1.5 ${classes.container} rounded-full glass-strong`}
      >
        <div className={`${classes.icon} rounded-full bg-gradient-to-br ${bg} flex items-center justify-center p-0.5`}>
          <Icon className="w-full h-full text-white" />
        </div>
        <span className="font-semibold text-white">{plan}</span>
      </div>

      {isTrial && (
        <span className="px-2 py-0.5 text-xs rounded-full glass-subtle text-emerald-400 font-semibold">
          Free Trial
        </span>
      )}
    </div>
  );
}
