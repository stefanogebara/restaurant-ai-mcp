/**
 * Call Tracking Dashboard
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/call-tracking/.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import { SkeletonCallTracking } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

import { toCsv, downloadCsv } from '../utils/exportCsv';
import { todayLocalISO } from '../utils/timeFormatting';
import ThiingsIcon from '../components/common/ThiingsIcon';
import ConfirmModal from '../components/common/ConfirmModal';
import CallPhoneStatusCard from '../components/call-tracking/CallPhoneStatusCard';
import CallDiagnosticsPanel from '../components/call-tracking/CallDiagnosticsPanel';
import CallFilters from '../components/call-tracking/CallFilters';
import CallStatsOverview from '../components/call-tracking/CallStatsOverview';
import CallConversationList from '../components/call-tracking/CallConversationList';
import CallConversationModal from '../components/call-tracking/CallConversationModal';
import GuestProfilePanel from '../components/call-tracking/GuestProfilePanel';

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
  const { t } = useTranslation();
  const [filter, setFilter] = useState<CallFilter>({ period: '7d', outcome: 'all', language: 'all' });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showDiagnosePanel, setShowDiagnosePanel] = useState(false);
  const [guestProfilePhone, setGuestProfilePhone] = useState<string | null>(null);
  // Confirm-disconnect modal state — replaces the native window.confirm() prompt.
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const { user } = useAuth();
  // Source of truth is the JWT, not localStorage. LS_RESTAURANT_ID was read in
  // 3 places but written nowhere — every read returned empty string, which
  // tripped the !restaurant_id guards in all 4 mutation handlers below and
  // bailed out with a "noRestaurantId" toast before the backend ever saw the
  // request. usePhoneStatus was also disabled (enabled: !!restaurantId).
  //
  // Supabase puts the value in user_metadata.restaurant_id; the backend has
  // a JWT-bound fallback (_authRestaurantId in phone-integration-simple.js)
  // but we still need a truthy client-side string so the React Query enabled
  // guard and the mutation guards pass.
  const restaurant_id = (user?.user_metadata as { restaurant_id?: string } | undefined)?.restaurant_id || '';

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const { data: convsResult, isLoading, isError, refetch: refetchConversations } = useCallConversations(filter, restaurant_id);
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
    if (!restaurant_id) {
      toastError(t('callTracking.noRestaurantId', 'No restaurant configured. Please complete onboarding first.'));
      return;
    }
    setupPhone.mutate(restaurant_id, {
      onSuccess: (data) => toastSuccess(data.message || t('callTracking.phoneConnected')),
      onError: (err) => toastError(err.message || t('callTracking.phoneSetupFailed')),
    });
  };

  const handleDisconnect = () => {
    if (!restaurant_id) {
      toastError(t('callTracking.noRestaurantId', 'No restaurant configured. Please complete onboarding first.'));
      return;
    }
    setShowDisconnectConfirm(true);
  };

  const performDisconnect = () => {
    if (!restaurant_id) return;
    setShowDisconnectConfirm(false);
    disconnectPhone.mutate(restaurant_id, {
      onSuccess: () => {
        toastSuccess(t('callTracking.phoneDisconnected'));
        setShowDiagnosePanel(false);
      },
      onError: (err) => toastError(err.message || t('callTracking.disconnectFailed')),
    });
  };

  const handleDiagnose = () => {
    if (!restaurant_id) {
      toastError(t('callTracking.noRestaurantId', 'No restaurant configured. Please complete onboarding first.'));
      return;
    }
    setShowDiagnosePanel(true);
    diagnose.mutate(restaurant_id, {
      onSuccess: () => toastSuccess(t('callTracking.diagnosticsLoaded')),
      onError: (err) => {
        toastError(err.message || t('callTracking.diagnosticsFailed'));
        setShowDiagnosePanel(false);
      },
    });
  };

  const handleFixTools = () => {
    if (!restaurant_id) {
      toastError(t('callTracking.noRestaurantId', 'No restaurant configured. Please complete onboarding first.'));
      return;
    }
    fixTools.mutate(restaurant_id, {
      onSuccess: (data) => {
        toastSuccess(data.message || t('callTracking.toolsConfigured'));
        handleDiagnose();
      },
      onError: (err) => toastError(err.message || t('callTracking.toolsFixFailed')),
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

  // A failed conversations fetch must not render as an empty "no calls" page —
  // that tells a restaurant with live call history it has none. Surface the
  // failure explicitly with a retry, matching the dashboard error-card pattern.
  if (isError) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="glass-panel rounded-lg p-8 max-w-md text-center">
            <div className="w-14 h-14 mx-auto mb-3 bg-red-50 rounded-2xl flex items-center justify-center">
              <ThiingsIcon name="alert-circle" pxSize={24} />
            </div>
            <h2 className="text-lg font-bold text-deep-charcoal mb-2">{t('dashboard.errorTitle')}</h2>
            <p className="text-sm text-stone-gray mb-6">{t('errors.serverError')}</p>
            <button
              type="button"
              onClick={() => refetchConversations()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <ThiingsIcon name="refresh" size="xs" />
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-12">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="font-serif text-3xl sm:text-4xl text-deep-charcoal tracking-tight">
              {t('callTracking.title')}
            </h1>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => refetchConversations()}
                className="px-4 py-2 border border-glass-border-dark bg-white/50 backdrop-blur-glass-chip text-[#A8A29E] hover:border-[#1C1917] hover:bg-white/80 rounded-lg text-[13px] font-medium transition-colors"
              >
                {t('callTracking.refresh')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!conversations.length) return;
                  const rows = conversations.map(c => ({
                    date: c.started_at ? new Date(c.started_at).toLocaleString() : '',
                    caller: c.caller_phone || '',
                    duration_seconds: c.duration_seconds ?? '',
                    outcome: c.outcome || '',
                    language: c.language || '',
                    customer_name: c.customer_name || '',
                    party_size: c.party_size ?? '',
                  }));
                  const columns = ['date', 'caller', 'duration_seconds', 'outcome', 'language', 'customer_name', 'party_size'];
                  downloadCsv(`calls-${todayLocalISO()}.csv`, toCsv(rows, columns));
                }}
                disabled={!conversations.length}
                title={!conversations.length ? t('callTracking.noCallsToExport', 'No calls to export') : ''}
                className={`px-4 py-2 border border-glass-border-dark bg-white/50 backdrop-blur-glass-chip rounded-lg text-[13px] font-medium transition-colors ${
                  conversations.length ? 'text-[#A8A29E] hover:bg-white/80 hover:border-[#1C1917]' : 'text-[#A8A29E] cursor-not-allowed opacity-40'
                }`}
              >
                {t('common.export')}
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
            onRefreshStatus={() => { phoneStatusQuery.refetch(); toastInfo(t('callTracking.refreshingStatus')); }}
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
            onPhoneClick={(phone) => setGuestProfilePhone(phone)}
          />

          {selectedConversation && (
            <CallConversationModal
              conversation={selectedConversation}
              onClose={() => setSelectedConversationId(null)}
            />
          )}

          {guestProfilePhone && (
            <GuestProfilePanel
              phone={guestProfilePhone}
              onClose={() => setGuestProfilePhone(null)}
            />
          )}

          <ConfirmModal
            open={showDisconnectConfirm}
            title={t('callTracking.disconnectTitle', 'Disconnect AI phone?')}
            message={t('callTracking.confirmDisconnect')}
            confirmLabel={t('callTracking.disconnect', 'Disconnect')}
            confirmTone="danger"
            isLoading={disconnectPhone.isPending}
            onCancel={() => setShowDisconnectConfirm(false)}
            onConfirm={performDisconnect}
          />

        </div>
      </div>
    </DashboardLayout>
  );
}
