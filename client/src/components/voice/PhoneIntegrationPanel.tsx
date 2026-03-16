/**
 * PhoneIntegrationPanel
 *
 * Shows the platform Twilio phone integration status and lets the restaurant
 * connect or disconnect the shared AI phone number to their ElevenLabs agent.
 */

import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
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
function StatusBadge({ status, t }: { status: 'active' | 'not_configured' | 'error'; t: any }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {t('phoneIntegration.statusActive', 'Active')}
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
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      {t('phoneIntegration.statusNotConnected', 'Not Connected')}
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhoneIntegrationPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    status,
    isLoading,
    register,
    unregister,
    sendTestCall,
    isRegistering,
    isUnregistering,
    isTestingCall,
    isMutating,
    testNumber,
    setTestNumber,
  } = usePhoneIntegration();

  const handleRegister = () => {
    register(undefined, {
      onSuccess: () => toast.success(t('phoneIntegration.connected', 'Phone connected successfully')),
      onError: (err) => toast.error(err instanceof Error ? err.message : t('phoneIntegration.connectFailed', 'Failed to connect')),
    });
  };

  const handleUnregister = () => {
    unregister(undefined, {
      onSuccess: () => toast.success(t('phoneIntegration.disconnected', 'Phone disconnected')),
      onError: (err) => toast.error(err instanceof Error ? err.message : t('phoneIntegration.disconnectFailed', 'Failed to disconnect')),
    });
  };

  const handleTestCall = () => {
    const trimmed = testNumber.trim();
    if (!trimmed) {
      toast.error(t('phoneIntegration.enterNumber', 'Enter a number to test'));
      return;
    }
    sendTestCall(trimmed);
    toast.info(t('phoneIntegration.startingTestCall', 'Starting test call...'));
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3"
        aria-busy="true"
        aria-label={t('phoneIntegration.loadingStatus', 'Loading phone status')}
      >
        <div className="h-4 bg-gray-100 rounded w-48" />
        <div className="h-6 bg-gray-100 rounded w-32" />
        <div className="h-10 bg-gray-100 rounded w-full" />
      </div>
    );
  }

  // ── No data fallback ────────────────────────────────────────────────────────

  if (!status?.restaurant || !status?.platform) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <p className="text-sm text-warm-stone">{t('phoneIntegration.loadFailed', 'Could not load phone status.')}</p>
      </div>
    );
  }

  const { restaurant, platform } = status;
  const isActive = restaurant.status === 'active';
  const displayPhone = formatBrazilianPhone(platform.twilio_phone);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          {t('phoneIntegration.title', 'AI Phone — Voice')}
        </h2>
        <StatusBadge status={restaurant.status} t={t} />
      </div>

      {/* No-agent warning */}
      {!restaurant.has_agent && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          <span aria-hidden="true">⚠</span>
          {t('phoneIntegration.noAgentWarning', 'Voice agent not configured. Set up a voice agent before connecting the phone.')}
        </div>
      )}

      {/* Platform phone info */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-soft-gray flex items-center justify-center flex-shrink-0">
          <svg
            className="w-4 h-4 text-warm-stone"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C9.61 21 3 14.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-warm-stone">{t('phoneIntegration.platformNumber', 'Platform number')}</p>
          <p className="text-sm font-semibold text-deep-charcoal">{displayPhone}</p>
        </div>
      </div>

      {/* Error message */}
      {restaurant.status === 'error' && restaurant.error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {restaurant.error}
        </p>
      )}

      {/* Connect / Disconnect */}
      <div className="flex items-center gap-3 pt-1">
        {!isActive ? (
          <button
            type="button"
            onClick={handleRegister}
            disabled={isMutating || !restaurant.has_agent}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRegistering && <Spinner />}
            {isRegistering ? t('phoneIntegration.connecting', 'Connecting...') : t('phoneIntegration.connect', 'Connect')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleUnregister}
            disabled={isMutating}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-border-gray hover:bg-soft-gray text-deep-charcoal text-sm font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isUnregistering && <Spinner />}
            {isUnregistering ? t('phoneIntegration.disconnecting', 'Disconnecting...') : t('phoneIntegration.disconnect', 'Disconnect')}
          </button>
        )}
      </div>

      {/* Test call — shown only when active */}
      {isActive && (
        <div className="border-t border-border-gray pt-4 space-y-2">
          <p className="text-xs font-medium text-warm-stone">{t('phoneIntegration.testCall', 'Test call')}</p>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="flex-1 border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              aria-label={t('phoneIntegration.testCallNumber', 'Number for test call')}
            />
            <button
              type="button"
              onClick={handleTestCall}
              disabled={isMutating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isTestingCall && <Spinner />}
              {isTestingCall ? t('phoneIntegration.calling', 'Calling...') : t('phoneIntegration.testCall', 'Test call')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
