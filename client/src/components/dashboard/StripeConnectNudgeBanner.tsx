import { useTranslation } from 'react-i18next';
import { useStripeConnectStatus } from '../../hooks/useStripeConnectStatus';
import { useDepositConfig } from '../../hooks/useDepositConfig';

/**
 * Dashboard-level adoption nudge for restaurants who are charging booking
 * deposits but haven't onboarded to Stripe Connect yet.
 *
 * Without Connect, every deposit settles on Seatable's platform account.
 * That works (capture/release succeed) but the restaurant doesn't see the
 * money in their own Stripe — Seatable is effectively holding their funds.
 * The booking-deposit handler already routes through Connect the moment
 * the restaurant is onboarded (see api/create-deposit-intent.js), so this
 * banner is the one piece of UI that closes the loop.
 *
 * Visibility — deliberately narrow to avoid nagging:
 *   • deposit_config.enabled === true (restaurant IS taking deposits)
 *   • Stripe Connect status query says connected === false (no row yet)
 *
 * Everything else stays silent:
 *   • Deposits off → banner irrelevant
 *   • Already connected at any status → the StripeConnectStatusBadge owns
 *     ongoing health messaging; we don't want two surfaces fighting
 *   • Either query still loading → no flash
 */
export default function StripeConnectNudgeBanner() {
  const { t } = useTranslation();
  const { data: connectStatus, isLoading: connectLoading, isError: connectError } = useStripeConnectStatus();
  const { data: depositConfig, isLoading: depositLoading, isError: depositError } = useDepositConfig();

  if (connectLoading || depositLoading) return null;
  // Suppress on error — without confirmed state we'd risk nagging a
  // restaurant who is already connected. The badge handles ongoing health,
  // so a missed nudge here is the safer failure mode.
  if (connectError || depositError) return null;
  if (!connectStatus?.success) return null;
  if (!depositConfig?.enabled) return null;
  if (connectStatus.connected) return null;

  return (
    <div
      className="bg-amber-50 border border-amber-200 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-6 sm:mb-8"
      data-testid="stripe-connect-nudge-banner"
    >
      <p className="text-sm text-amber-800 flex-1 min-w-0">
        <span className="font-semibold">
          {t('stripeConnectNudge.title', 'Connect your Stripe account')}
        </span>
        {' — '}
        {t(
          'stripeConnectNudge.subtitle',
          'Your booking deposits are currently routed through Seatable. Connect Stripe to receive them directly to your account.',
        )}
      </p>
      <a
        href="/host-dashboard/voice-settings#tab=pos"
        className="text-sm font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-4 py-1.5 rounded-xl whitespace-nowrap transition-colors"
      >
        {t('stripeConnectNudge.cta', 'Connect Stripe')}
      </a>
    </div>
  );
}
