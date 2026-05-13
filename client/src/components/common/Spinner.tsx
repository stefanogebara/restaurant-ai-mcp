/**
 * CSS-based loading spinner to replace Loader2 + animate-spin patterns.
 * Keeps the burgundy brand color by default.
 */

import { useTranslation } from 'react-i18next';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-[3px]',
};

export default function Spinner({ size = 'md', className = '', ariaLabel }: SpinnerProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-full border-border-gray border-t-burgundy animate-spin ${SIZE_CLASSES[size]} ${className}`}
      role="status"
      aria-label={ariaLabel ?? t('common.loading', 'Loading')}
    />
  );
}
