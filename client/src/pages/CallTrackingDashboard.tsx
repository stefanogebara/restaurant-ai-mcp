/**
 * Call Tracking Dashboard
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/call-tracking/.
 */

import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { SkeletonCallTracking } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { LS_RESTAURANT_ID } from '../config/localStorageKeys';

import CallPhoneStatusCard from '../components/call-tracking/CallPhoneStatusCard';
import CallDiagnosticsPanel from '../components/call-tracking/CallDiagnosticsPanel';
import CallFilters from '../components/call-tracking/CallFilters';
import CallStatsOverview from '../components/call-tracking/CallStatsOverview';
import CallConversationList from '../components/call-tracking/CallConversationList';
import CallConversationModal from '../components/call-tracking/CallConversationModal';

import {
  useCallConversations,
  useCallStats,
  usePhoneStatus,
  useConversationDetail,
  useSetupPhone,
  useDisconnectPhone,
  useDiagnoseAgent,
  useFixTools,
} from '../hooks/useCallTracking';

import type { CallFilter } from '../components/call-tracking/callTrackingTypes';

export default function CallTrackingDashboard() {
  const [filter, setFilter] = useState<CallFilter>({ period: '7d', outcome: 'all', language: 'all' });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showDiagnosePanel, setShowDiagnosePanel] = useState(false);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const restaurant_id = localStorage.getItem(LS_RESTAURANT_ID) || '';

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const { data: convsResult, isLoading, refetch: refetchConversations } = useCallConversations(filter, restaurant_id);
  const { data: stats } = useCallStats(filter, restaurant_id);
  const phoneStatusQuery = usePhoneStatus(restaurant_id);
  const { data: selectedConversation } = useConversationDetail(selectedConversationId);

  const conversations = convsResult?.conversations ?? [];

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const setupPhone = useSetupPhone();
  const disconnectPhone = useDisconnectPhone();
  const diagnose = useDiagnoseAgent();
  const fixTools = useFixTools();

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleSetupPhone = () => {
    if (!restaurant_id) return;
    setupPhone.mutate(restaurant_id, {
      onSuccess: (data) => toastSuccess(data.message || 'Phone number connected successfully'),
      onError: (err) => toastError(err.message || 'Failed to set up phone'),
    });
  };

  const handleDisconnect = () => {
    if (!restaurant_id) return;
    if (!confirm('Are you sure you want to disconnect this phone number?')) return;
    disconnectPhone.mutate(restaurant_id, {
      onSuccess: () => {
        toastSuccess('Phone number disconnected');
        setShowDiagnosePanel(false);
      },
      onError: (err) => toastError(err.message || 'Failed to disconnect phone'),
    });
  };

  const handleDiagnose = () => {
    if (!restaurant_id) return;
    setShowDiagnosePanel(true);
    diagnose.mutate(restaurant_id, {
      onSuccess: () => toastSuccess('Agent diagnostics loaded'),
      onError: (err) => {
        toastError(err.message || 'Failed to diagnose agent');
        setShowDiagnosePanel(false);
      },
    });
  };

  const handleFixTools = () => {
    if (!restaurant_id) return;
    fixTools.mutate(restaurant_id, {
      onSuccess: (data) => {
        toastSuccess(data.message || 'Tools configured successfully');
        handleDiagnose();
      },
      onError: (err) => toastError(err.message || 'Failed to fix tools'),
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading && !stats) {
    return (
      <DashboardLayout>
        <SkeletonCallTracking />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              Call History <span className="font-light text-warm-stone">/ Today</span>
            </h1>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => refetchConversations()}
                className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
              >
                Refresh
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
              >
                Export
              </button>
            </div>
          </div>

          <CallPhoneStatusCard
            phoneStatus={phoneStatusQuery.data ?? null}
            phoneStatusLoading={phoneStatusQuery.isLoading}
            setupLoading={setupPhone.isPending}
            diagnoseLoading={diagnose.isPending}
            disconnectLoading={disconnectPhone.isPending}
            onSetupPhone={handleSetupPhone}
            onDiagnose={handleDiagnose}
            onDisconnect={handleDisconnect}
            onRefreshStatus={() => { phoneStatusQuery.refetch(); toastInfo('Refreshing phone status...'); }}
          />

          {showDiagnosePanel && (
            <CallDiagnosticsPanel
              diagnoseData={diagnose.data ?? null}
              diagnoseLoading={diagnose.isPending}
              fixToolsLoading={fixTools.isPending}
              onFixTools={handleFixTools}
              onClose={() => setShowDiagnosePanel(false)}
            />
          )}

          <CallFilters filter={filter} onChange={setFilter} />

          {stats && <CallStatsOverview stats={stats} />}

          <CallConversationList
            conversations={conversations}
            filter={filter}
            onOutcomeChange={(outcome) => setFilter({ ...filter, outcome })}
            onConversationClick={(id) => setSelectedConversationId(id)}
          />

          {selectedConversation && (
            <CallConversationModal
              conversation={selectedConversation}
              onClose={() => setSelectedConversationId(null)}
            />
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
