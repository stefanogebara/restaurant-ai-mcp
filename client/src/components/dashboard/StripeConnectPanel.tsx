import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useStripeConnectStatus, type StripeConnectStatusValue } from '../../hooks/useStripeConnectStatus';

interface OnboardingResponse {
  success: boolean;
  url?: string;
  account_id?: string;
  status?: string;
  error?: string;
}

const STATUS_TONE: Record<StripeConnectStatusValue, { dot: string; bg: string; text: string }> = {
  active:     { dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  pending:    { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800'   },
  restricted: { dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-800'   },
  disabled:   { dot: 'bg-red-500',     bg: 'bg-red-100',     text: 'text-red-800'     },
  revoked:    { dot: 'bg-red-500',     bg: 'bg-red-100',     text: 'text-red-800'     },
};

export default function StripeConnectPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Handle Stripe Connect return-URL params. Mirrors POSIntegrationPanel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('stripe_connect');
    if (!result) return;

    if (result === 'ok') {
      toast.success(t('stripeConnect.returnSuccess', 'Stripe account updated. Status refreshing…'));
      queryClient.invalidateQueries({ queryKey: ['stripe-connect-status'] });
    } else if (result === 'refresh') {
      toast.info(t('stripeConnect.returnRefresh', 'Onboarding link expired. Tap "Continue" to resume.'));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('stripe_connect');
    window.history.replaceState({}, '', url.toString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useStripeConnectStatus();

  const onboardingMutation = useMutation<string, Error>({
    mutationFn: async () => {
      const res = await authFetch('/api/stripe-connect-onboarding', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const body: OnboardingResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !body.success || !body.url) {
        throw new Error(body.error || 'Failed to start Stripe onboarding');
      }
      return body.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(err.message || t('stripeConnect.startFailed', 'Could not start Stripe onboarding'));
    },
  });

  const status = data?.status;
  const isActive = status === 'active';
  const isBlocked = status === 'restricted' || status === 'disabled' || status === 'revoked';
  const isPending = status === 'pending';
  const tone = status ? STATUS_TONE[status] : null;

  const ctaLabel = (() => {
    if (!data?.connected) return t('stripeConnect.startCta', 'Connect Stripe');
    if (isActive)         return t('stripeConnect.resumeCta', 'Edit Stripe details');
    if (isPending)        return t('stripeConnect.continueCta', 'Continue onboarding');
    if (isBlocked)        return t('stripeConnect.fixCta', 'Fix Stripe issues');
    return t('stripeConnect.openCta', 'Open Stripe');
  })();

  return (
    <div className="py-5 border-t border-[#E5E7EB] mt-8">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-3">
        {t('stripeConnect.title', 'Stripe (receive bookings)')}
      </h2>
      <p className="text-sm text-muted-stone mb-4">
        {t(
          'stripeConnect.subtitle',
          'Connect your own Stripe account so booking deposits land directly in your bank.',
        )}
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-stone">{t('common.loading', 'Loading...')}</div>
      ) : (
        <div className="space-y-4">
          {data?.connected && tone && status && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${tone.bg} ${tone.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                {t(`stripeConnect.status.${status}`, status)}
              </span>
              {data.account_id && (
                <span className="text-xs font-mono text-muted-stone truncate max-w-[200px]" title={data.account_id}>
                  {data.account_id}
                </span>
              )}
            </div>
          )}

          {data?.connected && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-stone text-xs">{t('stripeConnect.charges', 'Charges')}</span>
                <p className="text-deep-charcoal text-xs">
                  {data.charges_enabled
                    ? t('stripeConnect.flagEnabled', 'Enabled')
                    : t('stripeConnect.flagDisabled', 'Disabled')}
                </p>
              </div>
              <div>
                <span className="text-muted-stone text-xs">{t('stripeConnect.payouts', 'Payouts')}</span>
                <p className="text-deep-charcoal text-xs">
                  {data.payouts_enabled
                    ? t('stripeConnect.flagEnabled', 'Enabled')
                    : t('stripeConnect.flagDisabled', 'Disabled')}
                </p>
              </div>
              <div>
                <span className="text-muted-stone text-xs">{t('stripeConnect.detailsSubmitted', 'Details submitted')}</span>
                <p className="text-deep-charcoal text-xs">
                  {data.details_submitted
                    ? t('common.yes', 'Yes')
                    : t('common.no', 'No')}
                </p>
              </div>
              {data.default_currency && (
                <div>
                  <span className="text-muted-stone text-xs">{t('stripeConnect.currency', 'Currency')}</span>
                  <p className="text-deep-charcoal text-xs uppercase">{data.default_currency}</p>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onboardingMutation.mutate()}
            disabled={onboardingMutation.isPending}
            className="px-4 py-2 bg-[#9F1239] text-white rounded-lg text-xs font-medium hover:bg-[#831a3a] transition-colors disabled:opacity-50"
          >
            {onboardingMutation.isPending
              ? t('stripeConnect.starting', 'Opening Stripe…')
              : ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
}
