import { useTranslation } from 'react-i18next';
import type { CancelledReservationDeposit } from '../../types/host.types';
import { parseLocalDate } from '../../utils/timeFormatting';
import DepositBadge from './DepositBadge';
import DepositRefundAction from './DepositRefundAction';

interface CancelledReservationDepositsProps {
  deposits?: CancelledReservationDeposit[] | null;
  onDepositAction: () => void;
}

export default function CancelledReservationDeposits({ deposits, onDepositAction }: CancelledReservationDepositsProps) {
  const { t, i18n } = useTranslation();
  if (deposits !== null && !deposits?.length) return null;

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section aria-labelledby="cancelled-deposits-heading" className="mt-4 border-t hairline px-3 pt-4 sm:px-6">
      <h2 id="cancelled-deposits-heading" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
        {t('dashboard.deposit.cancelledTitle')}
      </h2>
      {deposits ? (
        <ul className="mt-2">
          {deposits.map((deposit) => {
            const outstanding = deposit.deposit_outstanding_amount;
            const formatted = outstanding && deposit.deposit_currency
              ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: deposit.deposit_currency }).format(outstanding)
              : null;

            return (
              <li key={deposit.reservation_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b hairline py-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-deep-charcoal">{deposit.customer_name}</p>
                  <p className="text-xs text-muted-stone">
                    {dateFormat.format(parseLocalDate(deposit.date))} · {deposit.time.slice(0, 5)}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  {deposit.deposit_release_pending && <DepositBadge held={false} releasePending />}
                  {outstanding != null && (
                    <>
                      <span className="text-xs font-medium text-deep-charcoal">
                        {formatted
                          ? t('dashboard.deposit.cancelledCapturedAmount', { amount: formatted })
                          : t('dashboard.deposit.cancelledCaptured')}
                      </span>
                      <DepositRefundAction reservationId={deposit.reservation_id} onActionComplete={onDepositAction} />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p role="status" className="mt-2 text-sm text-deep-charcoal">{t('dashboard.deposit.cancelledUnavailable')}</p>
      )}
    </section>
  );
}
