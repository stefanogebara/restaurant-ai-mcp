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
      case 'error': return 'bg-red-600/10 text-red-600';
      case 'abandoned': return 'bg-warm-stone/10 text-stone-gray';
      default: return 'bg-warm-stone/10 text-stone-gray';
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
      <div className="min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
          <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
            Call History <span className="font-light text-warm-stone">/ Today</span>
          </h1>
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors"
            >
              Refresh
            </button>
            <button className="px-4 py-2 bg-white border border-border-gray text-stone-gray hover:border-muted-stone rounded-xl text-[13px] font-medium transition-colors">
              Export
            </button>
          </div>
        </div>

        {/* Phone Status Card */}
        <div className="bg-white rounded-2xl border border-border-gray overflow-hidden p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <ThiingsIcon name="phone-call" pxSize={24} />
              <div>
                <h2 className="text-lg font-semibold text-deep-charcoal">Phone Status</h2>
                <p className="text-sm text-stone-gray">
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

              {/* Phone Number */}
              <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
                <p className="text-xs text-stone-gray mb-1">Phone Number</p>
                <p className="text-sm font-medium text-deep-charcoal">
                  {phoneStatus.phone_number || 'None assigned'}
                </p>
              </div>

              {/* Agent ID */}
              <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
                <p className="text-xs text-stone-gray mb-1">Agent ID</p>
                <p className="text-sm font-medium text-deep-charcoal font-mono truncate" title={phoneStatus.agent_id || undefined}>
                  {phoneStatus.agent_id
                    ? `${phoneStatus.agent_id.substring(0, 12)}...`
                    : 'No agent'
                  }
                </p>
              </div>

              {/* Configured Date */}
              <div className="bg-soft-gray/30 rounded-xl p-3 border border-border-gray/50">
                <p className="text-xs text-stone-gray mb-1">Configured</p>
                <p className="text-sm font-medium text-deep-charcoal">
                  {formatConfiguredDate(phoneStatus.configured_at)}
                </p>
              </div>
            </div>
          )}

          {/* Error message display */}
          {phoneStatus?.status === 'error' && phoneStatus.error && (
            <div className="mt-4 bg-red-600/10 border border-red-600/20 rounded-xl p-3 flex items-start gap-2">
              <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{phoneStatus.error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border-gray">
            {/* Setup Phone - shown when not configured */}
            {(!phoneStatus || phoneStatus.status === 'not_configured' || phoneStatus.status === 'error') && (
              <button
                onClick={handleSetupPhone}
                disabled={setupLoading}
                className="px-4 py-2 bg-burgundy text-white rounded-xl font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50 flex items-center gap-2"
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
                className="px-4 py-2 bg-soft-gray hover:bg-border-gray text-deep-charcoal rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
                className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
              className="px-3 py-2 text-stone-gray hover:text-deep-charcoal transition-colors text-sm"
            >
              Refresh Status
            </button>
          </div>
        </div>

        {/* Agent Diagnostics Panel */}
        {showDiagnosePanel && (
          <div className="bg-white rounded-2xl border border-border-gray overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ThiingsIcon name="stethoscope" size="sm" />
                <h2 className="text-lg font-semibold text-deep-charcoal">Agent Diagnostics</h2>
              </div>
              <button
                onClick={() => {
                  setShowDiagnosePanel(false);
                  setDiagnoseData(null);
                }}
                className="p-1 hover:bg-soft-gray rounded transition-colors"
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
                  <div className="bg-soft-gray/30 rounded-xl p-3">
                    <p className="text-xs text-stone-gray mb-1">Agent Name</p>
                    <p className="text-sm font-medium text-deep-charcoal">{diagnoseData.agent_name || 'Unnamed'}</p>
                  </div>
                  <div className="bg-soft-gray/30 rounded-xl p-3">
                    <p className="text-xs text-stone-gray mb-1">Language</p>
                    <p className="text-sm font-medium text-deep-charcoal uppercase">{diagnoseData.language || 'Not set'}</p>
                  </div>
                  <div className="bg-soft-gray/30 rounded-xl p-3">
                    <p className="text-xs text-stone-gray mb-1">Tools (via tool_ids)</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-deep-charcoal">{diagnoseData.tool_ids_count} configured</p>
                      {diagnoseData.tool_ids_count === 0 && (
                        <span className="px-1.5 py-0.5 bg-red-600/10 text-red-600 text-xs rounded font-medium">
                          Missing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tool Names */}
                {diagnoseData.tools && diagnoseData.tools.length > 0 && (
                  <div>
                    <p className="text-xs text-stone-gray mb-2">Embedded Tools ({diagnoseData.tool_count})</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnoseData.tools.map((tool, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-soft-gray text-deep-charcoal text-xs font-medium rounded-full border border-border-gray/50"
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
                    <p className="text-xs text-stone-gray mb-2">Tool IDs ({diagnoseData.tool_ids_count})</p>
                    <div className="flex flex-wrap gap-2">
                      {diagnoseData.tool_ids.map((id, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-soft-gray text-stone-gray text-xs font-mono rounded-full border border-border-gray/50"
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
                    <p className="text-xs text-stone-gray mb-1">First Message Preview</p>
                    <div className="bg-soft-gray/30 rounded-xl p-3">
                      <p className="text-sm text-deep-charcoal italic">
                        "{diagnoseData.first_message.length > 200
                          ? diagnoseData.first_message.substring(0, 200) + '...'
                          : diagnoseData.first_message}"
                      </p>
                    </div>
                  </div>
                )}

                {/* Fix Tools Button - shown when tool_ids_count is 0 */}
                {diagnoseData.tool_ids_count === 0 && (
                  <div className="bg-amber-600/10 border border-amber-600/20 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <ThiingsIcon name="alert-circle" size="sm" className="shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-deep-charcoal">No tools configured</p>
                        <p className="text-xs text-stone-gray mt-1">
                          Your agent has no webhook tools attached. Without tools, the agent cannot check availability or create reservations. Click "Fix Tools" to auto-create and attach the required tools.
                        </p>
                        <button
                          onClick={handleFixTools}
                          disabled={fixToolsLoading}
                          className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
              <p className="text-sm text-stone-gray text-center py-4">
                No diagnostic data available. Click "Diagnose Agent" to check your agent configuration.
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
          <div className="flex items-center gap-6 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-stone">Period</span>
              <div className="flex gap-0">
                {[
                  { value: '1d', label: '24h' },
                  { value: '7d', label: '7 days' },
                  { value: '30d', label: '30 days' },
                  { value: '90d', label: '90 days' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter({ ...filter, period: opt.value })}
                    className={`text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
                      filter.period === opt.value
                        ? 'text-deep-charcoal bg-soft-gray'
                        : 'text-muted-stone hover:text-stone-gray'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-stone">Outcome</span>
              <select
                value={filter.outcome}
                onChange={(e) => setFilter({ ...filter, outcome: e.target.value })}
                className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer"
              >
                <option value="all">All</option>
                <option value="reservation_created">Booked</option>
                <option value="information_only">Info</option>
                <option value="error">Errors</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-stone">Language</span>
              <select
                value={filter.language}
                onChange={(e) => setFilter({ ...filter, language: e.target.value })}
                className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer"
              >
                <option value="all">All</option>
                <option value="en">EN</option>
                <option value="es">ES</option>
                <option value="pt">PT</option>
                <option value="fr">FR</option>
                <option value="it">IT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-border-gray p-6">
              <div className="text-xs font-medium text-muted-stone mb-2">Total Calls Today</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">{stats.overview.total_calls}</div>
              <div className="text-xs text-warm-stone mt-1">{stats.overview.successful_bookings} successful bookings</div>
            </div>
            <div className="bg-white rounded-2xl border border-border-gray p-6">
              <div className="text-xs font-medium text-muted-stone mb-2">Success Rate</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-green-600">{stats.overview.success_rate}%</div>
              <div className="text-xs text-warm-stone mt-1">{stats.overview.successful_bookings} of {stats.overview.total_calls} calls resolved</div>
            </div>
            <div className="bg-white rounded-2xl border border-border-gray p-6">
              <div className="text-xs font-medium text-muted-stone mb-2">Avg Duration</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">{stats.overview.average_duration_formatted}</div>
              <div className="text-xs text-warm-stone mt-1">minutes per call</div>
            </div>
            <div className="bg-white rounded-2xl border border-border-gray p-6">
              <div className="text-xs font-medium text-muted-stone mb-2">Bookings via Call</div>
              <div className="text-[32px] font-bold tracking-tight leading-none text-burgundy">{stats.overview.successful_bookings}</div>
              <div className="text-xs text-warm-stone mt-1">
                {stats.overview.total_calls > 0
                  ? `${Math.round((stats.overview.successful_bookings / stats.overview.total_calls) * 100)}% conversion rate`
                  : 'No calls yet'}
              </div>
            </div>
          </div>
        )}

        {/* Call History */}
        <div className="bg-white rounded-2xl border border-border-gray overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
            <span className="text-[15px] font-semibold tracking-tight">Recent Calls</span>
            <div className="flex gap-0">
              {[
                { value: 'all', label: 'All' },
                { value: 'reservation_created', label: 'Booked' },
                { value: 'error', label: 'Missed' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilter({ ...filter, outcome: tab.value })}
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
                    filter.outcome === tab.value
                      ? 'text-deep-charcoal bg-soft-gray'
                      : 'text-muted-stone hover:text-stone-gray'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {conversations.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
                <ThiingsIcon name="phone" pxSize={24} />
              </div>
              <p className="text-sm font-semibold text-deep-charcoal mb-1">No calls recorded yet</p>
              <p className="text-xs text-muted-stone">Once your AI agent starts taking calls, conversations will appear here.</p>
            </div>
          ) : (
            <div>
              {conversations.map((conv) => {
                const getCallIconStyle = (outcome?: string) => {
                  switch (outcome) {
                    case 'reservation_created': return 'bg-green-600/[8%] text-green-600';
                    case 'information_only': return 'bg-blue-500/[8%] text-blue-500';
                    case 'error': return 'bg-red-600/[8%] text-red-600';
                    case 'abandoned': return 'bg-amber-600/[8%] text-amber-600';
                    default: return 'bg-soft-gray text-stone-gray';
                  }
                };
                const getOutcomePill = (outcome?: string) => {
                  switch (outcome) {
                    case 'reservation_created': return 'bg-green-600/[8%] text-green-600';
                    case 'information_only': return 'bg-blue-500/[8%] text-blue-500';
                    case 'error': return 'bg-red-600/[8%] text-red-600';
                    case 'abandoned': return 'bg-amber-600/[8%] text-amber-600';
                    default: return 'bg-soft-gray text-stone-gray';
                  }
                };
                return (
                  <div
                    key={conv.id}
                    className="flex items-center px-6 py-4 border-b border-warm-white gap-4 cursor-pointer hover:bg-warm-white transition-colors"
                    onClick={() => viewConversation(conv.id)}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getCallIconStyle(conv.outcome)}`}>
                      <ThiingsIcon name="phone-call" size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-deep-charcoal tracking-[-0.2px]">
                        {conv.customer_name || 'Unknown Caller'}
                      </div>
                      <div className="text-xs text-muted-stone mt-0.5 truncate">
                        {conv.caller_phone || 'No number'}{conv.party_size ? ` · Party of ${conv.party_size}` : ''}{conv.language ? ` · ${conv.language.toUpperCase()}` : ''}
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${getOutcomePill(conv.outcome)}`}>
                      {getOutcomeLabel(conv.outcome)}
                    </span>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-[13px] font-medium text-stone-gray">
                        {new Date(conv.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-muted-stone mt-0.5">
                        {conv.duration_seconds
                          ? `${Math.floor(conv.duration_seconds / 60)}:${String(conv.duration_seconds % 60).padStart(2, '0')}`
                          : 'Live'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Conversation Detail Modal */}
        {selectedConversation && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-border-gray shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-border-gray p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-deep-charcoal">Conversation Details</h2>
                  <p className="text-sm text-stone-gray mt-1">
                    {formatDate(selectedConversation.started_at)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedConversation(null)}
                  aria-label="Close"
                  className="p-2 hover:bg-soft-gray rounded-xl transition-colors"
                >
                  <ThiingsIcon name="close" size="sm" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Summary */}
                {selectedConversation.summary && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <ThiingsIcon name="chat" size="sm" className="mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-deep-charcoal mb-1">Summary</h3>
                        <p className="text-sm text-stone-gray">{selectedConversation.summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-stone-gray">Outcome</p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getOutcomeColor(selectedConversation.outcome)}`}>
                      {getOutcomeLabel(selectedConversation.outcome)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-stone-gray">Duration</p>
                    <p className="text-sm font-medium text-deep-charcoal mt-1">
                      {selectedConversation.duration_seconds ? `${Math.floor(selectedConversation.duration_seconds / 60)}m ${selectedConversation.duration_seconds % 60}s` : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-gray">Language</p>
                    <p className="text-sm font-medium text-deep-charcoal mt-1 uppercase">{selectedConversation.language}</p>
                  </div>
                  {selectedConversation.reservation_id && (
                    <div>
                      <p className="text-sm text-stone-gray">Reservation ID</p>
                      <p className="text-sm font-medium text-deep-charcoal mt-1">{selectedConversation.reservation_id}</p>
                    </div>
                  )}
                </div>

                {/* Tools Used */}
                {selectedConversation.tools_used && selectedConversation.tools_used.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-deep-charcoal mb-3">Tools Used</h3>
                    <div className="space-y-2">
                      {selectedConversation.tools_used.map((tool, idx) => (
                        <div key={idx} className="bg-soft-gray/50 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-deep-charcoal">{tool.tool_name}</span>
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
                    <h3 className="font-semibold text-deep-charcoal mb-3">Transcript</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {selectedConversation.transcript.map((message: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl ${
                            message.role === 'user'
                              ? 'bg-blue-500/10 ml-8'
                              : 'bg-green-500/10 mr-8'
                          }`}
                        >
                          <p className="text-xs text-stone-gray mb-1">
                            {message.role === 'user' ? 'Customer' : 'Agent'}
                          </p>
                          <p className="text-sm text-deep-charcoal">{message.content}</p>
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
                        <div key={idx} className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
                          <p className="text-sm font-medium text-deep-charcoal">{error.error_type}</p>
                          <p className="text-xs text-stone-gray mt-1">{error.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-white border-t border-border-gray p-4">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="w-full px-4 py-2 bg-burgundy text-white rounded-xl font-medium hover:bg-burgundy-dark transition-colors"
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
