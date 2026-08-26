import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';

export function getTierColor(tier: string): string {
  switch (tier) {
    case 'vip': return 'text-ocre-600';
    case 'regular': return 'text-burgundy';
    case 'occasional': return 'text-rose-600';
    case 'new': return 'text-stone-gray';
    case 'at_risk': return 'text-amber-600';
    default: return 'text-stone-gray';
  }
}

export function getTierBgColor(tier: string): string {
  switch (tier) {
    case 'vip': return 'bg-ocre-600/10 border-ocre-600/30';
    case 'regular': return 'bg-burgundy/10 border-burgundy/30';
    case 'occasional': return 'bg-rose-600/10 border-rose-600/30';
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

export function formatCurrency(amount: number): string {
  const lang = navigator.language || 'pt-BR';
  const isBRL = lang.toLowerCase().startsWith('pt');
  return new Intl.NumberFormat(isBRL ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: isBRL ? 'BRL' : 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
