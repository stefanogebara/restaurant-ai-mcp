import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

interface DepositActionsProps {
  reservationId: string;
  depositAmount: number;
  onActionComplete: () => void;
}

export default function DepositActions({ reservationId, depositAmount, onActionComplete }: DepositActionsProps) {
  const { t } = useTranslation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatted = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(depositAmount);

  const handleCapture = async () => {
    setIsCapturing(true);
    setError(null);
    try {
      await api.post('/capture-deposit', { reservation_id: reservationId });
      onActionComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('dashboard.deposit.captureFailed', 'Failed to capture deposit');
      setError(message);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRelease = async () => {
    setIsReleasing(true);
    setError(null);
    try {
      await api.post('/release-deposit', { reservation_id: reservationId });
      onActionComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('dashboard.deposit.releaseFailed', 'Failed to release deposit');
      setError(message);
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <button
        type="button"
        onClick={handleRelease}
        disabled={isReleasing || isCapturing}
        className="text-[11px] font-medium px-2 py-1 rounded-lg border border-rose-600/30 text-rose-600 hover:bg-rose-600/[6%] transition-colors disabled:opacity-50"
        title={t('dashboard.deposit.releaseTitle', 'Release deposit hold (guest arrived)')}
      >
        {isReleasing ? '...' : t('dashboard.deposit.release', 'Release')}
      </button>
      <button
        type="button"
        onClick={handleCapture}
        disabled={isCapturing || isReleasing}
        className="text-[11px] font-medium px-2 py-1 rounded-lg border border-red-600/30 text-red-600 hover:bg-red-600/[6%] transition-colors disabled:opacity-50"
        title={t('dashboard.deposit.captureTitle', 'Capture {{amount}} deposit (no-show)', { amount: formatted })}
      >
        {isCapturing ? '...' : t('dashboard.deposit.captureAmount', 'Capture {{amount}}', { amount: formatted })}
      </button>
    </div>
  );
}
