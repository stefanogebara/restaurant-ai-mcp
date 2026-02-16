import { icons, type LucideIcon } from 'lucide-react';

export const ICON_NAMES = [
  'accessibility', 'activity', 'airplane', 'alert-circle', 'alert-triangle',
  'arrow-down', 'arrow-left', 'arrow-right', 'ban', 'bar-chart',
  'bell', 'bot', 'brain', 'calendar', 'calendar-check',
  'chat', 'check', 'check-circle', 'chef-hat', 'chevron-down',
  'chevron-left', 'chevron-right', 'chevron-up', 'city', 'classical-building',
  'clipboard', 'clock', 'close', 'coffee', 'credit-card',
  'crown', 'cycle', 'dashboard', 'diamond', 'dining',
  'dna', 'dollar', 'download', 'edit', 'external-link',
  'file-text', 'filter', 'fire', 'gear', 'gift',
  'globe', 'green-check', 'heart', 'help-circle', 'home',
  'info', 'keyboard', 'languages', 'lightning', 'lightbulb',
  'link', 'lock', 'logout', 'mail', 'map',
  'map-pin', 'menu', 'microphone', 'money-bag', 'moon',
  'neighborhood', 'party', 'pause', 'phone', 'phone-call',
  'phone-off', 'plate', 'play', 'plus', 'red-x',
  'refresh', 'rotate', 'save', 'scales', 'search',
  'send', 'settings', 'shield-check', 'siren', 'sparkles',
  'star', 'stethoscope', 'sun', 'target', 'timer',
  'trash', 'trending-down', 'trending-up', 'unlink', 'user',
  'users', 'utensils', 'voice', 'volume', 'wifi',
  'wifi-off', 'wine', 'wrench', 'x-circle', 'zap',
] as const;

export type IconName = typeof ICON_NAMES[number];

type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ThiingsIconProps {
  name: IconName;
  size?: IconSize;
  /** Override size with exact pixel value */
  pxSize?: number;
  className?: string;
  alt?: string;
}

const SIZE_PX: Record<IconSize, number> = {
  xs: 16,
  sm: 24,
  md: 48,
  lg: 96,
  xl: 128,
};

/** Explicit remap for icon names that don't auto-convert to PascalCase Lucide names */
const REMAP: Record<string, string> = {
  airplane: 'Plane',
  chat: 'MessageCircle',
  city: 'Building2',
  'classical-building': 'Landmark',
  close: 'X',
  cycle: 'RefreshCcw',
  dashboard: 'LayoutDashboard',
  diamond: 'Gem',
  dining: 'Utensils',
  dollar: 'DollarSign',
  edit: 'Pencil',
  fire: 'Flame',
  gear: 'Settings',
  'green-check': 'CircleCheck',
  lightning: 'Zap',
  logout: 'LogOut',
  microphone: 'Mic',
  'money-bag': 'Banknote',
  neighborhood: 'MapPinHouse',
  party: 'PartyPopper',
  plate: 'CircleDot',
  'red-x': 'CircleX',
  refresh: 'RefreshCw',
  rotate: 'RotateCw',
  scales: 'Scale',
  trash: 'Trash2',
  voice: 'AudioLines',
  volume: 'Volume2',
};

function toPascalCase(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function resolve(name: string): LucideIcon | undefined {
  const mapped = REMAP[name] ?? toPascalCase(name);
  return (icons as Record<string, LucideIcon>)[mapped];
}

/** @deprecated No longer serves PNG paths. Kept for API compatibility. */
export function getIconPath(name: IconName, _size: IconSize = 'sm'): string {
  return `/icons/3d/sm/${name}.png`;
}

export default function ThiingsIcon({
  name,
  size = 'sm',
  pxSize,
  className = '',
}: ThiingsIconProps) {
  const actualPx = pxSize || SIZE_PX[size];
  const IconComponent = resolve(name);

  if (!IconComponent) {
    if (import.meta.env.DEV) {
      console.warn(`[ThiingsIcon] No Lucide mapping for "${name}"`);
    }
    return <span data-missing-icon={name} style={{ width: actualPx, height: actualPx }} className="inline-block shrink-0" />;
  }

  return <IconComponent size={actualPx} className={`inline-block shrink-0 ${className}`} />;
}
