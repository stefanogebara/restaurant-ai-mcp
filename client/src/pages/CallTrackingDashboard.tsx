/**
 * Call Tracking Dashboard
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/call-tracking/.
 */

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { SkeletonCallTracking } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { authFetch } from '../services/api';

import CallPhoneStatusCard from '../components/call-tracking/CallPhoneStatusCard';
import CallDiagnosticsPanel from '../components/call-tracking/CallDiagnosticsPanel';
import CallFilters from '../components/call-tracking/CallFilters';
import CallStatsOverview from '../components/call-tracking/CallStatsOverview';
import CallConversationList from '../components/call-tracking/CallConversationList';
import CallConversationModal from '../components/call-tracking/CallConversationModal';

import type {
  Conversation,
  Stats,
  PhoneStatusData,
  DiagnoseData,
  CallFilter,
} from '../components/call-tracking/callTrackingTypes';

export default function CallTrackingDashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState<CallFilter>({ period: '7d', outcome: 'all', language: 'all' });

  // Phone integration state
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatusData | null>(null);
  const [phoneStatusLoading, setPhoneStatusLoading] = useState(false);

  // Diagnose state
  const [diagnoseData, setDiagnoseData] = useState<DiagnoseData | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [showDiagnosePanel, setShowDiagnosePanel] = useState(false);

  // Action loading states
  const [setupLoading, setSetupLoading] = useState(false);
  const [fixToolsLoading, setFixToolsLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const restaurant_id = localStorage.getItem('restaurant_id') || '';

  // ─── Data fetching ───────────────────────────────────────────────────────────

  const fetchPhoneStatus = useCallback(async () => {
    if (!restaurant_id) return;
    setPhoneStatusLoading(true);
    try {
      const res = await authFetch(`/api/phone-integration-simple?action=status&restaurant_id=${restaurant_id}`);
      const data = await res.json();
      if (data.success && data.restaurant) {
        setPhoneStatus(data.restaurant);
      }
    } catch (err) {
      console.error('Error fetching phone status:', err);
    } finally {
      setPhoneStatusLoading(false);
    }
  }, [restaurant_id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const restaurantParam = restaurant_id ? `&restaurant_id=${restaurant_id}` : '';
      const outcomeParam = filter.outcome !== 'all' ? `&outcome=${filter.outcome}` : '';
      const languageParam = filter.language !== 'all' ? `&language=${filter.language}` : '';

      const [conversationsRes, statsRes] = await Promise.all([
        authFetch(`/api/agent-conversations?action=list&limit=50&offset=0${restaurantParam}${outcomeParam}${languageParam}`),
        authFetch(`/api/agent-conversations?action=stats&period=${filter.period}${restaurantParam}`),
      ]);

      const [conversationsData, statsData] = await Promise.all([
        conversationsRes.json(),
        statsRes.json(),
      ]);

      if (conversationsData.success) setConversations(conversationsData.conversations || []);
      if (statsData.success) setStats(statsData.stats);
    } catch (err) {
      console.error('Error fetching call data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, restaurant_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPhoneStatus(); }, [fetchPhoneStatus]);

  // ─── Phone integration actions ───────────────────────────────────────────────

  const handleDiagnose = useCallback(async () => {
    if (!restaurant_id) return;
    setDiagnoseLoading(true);
    setShowDiagnosePanel(true);
    try {
      const res = await authFetch(`/api/phone-integration-simple?action=diagnose&restaurant_id=${restaurant_id}`);
      const data = await res.json();
      if (data.success) {
        setDiagnoseData(data);
        toastSuccess('Agent diagnostics loaded');
      } else {
        toastError(data.error || 'Failed to diagnose agent');
        setDiagnoseData(null);
      }
    } catch {
      toastError('Network error while diagnosing agent');
      setDiagnoseData(null);
    } finally {
      setDiagnoseLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError]);

  const handleSetupPhone = useCallback(async () => {
    if (!restaurant_id) return;
    setSetupLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id }),
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess(data.message || 'Phone number connected successfully');
        fetchPhoneStatus();
      } else {
        toastError(data.error || 'Failed to set up phone');
      }
    } catch {
      toastError('Network error. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, fetchPhoneStatus]);

  const handleFixTools = useCallback(async () => {
    if (!restaurant_id) return;
    setFixToolsLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=fix-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id }),
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess(data.message || 'Tools configured successfully');
        handleDiagnose();
      } else {
        toastError(data.error || 'Failed to fix tools');
      }
    } catch {
      toastError('Network error while fixing tools');
    } finally {
      setFixToolsLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, handleDiagnose]);

  const handleDisconnect = useCallback(async () => {
    if (!restaurant_id) return;
    if (!confirm('Are you sure you want to disconnect this phone number?')) return;
    setDisconnectLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id }),
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess('Phone number disconnected');
        fetchPhoneStatus();
        setDiagnoseData(null);
        setShowDiagnosePanel(false);
      } else {
        toastError(data.error || 'Failed to disconnect phone');
      }
    } catch {
      toastError('Network error. Please try again.');
    } finally {
      setDisconnectLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, fetchPhoneStatus]);

  // ─── Conversation detail ─────────────────────────────────────────────────────

  async function viewConversation(id: string) {
    try {
      const res = await authFetch(`/api/agent-conversations?action=get&id=${id}`);
      const data = await res.json();
      if (data.success) setSelectedConversation(data.conversation);
    } catch (err) {
      console.error('Error fetching conversation details:', err);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading && !stats) {
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
                onClick={fetchData}
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
            phoneStatus={phoneStatus}
            phoneStatusLoading={phoneStatusLoading}
            setupLoading={setupLoading}
            diagnoseLoading={diagnoseLoading}
            disconnectLoading={disconnectLoading}
            onSetupPhone={handleSetupPhone}
            onDiagnose={handleDiagnose}
            onDisconnect={handleDisconnect}
            onRefreshStatus={() => { fetchPhoneStatus(); toastInfo('Refreshing phone status...'); }}
          />

          {showDiagnosePanel && (
            <CallDiagnosticsPanel
              diagnoseData={diagnoseData}
              diagnoseLoading={diagnoseLoading}
              fixToolsLoading={fixToolsLoading}
              onFixTools={handleFixTools}
              onClose={() => { setShowDiagnosePanel(false); setDiagnoseData(null); }}
            />
          )}

          <CallFilters filter={filter} onChange={setFilter} />

          {stats && <CallStatsOverview stats={stats} />}

          <CallConversationList
            conversations={conversations}
            filter={filter}
            onOutcomeChange={(outcome) => setFilter({ ...filter, outcome })}
            onConversationClick={viewConversation}
          />

          {selectedConversation && (
            <CallConversationModal
              conversation={selectedConversation}
              onClose={() => setSelectedConversation(null)}
            />
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
