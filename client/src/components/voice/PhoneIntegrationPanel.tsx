/**
 * PhoneIntegrationPanel
 *
 * Shows tenant-scoped phone status. The shared platform line is not offered
 * for self-service assignment because callers could be routed across tenants.
 */

import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import ThiingsIcon from '../../components/common/ThiingsIcon';
import { usePhoneIntegration } from '../../hooks/usePhoneIntegration';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a raw E.164 number like "+551150289356" → "+55 11 5028-9356" */
function formatBrazilianPhone(raw: string): string {
  // Match +55 (country) + 2-digit area + 4-digit + 4-digit
  const match = raw.replace(/\s/g, '').match(/^(\+55)(\d{2})(\d{4})(\d{4})$/);
  if (match) return `${match[1]} ${match[2]} ${match[3]}-${match[4]}`;
  return raw;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusBadge({ status, t }: { status: 'active' | 'not_configured' | 'error' | 'unavailable' | 'unknown'; t: any }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-800/10 px-2.5 py-1 text-xs font-medium text-amber-900">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-700" aria-hidden="true" />
        {t('phoneIntegration.registrationRecorded', 'Registered · test pending')}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
        {t('phoneIntegration.statusError', 'Error')}
      </span>
    );
  }
  if (status === 'unavailable' || status === 'unknown') {
    return <span className="rounded-full bg-amber-800/10 px-2.5 py-1 text-xs font-medium text-amber-900">{t(status === 'unavailable' ? 'phoneIntegration.lineUnavailable' : 'phoneIntegration.lineUnknown')}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      {t('phoneIntegration.statusNotConnected', 'Not Connected')}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhoneIntegrationPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { status, isLoading, isError } = usePhoneIntegration();

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="space-y-3 border-t border-brand-line py-7 animate-pulse"
        aria-busy="true"
        aria-label={t('phoneIntegration.loadingStatus', 'Loading phone status')}
      >
        <div className="h-4 bg-stone-100 rounded w-48" />
        <div className="h-6 bg-stone-100 rounded w-32" />
        <div className="h-10 bg-stone-100 rounded w-full" />
      </div>
    );
  }

  // A missing response is not the same as a disconnected phone. Keep the
  // error visible so operators do not attempt to connect an unknown state.

  if (!status?.restaurant || !status?.platform) {
    return (
      <section className="border-t border-brand-line py-8" role="alert">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-800">{t('phoneIntegration.statusError', 'Error')}</p>
        <h2 className="mt-2 font-brand text-[24px] leading-tight tracking-[-0.04em] text-brand-ink">{t('phoneIntegration.statusUnavailable', 'Phone status is unavailable')}</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-brand-muted">{isError ? t('phoneIntegration.loadFailed', 'Could not load phone status.') : t('phoneIntegration.incompleteStatus', 'The phone service returned incomplete status. Connection has not been verified.')}</p>
        <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['phone-integration-status'] })} className="mt-5 rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink">{t('common.retry', 'Retry')}</button>
      </section>
    );
  }

  const { restaurant, platform } = status;
  const isRegistered = restaurant.status === 'active' && platform.line_availability === 'owned_by_this_restaurant';
  const displayPhone = isRegistered && restaurant.phone_number ? formatBrazilianPhone(restaurant.phone_number) : null;
  const displayStatus = restaurant.status === 'active' && !isRegistered ? 'unknown' : restaurant.status;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="mt-4 space-y-5 border-t border-brand-line py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
          {t('phoneIntegration.title', 'AI receptionist phone')}
        </h2>
        <StatusBadge status={displayStatus} t={t} />
      </div>

      {/* No-agent warning */}
      {!restaurant.has_agent && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          <ThiingsIcon name="alert-triangle" pxSize={15} className="text-amber-600" />
          {t('phoneIntegration.noAgentWarning', 'AI receptionist not set up yet. Finish the AI receptionist setup above before connecting the phone.')}
        </div>
      )}

      {/* The platform line may be shared; registration is not a verified call. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-8">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{t('phoneIntegration.yourAssignedLine', 'Line assigned to your restaurant')}</p>
          <p className="mt-2 font-brand text-[26px] leading-none tracking-[-0.04em] text-brand-ink tabular-nums">{displayPhone || '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-6 text-brand-muted">
            {isRegistered
              ? t('phoneIntegration.connectedExplanation', 'The registration is recorded, but inbound routing is not verified. Complete a test call and reservation before you forward your restaurant number.')
              : platform.line_availability === 'unavailable'
                ? t('phoneIntegration.lineTakenExplanation', 'No line is assigned to your restaurant. The platform line is already in use; do not forward calls to it.')
                : platform.line_availability === 'available'
                  ? t('phoneIntegration.assistedSetupExplanation', 'No line is assigned to your restaurant. Setup requires support so calls from different restaurants cannot be mixed.')
                  : t('phoneIntegration.ownershipUnknownExplanation', 'We could not verify line ownership. Do not forward calls until support confirms your setup.')}{' '}
            <a href="mailto:hello@seatable.one?subject=Forwarding%20my%20restaurant%20number" className="font-medium text-brand-action underline underline-offset-2 hover:text-brand-ink">
              {t('phoneIntegration.askAboutForwarding', 'Ask support about forwarding')}
            </a>
          </p>
        </div>
      </div>

      {/* Error message */}
      {restaurant.status === 'error' && restaurant.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {restaurant.error}
        </p>
      )}

      {/* The API only returns manual instructions; it does not initiate a call. */}
      {isRegistered && restaurant.phone_number && (
        <div className="space-y-3 border-t border-brand-line pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('phoneIntegration.manualTestTitle', 'Manual call test')}</p>
            <p className="mt-1 text-sm text-brand-muted">{t('phoneIntegration.manualTestHint', 'Call this line from a phone you control. This page does not place a call; carrier charges may apply.')}</p>
          </div>
          <a href={`tel:${restaurant.phone_number}`} className="inline-flex items-center justify-center rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink">{t('phoneIntegration.callToTest', 'Call this line')}</a>
        </div>
      )}
    </section>
  );
}
