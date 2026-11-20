import { isAxiosError } from 'axios';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import ConfirmModal from '../common/ConfirmModal';

type DepositAction = 'capture' | 'release';
type DepositActionResult = 'captured' | 'released' | 'expired';

interface DepositActionsProps {
  reservationId: string;
  depositAmount: number;
  currency?: string | null;
  noShow?: boolean;
  canCharge?: boolean;
  onActionComplete: (result: DepositActionResult) => void;
}

export default function DepositActions({ reservationId, depositAmount, currency, noShow, canCharge, onActionComplete }: DepositActionsProps) {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState<DepositAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [settled, setSettled] = useState(false);
  const [chargeForbidden, setChargeForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = new Intl.NumberFormat(i18n.language, currency
    ? { style: 'currency', currency }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(depositAmount);
  const chargeLabel = t('dashboard.deposit.chargeAmount', { amount });
  const disabled = action !== null || settled;
  const showCharge = noShow && canCharge && !chargeForbidden;

  const submit = async (next: DepositAction) => {
    if (disabled || (next === 'capture' && !showCharge)) return;
    setAction(next);
    setError(null);
    try {
      await api.post(next === 'capture' ? '/capture-deposit' : '/release-deposit', { reservation_id: reservationId });
      setSettled(true);
      onActionComplete(next === 'capture' ? 'captured' : 'released');
    } catch (error) {
      const code = isAxiosError<{ code?: string }>(error) ? error.response?.data?.code : undefined;
      if (code === 'deposit_authorization_expired') {
        setSettled(true);
        setError(t('dashboard.deposit.authorizationExpired'));
        onActionComplete('expired');
      } else if (next === 'capture' && code === 'owner_required') {
        setChargeForbidden(true);
        setError(t('dashboard.deposit.ownerRequired'));
      } else {
        setError(t(next === 'capture' ? 'dashboard.deposit.captureFailed' : 'dashboard.deposit.releaseFailed'));
      }
    } finally {
      setConfirming(false);
      setAction(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      <button
        type="button"
        onClick={() => void submit('release')}
        disabled={disabled}
        className="rounded-full border border-border-gray px-3 py-2 text-xs font-medium text-deep-charcoal hover:bg-soft-gray disabled:opacity-50"
        title={noShow ? undefined : t('dashboard.deposit.releaseTitle')}
      >
        {action === 'release' ? t('common.loading') : t('dashboard.deposit.release')}
      </button>
      {showCharge && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled}
          className="rounded-full border border-border-gray px-3 py-2 text-xs font-semibold text-deep-charcoal hover:bg-soft-gray disabled:opacity-50"
        >
          {chargeLabel}
        </button>
      )}
      {showCharge && confirming && createPortal(
        <ConfirmModal
          open
          title={t('dashboard.deposit.chargeConfirmTitle', { amount })}
          message={t('dashboard.deposit.chargeConfirmMessage')}
          confirmLabel={chargeLabel}
          confirmTone="danger"
          onConfirm={() => void submit('capture')}
          onCancel={() => { if (action === null) setConfirming(false); }}
          isLoading={action === 'capture'}
        />,
        document.body,
      )}
    </div>
  );
}
