import { useTranslation } from 'react-i18next';
import { useStripeConnectStatus, type StripeConnectStatusValue } from '../../hooks/useStripeConnectStatus';

/**
 * Glanceable Stripe Connect health pill for the main dashboard.
 *
 * Renders nothing when:
 *   - the status query is still loading (don't flash)
 *   - the restaurant isn't connected at all (no nag — that belongs to a
 *     separate adoption-banner sub-step)
 *   - status === 'active' (everything's fine; no clutter)
 *
 * Renders a coloured pill that links to the Stripe Connect panel for:
 *   - pending     → amber, "Finish Stripe onboarding"
 *   - restricted  → amber, "Stripe needs attention"
 *   - disabled    → red,   "Stripe disabled"
 *   - revoked     → red,   "Stripe disconnected"
 */

const STATE_TONE: Record<
  Exclude<StripeConnectStatusValue, 'active'>,
  { bg: string; text: string; dot: string }
> = {
  pending:    { bg: 'bg-amber-50',  text: 'text-amber-800',  dot: 'bg-amber-500'   },
  restricted: { bg: 'bg-amber-50',  text: 'text-amber-800',  dot: 'bg-amber-500'   },
  disabled:   { bg: 'bg-red-50',    text: 'text-red-800',    dot: 'bg-red-500'     },
  revoked:    { bg: 'bg-red-50',    text: 'text-red-800',    dot: 'bg-red-500'     },
};

export default function StripeConnectStatusBadge() {
  const { t } = useTranslation();
  const { data, isLoading } = useStripeConnectStatus();

  if (isLoading) return null;
  if (!data?.connected) return null;
  if (!data.status || data.status === 'active') return null;

  const tone = STATE_TONE[data.status];
  const label = t(`stripeConnectBadge.${data.status}`, defaultLabel(data.status));

  return (
    <a
      href="/host-dashboard/voice-settings#tab=pos"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${tone.bg} ${tone.text} hover:opacity-90 transition-opacity`}
      data-testid="stripe-connect-status-badge"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {label}
    </a>
  );
}

function defaultLabel(status: Exclude<StripeConnectStatusValue, 'active'>): string {
  switch (status) {
    case 'pending':    return 'Finish Stripe onboarding';
    case 'restricted': return 'Stripe needs attention';
    case 'disabled':   return 'Stripe disabled';
    case 'revoked':    return 'Stripe disconnected';
  }
}
