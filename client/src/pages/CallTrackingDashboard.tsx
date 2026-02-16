/**
 * Call Tracking Dashboard
 *
 * Monitor and analyze all ElevenLabs AI agent phone conversations.
 * Shows call history, success metrics, transcripts, and agent performance.
 * Includes phone integration status, agent diagnostics, and setup controls.
 */

import { useState, useEffect, useCallback } from 'react';
import ThiingsIcon from '../components/common/ThiingsIcon';
import Spinner from '../components/common/Spinner';
import { SkeletonCallTracking } from '../components/common/Skeleton';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb, { breadcrumbConfigs } from '../components/common/Breadcrumb';
import { useToast } from '../contexts/ToastContext';
import { authFetch } from '../services/api';

interface Conversation {
  id: string;
  conversation_id: string;
  caller_phone: string;
  called_phone: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  language: string;
  outcome?: string;
  reservation_id?: string;
  customer_name?: string;
  party_size?: number;
  successful_booking?: boolean;
  customer_sentiment?: string;
  tools_used?: any[];
  errors_encountered?: any[];
  transcript?: any[];
  summary?: string;
}

interface Stats {
  overview: {
    total_calls: number;
    successful_bookings: number;
    success_rate: number;
    average_duration_seconds: number;
    average_duration_formatted: string;
  };
  breakdowns: {
    by_outcome: Record<string, number>;
    by_language: Record<string, number>;
    by_day: Record<string, number>;
  };
  top_errors: Array<{ error_type: string; count: number }>;
}

interface PhoneStatusData {
  name: string;
  has_agent: boolean;
  agent_id: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  status: 'not_configured' | 'pending' | 'active' | 'error';
  error: string | null;
  configured_at: string | null;
}

interface DiagnoseData {
  restaurant_name: string;
  agent_id: string;
  agent_name: string;
  has_tools: boolean;
  tool_count: number;
  tools: Array<{ name: string; type: string; url: string | null }>;
  language: string;
  first_message: string;
  prompt_preview: string;
  tool_ids: string[];
  tool_ids_count: number;
}

export default function CallTrackingDashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState({
    period: '7d',
    outcome: 'all',
    language: 'all'
  });

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

  // Get restaurant_id from localStorage (set during onboarding/login)
  const restaurant_id = localStorage.getItem('restaurant_id') || '';

  // Fetch phone integration status
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

  // Diagnose agent
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
    } catch (err) {
      toastError('Network error while diagnosing agent');
      setDiagnoseData(null);
    } finally {
      setDiagnoseLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError]);

  // Setup phone
  const handleSetupPhone = useCallback(async () => {
    if (!restaurant_id) return;
    setSetupLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id })
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess(data.message || 'Phone number connected successfully');
        fetchPhoneStatus();
      } else {
        toastError(data.error || 'Failed to set up phone');
      }
    } catch (err) {
      toastError('Network error. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, fetchPhoneStatus]);

  // Fix tools
  const handleFixTools = useCallback(async () => {
    if (!restaurant_id) return;
    setFixToolsLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=fix-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id })
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess(data.message || 'Tools configured successfully');
        // Refresh diagnostics to show updated state
        handleDiagnose();
      } else {
        toastError(data.error || 'Failed to fix tools');
      }
    } catch (err) {
      toastError('Network error while fixing tools');
    } finally {
      setFixToolsLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, handleDiagnose]);

  // Disconnect phone
  const handleDisconnect = useCallback(async () => {
    if (!restaurant_id) return;
    if (!confirm('Are you sure you want to disconnect this phone number?')) return;
    setDisconnectLoading(true);
    try {
      const res = await authFetch('/api/phone-integration-simple?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id })
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
    } catch (err) {
      toastError('Network error. Please try again.');
    } finally {
      setDisconnectLoading(false);
    }
  }, [restaurant_id, toastSuccess, toastError, fetchPhoneStatus]);

  // Fetch conversations and stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const restaurantParam = restaurant_id ? `&restaurant_id=${restaurant_id}` : '';

      const conversationsRes = await authFetch(
        `/api/agent-conversations?action=list&limit=50&offset=0${restaurantParam}${
          filter.outcome !== 'all' ? `&outcome=${filter.outcome}` : ''
        }${
          filter.language !== 'all' ? `&language=${filter.language}` : ''
        }`
      );
      const conversationsData = await conversationsRes.json();

      const statsRes = await authFetch(`/api/agent-conversations?action=stats&period=${filter.period}${restaurantParam}`);
      const statsData = await statsRes.json();

      if (conversationsData.success) {
        setConversations(conversationsData.conversations || []);
      }

      if (statsData.success) {
        setStats(statsData.stats);
      }
    } catch (err) {
      console.error('Error fetching call data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, restaurant_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchPhoneStatus();
  }, [fetchPhoneStatus]);

  async function viewConversation(id: string) {
    try {
      const res = await authFetch(`/api/agent-conversations?action=get&id=${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedConversation(data.conversation);
      }
    } catch (err) {
      console.error('Error fetching conversation details:', err);
    }
  }

  // Helper functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatConfiguredDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOutcomeColor = (outcome?: string) => {
    switch (outcome) {
      case 'reservation_created': return 'bg-green-500/10 text-green-600';
      case 'information_only': return 'bg-blue-500/10 text-blue-600';
      case 'error': return 'bg-red-500/10 text-red-600';
      case 'abandoned': return 'bg-gray-500/10 text-gray-600';
      default: return 'bg-gray-500/10 text-gray-600';
    }
  };

  const getOutcomeLabel = (outcome?: string) => {
    switch (outcome) {
      case 'reservation_created': return 'Reservation Created';
      case 'information_only': return 'Information Only';
      case 'error': return 'Error';
      case 'abandoned': return 'Abandoned';
      default: return 'Unknown';
    }
  };

  const getStatusBadge = (status: string) => {
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-600 text-xs font-semibold rounded-full">
            <Spinner size="sm" />
            Pending
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-600 text-xs font-semibold rounded-full">
            <ThiingsIcon name="alert-circle" size="xs" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-500/10 text-gray-600 text-xs font-semibold rounded-full">
            <ThiingsIcon name="wifi-off" size="xs" />
            Not Configured
          </span>
        );
    }
  };

  if (loading && !stats) {
    return (
      <DashboardLayout>
        <SkeletonCallTracking />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard min-h-screen bg-[#FAFAF9] p-6">
        <div className="max-w-7xl mx-auto space-y-8">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={breadcrumbConfigs.calls} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight">AI Agent Dashboard</h1>
            <p className="text-[#57534E] mt-1">Monitor AI agent performance, calls, and phone settings</p>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors font-medium text-sm self-start sm:self-auto"
          >
            Refresh
          </button>
        </div>

        {/* Phone Status Card */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <ThiingsIcon name="phone-call" pxSize={24} />
              <div>
                <h2 className="text-lg font-semibold text-[#1C1917]">Phone Status</h2>
                <p className="text-sm text-[#57534E]">
                  {phoneStatus?.status === 'active'
                    ? 'Your AI agent is receiving calls'
                    : phoneStatus?.status === 'error'
                      ? 'There is an issue with your phone integration'
                      : 'Connect a phone number to start receiving AI calls'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phoneStatusLoading ? (
                <Spinner size="md" />
              ) : (
                phoneStatus && getStatusBadge(phoneStatus.status)
              )}
            </div>
          </div>

          {phoneStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {/* Connection Status */}
              <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                <p className="text-xs text-[#57534E] mb-1">Connection</p>
                <div className="flex items-center gap-2">
                  {phoneStatus.status === 'active' ? (
                    <ThiingsIcon name="wifi" size="xs" />
                  ) : (
                    <ThiingsIcon name="wifi-off" size="xs" />
                  )}
                  <span className="text-sm font-medium text-[#1C1917] capitalize">
                    {phoneStatus.status === 'not_configured' ? 'Not Connected' : phoneStatus.status}
                  </span>
                </div>
              </div>

              {/* Phone Number */}
              <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                <p className="text-xs text-[#57534E] mb-1">Phone Number</p>
                <p className="text-sm font-medium text-[#1C1917]">
                  {phoneStatus.phone_number || 'None assigned'}
                </p>
              </div>

              {/* Agent ID */}
              <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                <p className="text-xs text-[#57534E] mb-1">Agent ID</p>
                <p className="text-sm font-medium text-[#1C1917] font-mono truncate" title={phoneStatus.agent_id || undefined}>
                  {phoneStatus.agent_id
                    ? `${phoneStatus.agent_id.substring(0, 12)}...`
                    : 'No agent'
                  }
                </p>
              </div>

              {/* Configured Date */}
              <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                <p className="text-xs text-[#57534E] mb-1">Configured</p>
                <p className="text-sm font-medium text-[#1C1917]">
                  {formatConfiguredDate(phoneStatus.configured_at)}
                </p>
              </div>
            </div>
          )}

          {/* Error message display */}
          {phoneStatus?.status === 'error' && phoneStatus.error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
              <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{phoneStatus.error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-[#E7E5E4]">
            {/* Setup Phone - shown when not configured */}
            {(!phoneStatus || phoneStatus.status === 'not_configured' || phoneStatus.status === 'error') && (
              <button
                onClick={handleSetupPhone}
                disabled={setupLoading}
                className="px-4 py-2 bg-[#9F1239] text-white rounded-lg font-medium hover:bg-[#881337] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {setupLoading ? (
                  <>
                    <Spinner size="sm" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <ThiingsIcon name="phone" size="xs" />
                    Setup Phone
                  </>
                )}
              </button>
            )}

            {/* Diagnose Agent */}
            {phoneStatus?.has_agent && (
              <button
                onClick={handleDiagnose}
                disabled={diagnoseLoading}
                className="px-4 py-2 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {diagnoseLoading ? (
                  <>
                    <Spinner size="sm" />
                    Diagnosing...
                  </>
                ) : (
                  <>
                    <ThiingsIcon name="stethoscope" size="xs" />
                    Diagnose Agent
                  </>
                )}
              </button>
            )}

            {/* Disconnect - shown when active */}
            {phoneStatus?.status === 'active' && (
              <button
                onClick={handleDisconnect}
                disabled={disconnectLoading}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {disconnectLoading ? (
                  <>
                    <Spinner size="sm" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <ThiingsIcon name="phone-off" size="xs" />
                    Disconnect
                  </>
                )}
              </button>
            )}

            {/* Refresh Status */}
            <button
              onClick={() => {
                fetchPhoneStatus();
                toastInfo('Refreshing phone status...');
              }}
              className="px-3 py-2 text-[#57534E] hover:text-[#1C1917] transition-colors text-sm"
            >
              Refresh Status
            </button>
          </div>
        </div>

        {/* Agent Diagnostics Panel */}
        {showDiagnosePanel && (
          <div className="bg-white rounded-xl border border-[#E7E5E4] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ThiingsIcon name="stethoscope" size="sm" />
                <h2 className="text-lg font-semibold text-[#1C1917]">Agent Diagnostics</h2>
              </div>
              <button
                onClick={() => {
                  setShowDiagnosePanel(false);
                  setDiagnoseData(null);
                }}
                className="p-1 hover:bg-[#F5F5F4] rounded transition-colors"
              >
                <ThiingsIcon name="close" size="sm" />
              </button>
            </div>

            {diagnoseLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : diagnoseData ? (
              <div className="space-y-4">
                {/* Agent Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                    <p className="text-xs text-[#57534E] mb-1">Agent Name</p>
                    <p className="text-sm font-medium text-[#1C1917]">{diagnoseData.agent_name || 'Unnamed'}</p>
                  </div>
                  <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                    <p className="text-xs text-[#57534E] mb-1">Language</p>
                    <p className="text-sm font-medium text-[#1C1917] uppercase">{diagnoseData.language || 'Not set'}</p>
                  </div>
                  <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                    <p className="text-xs text-[#57534E] mb-1">Tools (via tool_ids)</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#1C1917]">{diagnoseData.tool_ids_count} configured</p>
                      {diagnoseData.tool_ids_count === 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500/10 text-red-600 text-xs rounded font-medium">
                          Missing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tool Names */}
                {diagnoseData.tools && diagnoseData.tools.length > 0 && (
                  <div>
                    <p className="text-xs text-[#57534E] mb-2">Embedded Tools ({diagnoseData.tool_count})</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnoseData.tools.map((tool, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-[#F5F5F4] text-[#1C1917] text-xs font-medium rounded-full"
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tool IDs */}
                {diagnoseData.tool_ids && diagnoseData.tool_ids.length > 0 && (
                  <div>
                    <p className="text-xs text-[#57534E] mb-2">Tool IDs ({diagnoseData.tool_ids_count})</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnoseData.tool_ids.map((id, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-[#F5F5F4] text-[#57534E] text-xs font-mono rounded-full"
                          title={id}
                        >
                          {id.substring(0, 16)}...
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* First Message Preview */}
                {diagnoseData.first_message && (
                  <div>
                    <p className="text-xs text-[#57534E] mb-1">First Message Preview</p>
                    <div className="bg-[#F5F5F4]/30 rounded-lg p-3">
                      <p className="text-sm text-[#1C1917] italic">
                        "{diagnoseData.first_message.length > 200
                          ? diagnoseData.first_message.substring(0, 200) + '...'
                          : diagnoseData.first_message}"
                      </p>
                    </div>
                  </div>
                )}

                {/* Fix Tools Button - shown when tool_ids_count is 0 */}
                {diagnoseData.tool_ids_count === 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#1C1917]">No tools configured</p>
                        <p className="text-xs text-[#57534E] mt-1">
                          Your agent has no webhook tools attached. Without tools, the agent cannot check availability or create reservations. Click "Fix Tools" to auto-create and attach the required tools.
                        </p>
                        <button
                          onClick={handleFixTools}
                          disabled={fixToolsLoading}
                          className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {fixToolsLoading ? (
                            <>
                              <Spinner size="sm" />
                              Fixing tools...
                            </>
                          ) : (
                            <>
                              <ThiingsIcon name="wrench" size="xs" />
                              Fix Tools
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[#57534E] text-center py-4">
                No diagnostic data available. Click "Diagnose Agent" to check your agent configuration.
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] p-4">
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium text-[#1C1917] block mb-1">Time Period</label>
              <select
                value={filter.period}
                onChange={(e) => setFilter({ ...filter, period: e.target.value })}
                className="px-3 py-2 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg text-[#1C1917]"
              >
                <option value="1d">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-[#1C1917] block mb-1">Outcome</label>
              <select
                value={filter.outcome}
                onChange={(e) => setFilter({ ...filter, outcome: e.target.value })}
                className="px-3 py-2 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg text-[#1C1917]"
              >
                <option value="all">All Outcomes</option>
                <option value="reservation_created">Reservations Created</option>
                <option value="information_only">Information Only</option>
                <option value="error">Errors</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-[#1C1917] block mb-1">Language</label>
              <select
                value={filter.language}
                onChange={(e) => setFilter({ ...filter, language: e.target.value })}
                className="px-3 py-2 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg text-[#1C1917]"
              >
                <option value="all">All Languages</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="pt">Portuguese</option>
                <option value="fr">French</option>
                <option value="it">Italian</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Calls */}
            <div className="bg-white rounded-xl border border-[#E7E5E4]/50 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-1 w-12 rounded-full mb-3 bg-[#1C1917]" />
              <p className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">{stats.overview.total_calls}</p>
              <p className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">Total Calls</p>
            </div>

            {/* Successful Bookings */}
            <div className="bg-white rounded-xl border border-[#E7E5E4]/50 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-1 w-12 rounded-full mb-3 bg-[#22c55e]" />
              <p className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">{stats.overview.successful_bookings}</p>
              <p className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">Reservations</p>
            </div>

            {/* Success Rate */}
            <div className="bg-white rounded-xl border border-[#E7E5E4]/50 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-1 w-12 rounded-full mb-3 bg-[#9F1239]" />
              <p className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">{stats.overview.success_rate}%</p>
              <p className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">Success Rate</p>
            </div>

            {/* Average Duration */}
            <div className="bg-white rounded-xl border border-[#E7E5E4]/50 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="h-1 w-12 rounded-full mb-3 bg-[#d97706]" />
              <p className="text-3xl font-bold text-[#1C1917] tracking-tight tabular-nums">{stats.overview.average_duration_formatted}</p>
              <p className="text-xs font-medium text-[#78716C] uppercase tracking-wider mt-1">Avg Duration</p>
            </div>
          </div>
        )}

        {/* Call History Table */}
        <div className="bg-white rounded-xl border border-[#E7E5E4] overflow-hidden">
          <div className="p-4 border-b border-[#E7E5E4]">
            <h2 className="text-lg font-semibold text-[#1C1917]">Call History</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F5F5F4]/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Time</th>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Customer</th>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Duration</th>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Language</th>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Outcome</th>
                  <th className="text-left p-4 text-sm font-medium text-[#57534E]">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conversations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#57534E]">
                      <p className="font-medium mb-1">No calls recorded yet</p>
                      <p className="text-sm">Once your AI agent starts taking calls, conversations will appear here. Try adjusting your filters if you expect to see results.</p>
                    </td>
                  </tr>
                ) : (
                  conversations.map((conv) => (
                    <tr key={conv.id} className="hover:bg-[#F5F5F4]/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <ThiingsIcon name="calendar" size="xs" />
                          <span className="text-sm text-[#1C1917]">{formatDate(conv.started_at)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          {conv.customer_name ? (
                            <>
                              <p className="text-sm font-medium text-[#1C1917]">{conv.customer_name}</p>
                              <p className="text-xs text-[#57534E]">{conv.caller_phone}</p>
                            </>
                          ) : (
                            <p className="text-sm text-[#57534E]">{conv.caller_phone || 'Unknown'}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <ThiingsIcon name="clock" size="xs" />
                          <span className="text-sm text-[#1C1917]">
                            {conv.duration_seconds ? `${Math.floor(conv.duration_seconds / 60)}m ${conv.duration_seconds % 60}s` : 'In progress'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <ThiingsIcon name="globe" size="xs" />
                          <span className="text-sm text-[#1C1917] uppercase">{conv.language}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOutcomeColor(conv.outcome)}`}>
                          {getOutcomeLabel(conv.outcome)}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => viewConversation(conv.id)}
                          className="px-3 py-1 bg-[#9F1239]/10 hover:bg-[#9F1239]/20 text-[#9F1239] rounded text-sm font-medium transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversation Detail Modal */}
        {selectedConversation && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-[#E7E5E4] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-[#E7E5E4] p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#1C1917]">Conversation Details</h2>
                  <p className="text-sm text-[#57534E] mt-1">
                    {formatDate(selectedConversation.started_at)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="p-2 hover:bg-[#F5F5F4] rounded-lg transition-colors"
                >
                  <ThiingsIcon name="close" size="sm" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Summary */}
                {selectedConversation.summary && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <ThiingsIcon name="chat" size="sm" className="mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-[#1C1917] mb-1">Summary</h3>
                        <p className="text-sm text-[#57534E]">{selectedConversation.summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-[#57534E]">Outcome</p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getOutcomeColor(selectedConversation.outcome)}`}>
                      {getOutcomeLabel(selectedConversation.outcome)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-[#57534E]">Duration</p>
                    <p className="text-sm font-medium text-[#1C1917] mt-1">
                      {selectedConversation.duration_seconds ? `${Math.floor(selectedConversation.duration_seconds / 60)}m ${selectedConversation.duration_seconds % 60}s` : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#57534E]">Language</p>
                    <p className="text-sm font-medium text-[#1C1917] mt-1 uppercase">{selectedConversation.language}</p>
                  </div>
                  {selectedConversation.reservation_id && (
                    <div>
                      <p className="text-sm text-[#57534E]">Reservation ID</p>
                      <p className="text-sm font-medium text-[#1C1917] mt-1">{selectedConversation.reservation_id}</p>
                    </div>
                  )}
                </div>

                {/* Tools Used */}
                {selectedConversation.tools_used && selectedConversation.tools_used.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-[#1C1917] mb-3">Tools Used</h3>
                    <div className="space-y-2">
                      {selectedConversation.tools_used.map((tool, idx) => (
                        <div key={idx} className="bg-[#F5F5F4]/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[#1C1917]">{tool.tool_name}</span>
                            {tool.success ? (
                              <ThiingsIcon name="check-circle" size="xs" />
                            ) : (
                              <ThiingsIcon name="x-circle" size="xs" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript */}
                {selectedConversation.transcript && selectedConversation.transcript.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-[#1C1917] mb-3">Transcript</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {selectedConversation.transcript.map((message: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            message.role === 'user'
                              ? 'bg-blue-500/10 ml-8'
                              : 'bg-green-500/10 mr-8'
                          }`}
                        >
                          <p className="text-xs text-[#57534E] mb-1">
                            {message.role === 'user' ? 'Customer' : 'Agent'}
                          </p>
                          <p className="text-sm text-[#1C1917]">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {selectedConversation.errors_encountered && selectedConversation.errors_encountered.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-red-600 mb-3">Errors Encountered</h3>
                    <div className="space-y-2">
                      {selectedConversation.errors_encountered.map((error: any, idx: number) => (
                        <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                          <p className="text-sm font-medium text-[#1C1917]">{error.error_type}</p>
                          <p className="text-xs text-[#57534E] mt-1">{error.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-white border-t border-[#E7E5E4] p-4">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="w-full px-4 py-2 bg-[#9F1239] text-white rounded-lg font-medium hover:bg-[#881337] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
