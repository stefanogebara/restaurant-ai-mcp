import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import ConfirmModal from '../common/ConfirmModal';

interface DepositRefundActionProps {
  reservationId: string;
  onActionComplete?: () => void;
}

export default function DepositRefundAction({ reservationId, onActionComplete }: DepositRefundActionProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { success } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pending' | 'error' | null>(null);

  if (role !== 'owner') return null;

  const refund = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post<{ state: 'pending' | 'refunded' }>('/refund-deposit', { reservation_id: reservationId });
      if (data.state === 'pending') setResult('pending');
      if (data.state === 'refunded') success(t('dashboard.deposit.refundConfirmed'));
      onActionComplete?.();
    } catch {
      setResult('error');
    } finally {
      setConfirming(false);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded-full border border-border-gray px-3 py-2 text-xs font-medium text-deep-charcoal hover:bg-soft-gray"
        onClick={() => setConfirming(true)}
      >
        {t('dashboard.deposit.refund')}
      </button>
      {result === 'pending' && <span role="status" className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{t('dashboard.deposit.refundPending')}</span>}
      {result === 'error' && <span role="alert" className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">{t('dashboard.deposit.refundFailed')}</span>}
      {confirming && createPortal(
        <ConfirmModal
          open
          title={t('dashboard.deposit.refundConfirmTitle')}
          message={t('dashboard.deposit.refundConfirmMessage')}
          confirmLabel={t('dashboard.deposit.refund')}
          onConfirm={() => void refund()}
          onCancel={() => { if (!loading) setConfirming(false); }}
          isLoading={loading}
        />,
        document.body,
      )}
    </div>
  );
}
