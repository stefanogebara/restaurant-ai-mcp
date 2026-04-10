import ThiingsIcon, { type IconName } from './common/ThiingsIcon';

type PlanBadgeSize = 'small' | 'medium' | 'large';

interface PlanBadgeProps {
  plan: string;
  isTrial?: boolean;
  size?: PlanBadgeSize;
}

const SIZE_CLASSES: Record<PlanBadgeSize, string> = {
  small: 'text-xs px-2 py-1 gap-1',
  medium: 'text-sm px-2.5 py-1.5 gap-1.5',
  large: 'text-base px-3 py-2 gap-2',
};

function getPlanIcon(plan: string): IconName {
  const normalized = plan.toLowerCase();

  if (normalized === 'growth' || normalized === 'profissional') {
    return 'star';
  }

  if (normalized === 'scale' || normalized === 'enterprise') {
    return 'crown';
  }

  return 'zap';
}

export default function PlanBadge({
  plan,
  isTrial = false,
  size = 'medium',
}: PlanBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full bg-rose-600/10 font-semibold text-rose-700 ${SIZE_CLASSES[size]}`}>
      <ThiingsIcon name={getPlanIcon(plan)} pxSize={size === 'large' ? 18 : 14} />
      <span>{plan}</span>
      {isTrial && (
        <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Free Trial
        </span>
      )}
    </span>
  );
}
