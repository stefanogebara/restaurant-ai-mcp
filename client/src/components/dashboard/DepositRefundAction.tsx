import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ConfirmModal from '../common/ConfirmModal';

interface DepositRefundActionProps {
  reservationId: string;
  onActionComplete?: () => void;
}

export default function DepositRefundAction({ reservationId, onActionComplete }: DepositRefundActionProps) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pending' | 'error' | null>(null);

  if (role !== 'owner') return null;

  const refund = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post<{ state: 'pending' | 'refunded' }>('/refund-deposit', { reservation_id: reservationId });
      setResult(data.state === 'pending' ? 'pending' : null);
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
        className="rounded-full border border-burgundy/30 px-3 py-2 text-xs font-medium text-burgundy"
        onClick={() => setConfirming(true)}
      >
        {t('dashboard.deposit.refund')}
      </button>
      {result === 'pending' && <span role="status" className="text-xs text-amber-800">{t('dashboard.deposit.refundPending')}</span>}
      {result === 'error' && <span role="alert" className="text-xs text-red-700">{t('dashboard.deposit.refundFailed')}</span>}
      <ConfirmModal
        open={confirming}
        title={t('dashboard.deposit.refundConfirmTitle')}
        message={t('dashboard.deposit.refundConfirmMessage')}
        confirmLabel={t('dashboard.deposit.refund')}
        onConfirm={() => void refund()}
        onCancel={() => { if (!loading) setConfirming(false); }}
        isLoading={loading}
      />
    </div>
  );
}
