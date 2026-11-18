import { useTranslation } from 'react-i18next';

interface DepositBadgeProps {
  amount?: number | null;
  currency?: string | null;
  held: boolean;
}

export default function DepositBadge({ amount, currency, held }: DepositBadgeProps) {
  const { t, i18n } = useTranslation();
  if (!amount) return null;

  const formatted = currency && new Intl.NumberFormat(i18n.language, {
    style: 'currency', currency,
  }).format(amount);
  const label = !formatted ? t('dashboard.deposit.recorded')
    : held ? t('dashboard.deposit.authorized', { amount: formatted })
      : t('dashboard.deposit.captured', { amount: formatted });

  const color = formatted ? 'bg-emerald-50 text-emerald-800' : 'bg-deep-charcoal/5 text-warm-stone';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {label}
    </span>
  );
}
