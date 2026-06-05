import { useTranslation } from 'react-i18next';

interface DemoBannerProps {
  daysLeft: number;
  token: string;
}

export default function DemoBanner({ daysLeft, token }: DemoBannerProps) {
  const { t } = useTranslation();

  const urgencyClass =
    daysLeft <= 0
      ? 'bg-red-50 border-b border-red-200 text-red-700'
      : daysLeft <= 2
      ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
      : 'bg-warm-white border-b border-glass-border-dark text-deep-charcoal';

  const expiryLabel =
    daysLeft <= 0
      ? t('demo.banner.expired', 'Demo expired')
      : daysLeft === 1
      ? t('demo.banner.oneDayLeft', 'Demo mode \u00b7 1 day left')
      : t('demo.banner.daysLeft', 'Demo mode \u00b7 {{count}} days left', { count: daysLeft });

  return (
    <div className={`sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-2 ${urgencyClass}`}>
      <span className="text-sm font-medium">{expiryLabel}</span>
      <a
        href={`/login?from=demo&token=${token}`}
        className="px-4 py-1.5 bg-burgundy text-white rounded-lg text-xs font-semibold hover:bg-burgundy-dark transition-colors whitespace-nowrap"
      >
        {t('demo.banner.upgrade', 'Upgrade to keep your data')} &rarr;
      </a>
    </div>
  );
}
