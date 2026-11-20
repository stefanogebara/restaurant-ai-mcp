import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { NoShowReservationDeposit } from '../../types/host.types';
import { parseLocalDate } from '../../utils/timeFormatting';
import DepositActions from './DepositActions';
import DepositBadge from './DepositBadge';
import DepositRefundAction from './DepositRefundAction';

interface NoShowReservationDepositsProps {
  deposits?: NoShowReservationDeposit[] | null;
  onDepositAction: () => void;
}

export default function NoShowReservationDeposits({ deposits, onDepositAction }: NoShowReservationDepositsProps) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  if (deposits !== null && !deposits?.length) return null;

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section aria-labelledby="no-show-deposits-heading" className="mt-4 border-t hairline px-3 pt-4 sm:px-6">
      <h2 id="no-show-deposits-heading" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
        {t('dashboard.deposit.noShowTitle')}
      </h2>
      {deposits ? (
        <ul className="mt-2">
          {deposits.map(deposit => (
            <NoShowDepositRow
              key={deposit.reservation_id}
              deposit={deposit}
              dateLabel={dateFormat.format(parseLocalDate(deposit.date))}
              canManageCharges={role === 'owner'}
              onDepositAction={onDepositAction}
            />
          ))}
        </ul>
      ) : (
        <p role="status" className="mt-2 text-sm text-deep-charcoal">{t('dashboard.deposit.noShowUnavailable')}</p>
      )}
    </section>
  );
}

function NoShowDepositRow({ deposit, dateLabel, canManageCharges, onDepositAction }: {
  deposit: NoShowReservationDeposit;
  dateLabel: string;
  canManageCharges: boolean;
  onDepositAction: () => void;
}) {
  const [settledHold, setSettledHold] = useState<'captured' | 'released' | 'expired' | null>(null);
  const [refunded, setRefunded] = useState(false);

  // Reflect confirmed actions while the dashboard refetches. The API supplies
  // the refundable balance once it has reported the captured state.
  const state = deposit.deposit_state === 'held' ? (settledHold ?? 'held') : deposit.deposit_state;
  if (state === 'released') return null;

  const amount = deposit.deposit_amount;
  const outstanding = deposit.deposit_state === 'captured' ? deposit.deposit_outstanding_amount : null;
  const refundedAmount = refunded ? amount : amount != null && outstanding != null ? amount - outstanding : null;

  return (
    <li className="flex flex-col items-start gap-2 border-b hairline py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-x-4">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-deep-charcoal">{deposit.customer_name}</p>
        <p className="text-xs text-muted-stone">{dateLabel} · {deposit.time.slice(0, 5)}</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <DepositBadge amount={amount} currency={deposit.deposit_currency}
          held={state === 'held'} expired={state === 'expired'} refundedAmount={refundedAmount} />
        {state === 'held' && amount != null && amount > 0 && (
          <DepositActions
            reservationId={deposit.reservation_id}
            depositAmount={amount}
            currency={deposit.deposit_currency}
            noShow
            canCharge={canManageCharges}
            onActionComplete={result => {
              setSettledHold(result);
              onDepositAction();
            }}
          />
        )}
        {canManageCharges && state === 'captured' && !refunded && outstanding != null && outstanding > 0 && (
          <DepositRefundAction reservationId={deposit.reservation_id} onActionComplete={result => {
            if (result === 'refunded') setRefunded(true);
            onDepositAction();
          }} />
        )}
      </div>
    </li>
  );
}
