import { icons, type LucideIcon } from 'lucide-react';

export const ICON_NAMES = [
  'accessibility', 'activity', 'airplane', 'alert-circle', 'alert-triangle',
  'arrow-down', 'arrow-left', 'arrow-right', 'ban', 'bar-chart',
  'bell', 'bot', 'brain', 'calendar', 'calendar-check', 'calendar-days', 'calendar-x',
  'chat', 'check', 'check-circle', 'chef-hat', 'chevron-down',
  'chevron-left', 'chevron-right', 'chevron-up', 'city', 'classical-building',
  'clipboard', 'clipboard-list', 'clock', 'close', 'coffee', 'credit-card',
  'crown', 'cycle', 'dashboard', 'diamond', 'dining',
  'dna', 'dollar', 'download', 'edit', 'external-link',
  'file-text', 'filter', 'fire', 'gear', 'gift',
  'globe', 'green-check', 'heart', 'help-circle', 'home',
  'info', 'keyboard', 'languages', 'lightning', 'lightbulb',
  'layout-grid', 'link', 'lock', 'logout', 'mail', 'map',
  'map-pin', 'menu', 'microphone', 'money-bag', 'moon',
  'neighborhood', 'party', 'pause', 'phone', 'phone-call',
  'phone-off', 'plate', 'play', 'plus', 'red-x',
  'refresh', 'rotate', 'save', 'scales', 'search',
  'send', 'settings', 'shield-check', 'siren', 'sparkles',
  'star', 'stethoscope', 'sun', 'target', 'timer',
  'trash', 'trending-down', 'trending-up', 'unlink', 'user',
  'users', 'utensils', 'utensils-crossed', 'voice', 'volume', 'wifi',
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
  'alert-circle': 'CircleAlert',
  'calendar-days': 'CalendarDays',
  'calendar-x': 'CalendarX',
  'clipboard-list': 'ClipboardList',
  'layout-grid': 'LayoutGrid',
  'utensils-crossed': 'UtensilsCrossed',
  'alert-triangle': 'TriangleAlert',
  'bar-chart': 'ChartBar',
  chat: 'MessageCircle',
  'check-circle': 'CircleCheck',
  city: 'Building2',
  'classical-building': 'Landmark',
  close: 'X',
  cycle: 'RefreshCcw',
  dashboard: 'LayoutDashboard',
  diamond: 'Gem',
  dining: 'Utensils',
  dollar: 'DollarSign',
  edit: 'Pencil',
  filter: 'Funnel',
  fire: 'Flame',
  gear: 'Settings',
  'green-check': 'CircleCheck',
  'help-circle': 'CircleQuestionMark',
  home: 'House',
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
  'x-circle': 'CircleX',
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
