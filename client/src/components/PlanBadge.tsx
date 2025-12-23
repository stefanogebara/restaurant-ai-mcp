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
          bg: 'bg-[#57534E]',
          icon: Zap,
          textColor: 'text-[#57534E]',
          bgLight: 'bg-[#F5F5F4]',
          borderColor: 'border-[#E7E5E4]',
        };
      case 'professional':
        return {
          bg: 'bg-[#9F1239]',
          icon: Star,
          textColor: 'text-[#9F1239]',
          bgLight: 'bg-[#9F1239]/10',
          borderColor: 'border-[#9F1239]/30',
        };
      case 'enterprise':
        return {
          bg: 'bg-[#7c3aed]',
          icon: Crown,
          textColor: 'text-[#7c3aed]',
          bgLight: 'bg-[#7c3aed]/10',
          borderColor: 'border-[#7c3aed]/30',
        };
      default:
        return {
          bg: 'bg-[#57534E]',
          icon: Zap,
          textColor: 'text-[#57534E]',
          bgLight: 'bg-[#F5F5F4]',
          borderColor: 'border-[#E7E5E4]',
        };
    }
  };

  const { bg, icon: Icon, textColor, bgLight, borderColor } = getPlanStyle();

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
        className={`inline-flex items-center gap-1.5 ${classes.container} rounded-full ${bgLight} border ${borderColor}`}
      >
        <div className={`${classes.icon} rounded-full ${bg} flex items-center justify-center p-0.5`}>
          <Icon className="w-full h-full text-white" />
        </div>
        <span className={`font-semibold ${textColor}`}>{plan}</span>
      </div>

      {isTrial && (
        <span className="px-2 py-0.5 text-xs rounded-full bg-[#16a34a]/10 border border-[#16a34a]/30 text-[#16a34a] font-semibold">
          Free Trial
        </span>
      )}
    </div>
  );
}
