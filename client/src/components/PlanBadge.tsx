/**
 * Plan Badge Component
 *
 * Displays user's current subscription plan
 */

import ThiingsIcon, { type IconName } from './common/ThiingsIcon';

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
      case 'starter':
        return {
          bg: 'bg-[#57534E]',
          iconName: 'zap' as IconName,
          textColor: 'text-[#57534E]',
          bgLight: 'bg-[#F5F5F4]',
          borderColor: 'border-[#E7E5E4]',
        };
      case 'growth':
        return {
          bg: 'bg-[#9F1239]',
          iconName: 'star' as IconName,
          textColor: 'text-[#9F1239]',
          bgLight: 'bg-[#9F1239]/10',
          borderColor: 'border-[#9F1239]/30',
        };
      case 'scale':
        return {
          bg: 'bg-[#7c3aed]',
          iconName: 'crown' as IconName,
          textColor: 'text-[#7c3aed]',
          bgLight: 'bg-[#7c3aed]/10',
          borderColor: 'border-[#7c3aed]/30',
        };
      default:
        return {
          bg: 'bg-[#57534E]',
          iconName: 'zap' as IconName,
          textColor: 'text-[#57534E]',
          bgLight: 'bg-[#F5F5F4]',
          borderColor: 'border-[#E7E5E4]',
        };
    }
  };

  const { bg, iconName, textColor, bgLight, borderColor } = getPlanStyle();

  // Size variants
  const sizeClasses = {
    small: {
      container: 'px-2 py-1 text-xs',
      iconPx: 12,
    },
    medium: {
      container: 'px-3 py-1.5 text-sm',
      iconPx: 16,
    },
    large: {
      container: 'px-4 py-2 text-base',
      iconPx: 20,
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`inline-flex items-center gap-1.5 ${classes.container} rounded-full ${bgLight} border ${borderColor}`}
      >
        <div className={`rounded-full ${bg} flex items-center justify-center p-0.5`} style={{ width: classes.iconPx, height: classes.iconPx }}>
          <ThiingsIcon name={iconName} pxSize={classes.iconPx - 4} />
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
