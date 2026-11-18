import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { authFetch } from '../../services/api';
import {
  useStripeConnectStatusKey, useStripeConnectStatus, type StripeConnectStatus,
} from '../../hooks/useStripeConnectStatus';

const STATUS_TONE = {
  active: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
  restricted: 'bg-amber-100 text-amber-800',
  disabled: 'bg-red-100 text-red-800',
  revoked: 'bg-red-100 text-red-800',
};

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-full bg-burgundy px-5 py-2 text-sm font-semibold text-white hover:bg-burgundy-dark disabled:opacity-50';
const SECONDARY = 'inline-flex min-h-11 items-center text-sm font-medium text-burgundy underline underline-offset-4 disabled:opacity-50';

export default function StripeConnectPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [returnKind] = useState(() => new URLSearchParams(window.location.search).get('stripe_connect'));
  const handledReturn = useRef(false);
  const queryKey = useStripeConnectStatusKey();
  const statusQuery = useStripeConnectStatus();
  const refresh = useMutation({
    mutationFn: async (): Promise<StripeConnectStatus> => {
      await queryClient.cancelQueries({ queryKey });
      const res = await authFetch('/api/stripe-connect-status', { method: 'POST' });
      if (!res.ok) throw new Error('Could not verify Stripe status');
      return res.json();
    },
    onSuccess: (status) => queryClient.setQueryData(queryKey, status),
  });
  const refreshStatus = refresh.mutate;
  useEffect(() => {
    if (!returnKind || handledReturn.current) return;
    handledReturn.current = true;
    if (returnKind === 'ok') refreshStatus();
    const url = new URL(window.location.href);
    url.searchParams.delete('stripe_connect');
    window.history.replaceState(window.history.state, '', url);
  }, [returnKind, refreshStatus]);

  const onboarding = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/stripe-connect-onboarding', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success || typeof body.url !== 'string') throw new Error(body.error || 'start_failed');
      const url = new URL(body.url);
      if (url.origin !== 'https://connect.stripe.com') throw new Error('start_failed');
      window.location.assign(url.href);
    },
  });

  const data = statusQuery.data;
  const status = data?.status;
  const verifyingReturn = returnKind === 'ok' && refresh.isIdle;
  const pending = statusQuery.isLoading || refresh.isPending || verifyingReturn;
  const canShowStatus = !pending && !refresh.isError && !statusQuery.isError;
  const cta = status === 'revoked' ? 'reconnectCta'
    : status === 'pending' ? 'continueCta' : status ? 'fixCta' : 'startCta';
  const dashboardUrl = data?.account_id && /^acct_[A-Za-z0-9]+$/.test(data.account_id)
    ? `https://dashboard.stripe.com/${data.account_id}/dashboard` : 'https://dashboard.stripe.com/';
  const actionError = onboarding.error?.message;
  const actionMessage = actionError === 'owner_required' ? 'ownerRequired'
    : actionError === 'country_required' ? 'countryRequired' : 'startFailed';

  return (
    <section aria-labelledby="stripe-connect-heading" className="max-w-2xl space-y-5">
      <div>
        <h2 id="stripe-connect-heading" className="font-serif text-3xl text-deep-charcoal">{t('stripeConnect.title')}</h2>
        <p className="mt-2 text-[15px] text-stone-gray">{t('stripeConnect.subtitle')}</p>
      </div>

      {pending && <p role="status" className="text-sm text-stone-gray">{t('stripeConnect.checking')}</p>}
      {refresh.isError && (
        <div>
          <p role="alert" className="text-sm text-amber-800">{t('stripeConnect.verifyFailed')}</p>
          <button type="button" className={SECONDARY} onClick={() => refreshStatus()}>{t('stripeConnect.checkAgain')}</button>
        </div>
      )}
      {statusQuery.isError && !refresh.isError && !pending && (
        <div>
          <p role="alert" className="text-sm text-amber-800">{t('stripeConnect.readFailed')}</p>
          <button type="button" className={SECONDARY} onClick={() => { void statusQuery.refetch(); }}>{t('stripeConnect.checkAgain')}</button>
        </div>
      )}

      {canShowStatus && (
        <>
          {returnKind === 'refresh' && status !== 'active' && (
            <p role="status" className="text-sm text-amber-800">{t('stripeConnect.returnRefresh')}</p>
          )}
          {status && (
            <div className="hairline space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}>
                  {t(`stripeConnect.status.${status}`)}
                </span>
                {data?.default_currency && (
                  <span className="text-xs uppercase text-stone-gray">{data.default_currency}</span>
                )}
              </div>
              <p role="status" className="text-[15px] text-stone-gray">{t(`stripeConnect.help.${status}`)}</p>
              {status === 'active' && !data?.payouts_enabled && (
                <p className="text-sm text-amber-800">{t('stripeConnect.payoutsPending')}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {status === 'active' ? (
              <>
                <Link to="/host-dashboard/settings#reservation-deposits" className={BUTTON}>
                  {t('stripeConnect.configureDeposits')}
                </Link>
                <a href={dashboardUrl} target="_blank" rel="noreferrer" className={SECONDARY}>{t('stripeConnect.openCta')}</a>
              </>
            ) : (
              <button type="button" className={BUTTON} disabled={onboarding.isPending} onClick={() => onboarding.mutate()}>
                {t(onboarding.isPending ? 'stripeConnect.starting' : `stripeConnect.${cta}`)}
              </button>
            )}
            {status && status !== 'revoked' && (
              <button type="button" className={SECONDARY} onClick={() => refreshStatus()}>{t('stripeConnect.checkAgain')}</button>
            )}
          </div>
          {onboarding.isError && <p role="alert" className="text-sm text-red-800">{t(`stripeConnect.${actionMessage}`)}</p>}
        </>
      )}
    </section>
  );
}
