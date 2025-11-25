/**
 * Call Tracking Dashboard
 *
 * Monitor and analyze all ElevenLabs AI agent phone conversations.
 * Shows call history, success metrics, transcripts, and agent performance.
 */

import { useState, useEffect } from 'react';
import { Phone, Calendar, Clock, CheckCircle, XCircle, TrendingUp, MessageSquare, Globe, Settings, PhoneCall, AlertCircle, Loader2 } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

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

interface PhoneStatus {
  has_agent: boolean;
  agent_id: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  status: 'not_configured' | 'pending' | 'active' | 'error';
  error: string | null;
  configured_at: string | null;
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
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [showPhoneSettings, setShowPhoneSettings] = useState(false);
  const [phoneForm, setPhoneForm] = useState({
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: ''
  });
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // TODO: Get restaurant_id from auth context or URL params
  const restaurant_id = 'default'; // Replace with actual restaurant ID from context

  // Fetch conversations and stats
  useEffect(() => {
    fetchData();
  }, [filter]);

  // Fetch phone integration status
  useEffect(() => {
    fetchPhoneStatus();
  }, []);

  async function fetchPhoneStatus() {
    try {
      const res = await fetch(`/api/phone-integration?action=status&restaurant_id=${restaurant_id}`);
      const data = await res.json();
      if (data.success) {
        setPhoneStatus(data.data);
      }
    } catch (error) {
      console.error('Error fetching phone status:', error);
    }
  }

  async function handleRegisterPhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneLoading(true);
    setPhoneError(null);

    try {
      const res = await fetch('/api/phone-integration?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id,
          ...phoneForm
        })
      });

      const data = await res.json();

      if (data.success) {
        setShowPhoneSettings(false);
        setPhoneForm({ twilio_account_sid: '', twilio_auth_token: '', twilio_phone_number: '' });
        fetchPhoneStatus();
      } else {
        setPhoneError(data.error || 'Failed to register phone number');
      }
    } catch (error) {
      setPhoneError('Network error. Please try again.');
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handleUnregisterPhone() {
    if (!confirm('Are you sure you want to disconnect this phone number?')) return;

    setPhoneLoading(true);
    try {
      const res = await fetch('/api/phone-integration?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id })
      });

      const data = await res.json();
      if (data.success) {
        fetchPhoneStatus();
      }
    } catch (error) {
      console.error('Error unregistering phone:', error);
    } finally {
      setPhoneLoading(false);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch conversations list
      const conversationsRes = await fetch(
        `/api/agent-conversations?action=list&limit=50&offset=0${
          filter.outcome !== 'all' ? `&outcome=${filter.outcome}` : ''
        }${
          filter.language !== 'all' ? `&language=${filter.language}` : ''
        }`
      );
      const conversationsData = await conversationsRes.json();

      // Fetch stats
      const statsRes = await fetch(`/api/agent-conversations?action=stats&period=${filter.period}`);
      const statsData = await statsRes.json();

      if (conversationsData.success) {
        setConversations(conversationsData.conversations || []);
      }

      if (statsData.success) {
        setStats(statsData.stats);
      }

    } catch (error) {
      console.error('Error fetching call data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function viewConversation(id: string) {
    try {
      const res = await fetch(`/api/agent-conversations?action=get&id=${id}`);
      const data = await res.json();

      if (data.success) {
        setSelectedConversation(data.conversation);
      }
    } catch (error) {
      console.error('Error fetching conversation details:', error);
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

  const getOutcomeColor = (outcome?: string) => {
    switch (outcome) {
      case 'reservation_created': return 'bg-green-500/10 text-green-600 dark:text-green-400';
      case 'information_only': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'error': return 'bg-red-500/10 text-red-600 dark:text-red-400';
      case 'abandoned': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
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

  if (loading && !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading call data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Agent Dashboard</h1>
            <p className="text-muted-foreground mt-1">Monitor AI agent performance, calls, and phone settings</p>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Phone Integration Status Card */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                phoneStatus?.status === 'active'
                  ? 'bg-green-500/10'
                  : phoneStatus?.status === 'error'
                    ? 'bg-red-500/10'
                    : 'bg-gray-500/10'
              }`}>
                <PhoneCall className={`w-6 h-6 ${
                  phoneStatus?.status === 'active'
                    ? 'text-green-600 dark:text-green-400'
                    : phoneStatus?.status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
                }`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Phone Integration</h2>
                {phoneStatus?.status === 'active' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-green-600 dark:text-green-400 font-medium">{phoneStatus.phone_number}</span>
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 text-xs rounded-full">Active</span>
                  </div>
                ) : phoneStatus?.status === 'error' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-600 dark:text-red-400 text-sm">{phoneStatus.error || 'Configuration error'}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm mt-1">
                    Connect a phone number so customers can call your AI agent directly
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phoneStatus?.status === 'active' ? (
                <>
                  <button
                    onClick={handleUnregisterPhone}
                    disabled={phoneLoading}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                  <button
                    onClick={() => setShowPhoneSettings(true)}
                    className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowPhoneSettings(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Connect Phone Number
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Time Period</label>
              <select
                value={filter.period}
                onChange={(e) => setFilter({ ...filter, period: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="1d">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Outcome</label>
              <select
                value={filter.outcome}
                onChange={(e) => setFilter({ ...filter, outcome: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="all">All Outcomes</option>
                <option value="reservation_created">Reservations Created</option>
                <option value="information_only">Information Only</option>
                <option value="error">Errors</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Language</label>
              <select
                value={filter.language}
                onChange={(e) => setFilter({ ...filter, language: e.target.value })}
                className="px-3 py-2 bg-background border border-border rounded-lg text-foreground"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Calls */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold text-foreground">{stats.overview.total_calls}</p>
                </div>
              </div>
            </div>

            {/* Successful Bookings */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reservations</p>
                  <p className="text-2xl font-bold text-foreground">{stats.overview.successful_bookings}</p>
                </div>
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-foreground">{stats.overview.success_rate}%</p>
                </div>
              </div>
            </div>

            {/* Average Duration */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Duration</p>
                  <p className="text-2xl font-bold text-foreground">{stats.overview.average_duration_formatted}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call History Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Call History</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Time</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Duration</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Language</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Outcome</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conversations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No calls found for the selected filters
                    </td>
                  </tr>
                ) : (
                  conversations.map((conv) => (
                    <tr key={conv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">{formatDate(conv.started_at)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          {conv.customer_name ? (
                            <>
                              <p className="text-sm font-medium text-foreground">{conv.customer_name}</p>
                              <p className="text-xs text-muted-foreground">{conv.caller_phone}</p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">{conv.caller_phone || 'Unknown'}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">
                            {conv.duration_seconds ? `${Math.floor(conv.duration_seconds / 60)}m ${conv.duration_seconds % 60}s` : 'In progress'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-foreground uppercase">{conv.language}</span>
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
                          className="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-sm font-medium transition-colors"
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

        {/* Phone Settings Modal */}
        {showPhoneSettings && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl border border-border shadow-2xl max-w-md w-full">
              <div className="p-6 border-b border-border">
                <h2 className="text-xl font-semibold text-foreground">Connect Phone Number</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your Twilio phone number to receive customer calls
                </p>
              </div>

              <form onSubmit={handleRegisterPhone} className="p-6 space-y-4">
                {phoneError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{phoneError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+1234567890"
                    value={phoneForm.twilio_phone_number}
                    onChange={(e) => setPhoneForm({ ...phoneForm, twilio_phone_number: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">E.164 format (e.g., +1234567890)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Twilio Account SID
                  </label>
                  <input
                    type="text"
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={phoneForm.twilio_account_sid}
                    onChange={(e) => setPhoneForm({ ...phoneForm, twilio_account_sid: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Twilio Auth Token
                  </label>
                  <input
                    type="password"
                    placeholder="Your Twilio Auth Token"
                    value={phoneForm.twilio_auth_token}
                    onChange={(e) => setPhoneForm({ ...phoneForm, twilio_auth_token: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    Find your Account SID and Auth Token in the{' '}
                    <a
                      href="https://console.twilio.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Twilio Console
                    </a>
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhoneSettings(false);
                      setPhoneError(null);
                      setPhoneForm({ twilio_account_sid: '', twilio_auth_token: '', twilio_phone_number: '' });
                    }}
                    className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={phoneLoading}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {phoneLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect Phone'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Conversation Detail Modal */}
        {selectedConversation && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl border border-border shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Conversation Details</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(selectedConversation.started_at)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Summary */}
                {selectedConversation.summary && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">Summary</h3>
                        <p className="text-sm text-muted-foreground">{selectedConversation.summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Outcome</p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getOutcomeColor(selectedConversation.outcome)}`}>
                      {getOutcomeLabel(selectedConversation.outcome)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {selectedConversation.duration_seconds ? `${Math.floor(selectedConversation.duration_seconds / 60)}m ${selectedConversation.duration_seconds % 60}s` : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Language</p>
                    <p className="text-sm font-medium text-foreground mt-1 uppercase">{selectedConversation.language}</p>
                  </div>
                  {selectedConversation.reservation_id && (
                    <div>
                      <p className="text-sm text-muted-foreground">Reservation ID</p>
                      <p className="text-sm font-medium text-foreground mt-1">{selectedConversation.reservation_id}</p>
                    </div>
                  )}
                </div>

                {/* Tools Used */}
                {selectedConversation.tools_used && selectedConversation.tools_used.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Tools Used</h3>
                    <div className="space-y-2">
                      {selectedConversation.tools_used.map((tool, idx) => (
                        <div key={idx} className="bg-muted/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">{tool.tool_name}</span>
                            {tool.success ? (
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
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
                    <h3 className="font-semibold text-foreground mb-3">Transcript</h3>
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
                          <p className="text-xs text-muted-foreground mb-1">
                            {message.role === 'user' ? 'Customer' : 'Agent'}
                          </p>
                          <p className="text-sm text-foreground">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {selectedConversation.errors_encountered && selectedConversation.errors_encountered.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3 text-red-600 dark:text-red-400">Errors Encountered</h3>
                    <div className="space-y-2">
                      {selectedConversation.errors_encountered.map((error: any, idx: number) => (
                        <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                          <p className="text-sm font-medium text-foreground">{error.error_type}</p>
                          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-card border-t border-border p-4">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
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
