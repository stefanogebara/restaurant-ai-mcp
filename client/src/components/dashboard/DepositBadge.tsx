import { useTranslation } from 'react-i18next';

interface DepositBadgeProps {
  amount?: number | null;
  currency?: string;
}

export default function DepositBadge({ amount, currency = 'BRL' }: DepositBadgeProps) {
  const { t } = useTranslation();
  if (!amount) return null;

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-600/[8%] text-violet-600">
      {formatted} {t('dashboard.deposit.held', 'held')}
    </span>
  );
}
