import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';
export { formatCurrency } from '../../utils/currency';

export function getTierColor(tier: string): string {
  switch (tier) {
    case 'vip': return 'text-ocre-600';
    case 'regular': return 'text-emerald-700';
    case 'occasional': return 'text-stone-gray';
    case 'new': return 'text-stone-gray';
    case 'at_risk': return 'text-amber-600';
    default: return 'text-stone-gray';
  }
}

export function getTierBgColor(tier: string): string {
  switch (tier) {
    case 'vip': return 'bg-ocre-600/10 border-ocre-600/30';
    case 'regular': return 'bg-emerald-50 border-emerald-200';
    case 'occasional': return 'bg-soft-gray border-glass-border-dark';
    case 'new': return 'bg-stone-gray/10 border-stone-gray/30';
    case 'at_risk': return 'bg-amber-600/10 border-amber-600/30';
    default: return 'bg-stone-gray/10 border-stone-gray/30';
  }
}

export function getTierIcon(tier: string) {
  const iconMap: Record<string, IconName> = {
    vip: 'star',
    regular: 'users',
    occasional: 'activity',
    new: 'trending-up',
    at_risk: 'alert-triangle',
  };
  return <ThiingsIcon name={iconMap[tier] || 'users'} size="xs" />;
}
