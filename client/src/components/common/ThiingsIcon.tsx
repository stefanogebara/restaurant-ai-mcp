/**
 * ThiingsIcon - 3D icon component using thiings.co icons
 *
 * Renders pre-downloaded 3D PNG icons at various sizes.
 * All icons are stored locally in /icons/3d/{size}/{name}.png
 */

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

const SIZE_MAP: Record<IconSize, { folder: string; px: number }> = {
  xs: { folder: 'sm', px: 16 },
  sm: { folder: 'sm', px: 24 },
  md: { folder: 'md', px: 48 },
  lg: { folder: 'lg', px: 96 },
  xl: { folder: 'xl', px: 128 },
};

export function getIconPath(name: IconName, size: IconSize = 'sm'): string {
  const { folder } = SIZE_MAP[size];
  return `/icons/3d/${folder}/${name}.png`;
}

export default function ThiingsIcon({
  name,
  size = 'sm',
  pxSize,
  className = '',
  alt,
}: ThiingsIconProps) {
  const { folder, px } = SIZE_MAP[size];
  const actualPx = pxSize || px;
  const src = `/icons/3d/${folder}/${name}.png`;

  return (
    <img
      src={src}
      alt={alt || name.replace(/-/g, ' ')}
      width={actualPx}
      height={actualPx}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 ${className}`}
      style={{ width: actualPx, height: actualPx }}
    />
  );
}
