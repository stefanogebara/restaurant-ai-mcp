import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, Clock, Plus, Bell, Check, X, AlertCircle } from 'lucide-react';

interface WaitlistEntry {
  id: string;
  waitlist_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  party_size: number;
  added_at: string;
  estimated_wait: number;
  status: 'Waiting' | 'Notified' | 'Seated' | 'Cancelled' | 'No Show';
  priority: number;
  special_requests?: string;
  notified_at?: string;
}

interface WaitlistResponse {
  success: boolean;
  count: number;
  waitlist: WaitlistEntry[];
}

export default function WaitlistPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [seatEntry, setSeatEntry] = useState<WaitlistEntry | null>(null);

  // Fetch active waitlist entries
  const { data, isLoading, error } = useQuery<WaitlistResponse>({
    queryKey: ['waitlist', 'active'],
    queryFn: async () => {
      const response = await fetch('/api/waitlist?active=true');
      if (!response.ok) throw new Error('Failed to fetch waitlist');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Notify customer mutation
  const notifyMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await fetch(`/api/waitlist?id=${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Notified' }),
      });
      if (!response.ok) throw new Error('Failed to notify customer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  // Remove from waitlist mutation
  const removeMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await fetch(`/api/waitlist?id=${entryId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove from waitlist');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });

  const waitlist = data?.waitlist || [];
  const waitingCount = waitlist.filter(e => e.status === 'Waiting').length;
  const notifiedCount = waitlist.filter(e => e.status === 'Notified').length;

  // Format time since added
  const formatTimeSince = (addedAt: string) => {
    const now = new Date();
    const added = new Date(addedAt);
    const diffMinutes = Math.floor((now.getTime() - added.getTime()) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `${hours}h ${mins}m ago`;
  };

  // Calculate progress percentage for wait time visualization
  const getWaitProgress = (addedAt: string, estimatedWait: number) => {
    const now = new Date();
    const added = new Date(addedAt);
    const elapsed = Math.floor((now.getTime() - added.getTime()) / 60000);
    return Math.min((elapsed / estimatedWait) * 100, 100);
  };

  // Status badge configuration
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Waiting':
        return {
          bg: 'bg-blue-500/20',
          text: 'text-blue-400',
          border: 'border-blue-500/30',
          icon: Clock,
        };
      case 'Notified':
        return {
          bg: 'bg-yellow-500/20',
          text: 'text-yellow-400',
          border: 'border-yellow-500/30',
          icon: Bell,
        };
      case 'Seated':
        return {
          bg: 'bg-green-500/20',
          text: 'text-green-400',
          border: 'border-green-500/30',
          icon: Check,
        };
      case 'Cancelled':
        return {
          bg: 'bg-red-500/20',
          text: 'text-red-400',
          border: 'border-red-500/30',
          icon: X,
        };
      case 'No Show':
        return {
          bg: 'bg-gray-500/20',
          text: 'text-gray-400',
          border: 'border-gray-500/30',
          icon: AlertCircle,
        };
      default:
        return {
          bg: 'bg-gray-500/20',
          text: 'text-gray-400',
          border: 'border-gray-500/30',
          icon: Users,
        };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4 mx-auto"></div>
          <p className="text-gray-400">Loading waitlist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-4xl mb-4">⚠️</div>
          <p className="text-red-400">Error loading waitlist</p>
          <p className="text-gray-500 text-sm mt-2">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur-sm bg-card/95">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/host-dashboard"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="h-6 w-px bg-border"></div>
              <div>
                <h1 className="text-2xl font-bold">📋 Waitlist Management</h1>
                <p className="text-sm text-gray-400">Monitor and manage customer queue</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg shadow-primary/30 hover:shadow-primary/50"
            >
              <Plus className="w-5 h-5" />
              Add to Waitlist
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-card/50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{waitingCount}</div>
                <div className="text-sm text-gray-400">Waiting</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border">
              <div className="p-3 bg-yellow-500/20 rounded-lg">
                <Bell className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{notifiedCount}</div>
                <div className="text-sm text-gray-400">Notified</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{waitlist.length}</div>
                <div className="text-sm text-gray-400">Total Active</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <Check className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {waitlist.length > 0 ? Math.round(waitlist.reduce((sum, e) => sum + e.estimated_wait, 0) / waitlist.length) : 0}
                </div>
                <div className="text-sm text-gray-400">Avg Wait (min)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Waitlist Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {waitlist.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No customers on waitlist</h3>
            <p className="text-gray-500 mb-6">Click "Add to Waitlist" to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg"
            >
              Add First Customer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {waitlist.map((entry) => {
              const statusConfig = getStatusConfig(entry.status);
              const StatusIcon = statusConfig.icon;
              const waitProgress = getWaitProgress(entry.added_at, entry.estimated_wait);

              // Get initials
              const initials = entry.customer_name
                ? entry.customer_name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .substring(0, 2)
                : '?';

              return (
                <div
                  key={entry.id}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10"
                >
                  {/* Priority + Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-lg">
                        {entry.priority}
                      </div>
                      <div className="text-xs text-gray-500">Position</div>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                      <StatusIcon className="w-4 h-4" />
                      <span className="text-sm font-semibold">{entry.status}</span>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/40 to-blue-500/40 flex items-center justify-center text-white text-xl font-bold border-2 border-primary/30">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white truncate mb-1">
                        {entry.customer_name || 'Unknown'}
                      </h3>
                      <p className="text-sm text-gray-400 truncate">{entry.customer_phone}</p>
                      {entry.customer_email && (
                        <p className="text-xs text-gray-500 truncate">{entry.customer_email}</p>
                      )}
                    </div>
                  </div>

                  {/* Party Details */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-background/50 rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-xs">Party Size</span>
                      </div>
                      <div className="text-2xl font-bold text-white">{entry.party_size}</div>
                    </div>
                    <div className="bg-background/50 rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs">Est. Wait</span>
                      </div>
                      <div className="text-2xl font-bold text-white">{entry.estimated_wait}m</div>
                    </div>
                  </div>

                  {/* Wait Time Progress */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                      <span>Wait Progress</span>
                      <span>{Math.round(waitProgress)}%</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          waitProgress < 50 ? 'bg-green-500' : waitProgress < 80 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${waitProgress}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Added {formatTimeSince(entry.added_at)}
                    </div>
                  </div>

                  {/* Notified timestamp */}
                  {entry.status === 'Notified' && entry.notified_at && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4">
                      <div className="flex items-center gap-2 text-yellow-400 text-sm">
                        <Bell className="w-4 h-4" />
                        <span className="font-medium">Notified {formatTimeSince(entry.notified_at)}</span>
                      </div>
                    </div>
                  )}

                  {/* Special Requests */}
                  {entry.special_requests && (
                    <div className="bg-background/50 border border-border rounded-xl p-4 mb-6">
                      <div className="text-xs text-gray-400 mb-2">Special Requests</div>
                      <p className="text-sm text-gray-300 italic">"{entry.special_requests}"</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {entry.status === 'Waiting' && (
                      <>
                        <button
                          onClick={() => notifyMutation.mutate(entry.id)}
                          disabled={notifyMutation.isPending}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Bell className="w-4 h-4" />
                          Notify Customer
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSeatEntry(entry)}
                            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
                          >
                            <Check className="w-4 h-4" />
                            Seat Now
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                                removeMutation.mutate(entry.id);
                              }
                            }}
                            disabled={removeMutation.isPending}
                            className="flex items-center justify-center gap-2 px-4 py-3 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                    {entry.status === 'Notified' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSeatEntry(entry)}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Seat Now
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                              removeMutation.mutate(entry.id);
                            }
                          }}
                          disabled={removeMutation.isPending}
                          className="flex items-center justify-center gap-2 px-4 py-3 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add to Waitlist Modal */}
      {showAddModal && (
        <AddToWaitlistModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ['waitlist'] });
          }}
        />
      )}

      {/* Seat Entry Notice */}
      {seatEntry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Seat Customer</h3>
            <p className="text-gray-400 mb-6">
              Please use the Host Dashboard to complete the seating process for {seatEntry.customer_name}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSeatEntry(null)}
                className="flex-1 px-4 py-2.5 border border-border text-gray-300 rounded-xl hover:bg-background transition-all font-medium"
              >
                Cancel
              </button>
              <Link
                to="/host-dashboard"
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all text-center"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add to Waitlist Modal Component (reused from WaitlistPanel)
interface AddToWaitlistModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddToWaitlistModal({ onClose, onSuccess }: AddToWaitlistModalProps) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    party_size: '2',
    special_requests: '',
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          party_size: parseInt(data.party_size),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add to waitlist');
      }
      return response.json();
    },
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-md w-full">
        <div className="p-6">
          <h3 className="text-2xl font-bold text-white mb-6">Add to Waitlist</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Party Size *
              </label>
              <select
                required
                value={formData.party_size}
                onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(size => (
                  <option key={size} value={size}>{size} {size === 1 ? 'guest' : 'guests'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Special Requests (Optional)
              </label>
              <textarea
                value={formData.special_requests}
                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                rows={3}
                placeholder="High chair needed, outdoor seating preferred..."
              />
            </div>

            {addMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                {(addMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-border text-gray-300 rounded-xl hover:bg-background transition-all font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addMutation.isPending ? 'Adding...' : 'Add to Waitlist'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
