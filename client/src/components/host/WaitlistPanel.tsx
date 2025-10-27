import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatTimeAgo, formatWaitTime } from '../../utils/timeFormatting';

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

interface WaitlistPanelProps {
  onSeatNow: (entry: WaitlistEntry) => void;
}

export default function WaitlistPanel({ onSeatNow }: WaitlistPanelProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

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

  // Status badge color (dark theme)
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Waiting': return 'bg-blue-500/20 text-blue-400';
      case 'Notified': return 'bg-yellow-500/20 text-yellow-400';
      case 'Seated': return 'bg-green-500/20 text-green-400';
      case 'Cancelled': return 'bg-red-500/20 text-red-400';
      case 'No Show': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400">Loading waitlist...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400">Error loading waitlist: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">Waitlist</h2>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400">
              {waitingCount} Waiting
            </span>
            <span className="text-sm text-gray-400">
              {waitlist.length} Total
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50"
        >
          + Add to Waitlist
        </button>
      </div>

      {/* Waitlist entries */}
      <div className="divide-y divide-gray-700">
        {waitlist.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <div className="font-medium">No customers on waitlist</div>
            <div className="text-sm text-gray-500">Click "Add to Waitlist" to get started</div>
          </div>
        ) : (
          waitlist.map((entry) => {
            // Get initials for avatar
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
                className="px-4 py-4 hover:bg-gray-800/30 transition-colors border-b border-gray-800/50 last:border-0"
              >
                {/* Top row: Priority + Avatar + Info */}
                <div className="flex gap-3 mb-3">
                  {/* Priority badge */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 font-bold text-sm flex items-center justify-center">
                    {entry.priority}
                  </div>

                  {/* Avatar with initials */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center text-white font-semibold border border-purple-500/30">
                    {initials}
                  </div>

                  {/* Customer info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white mb-1">
                      {entry.customer_name || 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-400">
                      {entry.customer_phone}
                    </div>
                  </div>

                  {/* Status badge - aligned to top right */}
                  <div className="flex-shrink-0">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(entry.status)}`}>
                      {entry.status}
                    </span>
                  </div>
                </div>

                {/* Middle row: Party details */}
                <div className="flex items-center gap-4 text-sm text-gray-400 mb-3 ml-14">
                  <div className="flex items-center gap-1.5">
                    <span>👥</span>
                    <span className="font-medium">
                      {entry.party_size != null ? `${entry.party_size} guests` : 'Party size unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>⏱️</span>
                    <span>{formatWaitTime(entry.estimated_wait)}</span>
                  </div>
                  <div className="text-gray-500">
                    Added {formatTimeAgo(entry.added_at)}
                  </div>
                </div>

                {/* Special requests if any */}
                {entry.special_requests && (
                  <div className="text-sm text-gray-400 italic ml-14 mb-3">
                    "{entry.special_requests}"
                  </div>
                )}

                {/* Notified timestamp for notified status */}
                {entry.status === 'Notified' && entry.notified_at && (
                  <div className="text-xs text-yellow-400/80 ml-14 mb-3">
                    🔔 Notified {formatTimeAgo(entry.notified_at)}
                  </div>
                )}

                {/* Bottom row: Action buttons */}
                <div className="flex items-center gap-2 ml-14">
                  {entry.status === 'Waiting' && (
                    <>
                      <button
                        onClick={() => notifyMutation.mutate(entry.id)}
                        disabled={notifyMutation.isPending}
                        className="px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Notify customer"
                      >
                        🔔 Notify
                      </button>
                      <button
                        onClick={() => onSeatNow(entry)}
                        className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
                        title="Seat party now"
                      >
                        ✓ Seat Now
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                            removeMutation.mutate(entry.id);
                          }
                        }}
                        disabled={removeMutation.isPending}
                        className="px-4 py-2 text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove from waitlist"
                      >
                        Remove
                      </button>
                    </>
                  )}

                  {entry.status === 'Notified' && (
                    <>
                      <button
                        onClick={() => onSeatNow(entry)}
                        className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
                        title="Seat party now"
                      >
                        ✓ Seat Now
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                            removeMutation.mutate(entry.id);
                          }
                        }}
                        disabled={removeMutation.isPending}
                        className="px-4 py-2 text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove from waitlist"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
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
    </>
  );
}

// Add to Waitlist Modal Component
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
      <div className="bg-[#1E1E1E] rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full">
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
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
                className="w-full px-4 py-2.5 bg-[#0A0A0A] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
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
                className="flex-1 px-4 py-2.5 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-800 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
