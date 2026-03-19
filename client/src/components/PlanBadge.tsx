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
      case 'inicial':
        return {
          bg: 'bg-stone-gray',
          iconName: 'zap' as IconName,
          textColor: 'text-stone-gray',
          bgLight: 'bg-soft-gray',
          borderColor: 'border-border-gray',
        };
      case 'growth':
      case 'crescimento':
        return {
          bg: 'bg-burgundy',
          iconName: 'star' as IconName,
          textColor: 'text-burgundy',
          bgLight: 'bg-burgundy/10',
          borderColor: 'border-burgundy/30',
        };
      case 'scale':
      case 'escala':
        return {
          bg: 'bg-violet-600',
          iconName: 'crown' as IconName,
          textColor: 'text-violet-600',
          bgLight: 'bg-violet-600/10',
          borderColor: 'border-violet-600/30',
        };
      default:
        return {
          bg: 'bg-stone-gray',
          iconName: 'zap' as IconName,
          textColor: 'text-stone-gray',
          bgLight: 'bg-soft-gray',
          borderColor: 'border-border-gray',
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
        <span className="px-2 py-0.5 text-xs rounded-full bg-rose-600/10 border border-rose-600/30 text-rose-600 font-semibold">
          Free Trial
        </span>
      )}
    </div>
  );
}
