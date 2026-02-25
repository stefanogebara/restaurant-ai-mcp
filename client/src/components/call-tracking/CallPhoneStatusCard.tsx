import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import { formatConfiguredDate, PhoneStatusData } from './callTrackingTypes';

interface Props {
  phoneStatus: PhoneStatusData | null;
  phoneStatusLoading: boolean;
  setupLoading: boolean;
  diagnoseLoading: boolean;
  disconnectLoading: boolean;
  onSetupPhone: () => void;
  onDiagnose: () => void;
  onDisconnect: () => void;
  onRefreshStatus: () => void;
}

function StatusBadge({ status }: { status: PhoneStatusData['status'] }) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 text-green-600 text-xs font-semibold rounded-full">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Active
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-600/10 text-amber-600 text-xs font-semibold rounded-full">
          <Spinner size="sm" />
          Pending
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600/10 text-red-600 text-xs font-semibold rounded-full">
          <ThiingsIcon name="alert-circle" size="xs" />
          Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-stone/10 text-stone-gray text-xs font-semibold rounded-full">
          <ThiingsIcon name="wifi-off" size="xs" />
          Not Configured
        </span>
      );
  }
}

export default function CallPhoneStatusCard({
  phoneStatus,
  phoneStatusLoading,
  setupLoading,
  diagnoseLoading,
  disconnectLoading,
  onSetupPhone,
  onDiagnose,
  onDisconnect,
  onRefreshStatus,
}: Props) {
  const statusDescription =
    phoneStatus?.status === 'active'
      ? 'Your AI agent is receiving calls'
      : phoneStatus?.status === 'error'
        ? 'There is an issue with your phone integration'
        : 'Connect a phone number to start receiving AI calls';

  return (
    <div className="bg-white rounded-2xl border border-border-gray overflow-hidden p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <ThiingsIcon name="phone-call" pxSize={24} />
          <div>
            <h2 className="text-lg font-semibold text-deep-charcoal">Phone Status</h2>
            <p className="text-sm text-stone-gray">{statusDescription}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phoneStatusLoading ? (
            <Spinner size="md" />
          ) : (
            phoneStatus && <StatusBadge status={phoneStatus.status} />
          )}
        </div>
      </div>

      {/* Info grid */}
      {phoneStatus && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
            <p className="text-xs text-stone-gray mb-1">Connection</p>
            <div className="flex items-center gap-2">
              {phoneStatus.status === 'active' ? (
                <ThiingsIcon name="wifi" size="xs" />
              ) : (
                <ThiingsIcon name="wifi-off" size="xs" />
              )}
              <span className="text-sm font-medium text-deep-charcoal capitalize">
                {phoneStatus.status === 'not_configured' ? 'Not Connected' : phoneStatus.status}
              </span>
            </div>
          </div>

          <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
            <p className="text-xs text-stone-gray mb-1">Phone Number</p>
            <p className="text-sm font-medium text-deep-charcoal">
              {phoneStatus.phone_number || 'None assigned'}
            </p>
          </div>

          <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
            <p className="text-xs text-stone-gray mb-1">Agent ID</p>
            <p
              className="text-sm font-medium text-deep-charcoal font-mono truncate"
              title={phoneStatus.agent_id ?? undefined}
            >
              {phoneStatus.agent_id
                ? `${phoneStatus.agent_id.substring(0, 12)}...`
                : 'No agent'}
            </p>
          </div>

          <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
            <p className="text-xs text-stone-gray mb-1">Configured</p>
            <p className="text-sm font-medium text-deep-charcoal">
              {formatConfiguredDate(phoneStatus.configured_at)}
            </p>
          </div>
        </div>
      )}

      {/* Error message */}
      {phoneStatus?.status === 'error' && phoneStatus.error && (
        <div className="mt-4 bg-red-600/10 border border-red-600/20 rounded-xl p-3 flex items-start gap-2">
          <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{phoneStatus.error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border-gray">
        {(!phoneStatus || phoneStatus.status === 'not_configured' || phoneStatus.status === 'error') && (
          <button
            type="button"
            onClick={onSetupPhone}
            disabled={setupLoading}
            className="px-4 py-2 bg-burgundy text-white rounded-xl font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {setupLoading ? (
              <><Spinner size="sm" />Setting up...</>
            ) : (
              <><ThiingsIcon name="phone" size="xs" />Setup Phone</>
            )}
          </button>
        )}

        {phoneStatus?.has_agent && (
          <button
            type="button"
            onClick={onDiagnose}
            disabled={diagnoseLoading}
            className="px-4 py-2 bg-soft-gray hover:bg-border-gray text-deep-charcoal rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {diagnoseLoading ? (
              <><Spinner size="sm" />Diagnosing...</>
            ) : (
              <><ThiingsIcon name="stethoscope" size="xs" />Diagnose Agent</>
            )}
          </button>
        )}

        {phoneStatus?.status === 'active' && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnectLoading}
            className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {disconnectLoading ? (
              <><Spinner size="sm" />Disconnecting...</>
            ) : (
              <><ThiingsIcon name="phone-off" size="xs" />Disconnect</>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onRefreshStatus}
          className="px-3 py-2 text-stone-gray hover:text-deep-charcoal transition-colors text-sm"
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}
