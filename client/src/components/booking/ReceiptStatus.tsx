import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { normalizeStatus } from '../../utils/reservationStatus';

interface ReceiptStatusProps {
  status?: string;
  verification: 'checking' | 'error' | 'verified';
  onRetry: () => void;
}

export default function ReceiptStatus({ status, verification, onRetry }: ReceiptStatusProps) {
  const { t } = useTranslation();
  const normalized = typeof status === 'string' ? normalizeStatus(status).replace('_', '-') : '';
  const verified = verification === 'verified';
  const confirmed = verified && normalized === 'confirmed';
  const labels: Record<string, string> = {
    confirmed: 'reservations.confirmed',
    cancelled: 'reservations.statusCancelled',
    pending: 'reservations.statusPending',
    completed: 'reservations.confirmation.statusCompleted',
    seated: 'reservations.confirmation.statusSeated',
    'no-show': 'reservations.confirmation.statusNoShow',
  };
  const statusLabel = Object.hasOwn(labels, normalized) ? labels[normalized] : undefined;
  const label = verification === 'checking' ? 'reservations.confirmation.statusChecking'
    : !verified ? 'reservations.confirmation.statusUnavailable'
      : statusLabel ?? 'reservations.confirmation.statusUnavailable';
  const tone = confirmed ? 'bg-emerald-600/[8%] text-emerald-700'
    : verified && (normalized === 'cancelled' || normalized === 'no-show') ? 'bg-red-600/[8%] text-red-700'
      : verification === 'error' || normalized === 'pending' || !statusLabel ? 'bg-amber-600/[8%] text-amber-800'
        : 'bg-soft-gray text-warm-stone';

  return <>
    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-7 ${tone}`}>
      <ThiingsIcon name={confirmed ? 'check' : 'calendar'} pxSize={36} />
    </div>
    <div role="status" className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5 ${tone}`}>
      <span className="text-[13px] font-semibold">{t(label)}</span>
    </div>
    <h1 className="font-serif text-4xl font-normal text-deep-charcoal tracking-tight mb-2">
      {t(confirmed ? 'reservations.reservationConfirmed' : 'reservations.confirmation.receiptTitle')}
    </h1>
    <p className="text-[15px] text-warm-stone font-light mb-6">
      {t(confirmed ? 'reservations.reservationRecorded' : verification === 'error'
        ? 'reservations.confirmation.statusError' : 'reservations.confirmation.receiptDetails')}
    </p>
    {verification === 'error' && <button type="button" onClick={onRetry}
      className="min-h-[44px] px-5 mb-6 rounded-full text-sm font-medium text-burgundy hover:bg-burgundy/[6%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:ring-offset-2">
      {t('reservations.confirmation.retryStatus')}
    </button>}
  </>;
}
