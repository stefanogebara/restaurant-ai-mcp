import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

export default function WaitlistPanel() {
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

  // Format time since added
  const formatTimeSince = (addedAt: string) => {
    const now = new Date();
    const added = new Date(addedAt);
    const diffMinutes = Math.floor((now.getTime() - added.getTime()) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const hours = Math.floor(diffMinutes / 60);
    return `${hours}h ${diffMinutes % 60}m ago`;
  };

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Waiting': return 'bg-blue-100 text-blue-800';
      case 'Notified': return 'bg-yellow-100 text-yellow-800';
      case 'Seated': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'No Show': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">Loading waitlist...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">Error loading waitlist: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Waitlist</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
              {waitingCount} Waiting
            </span>
            <span className="text-sm text-gray-500">
              {waitlist.length} Total
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add to Waitlist
        </button>
      </div>

      {/* Waitlist entries */}
      <div className="divide-y divide-gray-200">
        {waitlist.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <div className="font-medium">No customers on waitlist</div>
            <div className="text-sm">Click "Add to Waitlist" to get started</div>
          </div>
        ) : (
          waitlist.map((entry) => (
            <div
              key={entry.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                {/* Left side: Customer info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      {entry.priority}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{entry.customer_name}</div>
                      <div className="text-sm text-gray-500">{entry.customer_phone}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 ml-11">
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Party of {entry.party_size}</span>
                    </div>
                    <div>•</div>
                    <div className="flex items-center gap-1">
                      <span>Wait: ~{entry.estimated_wait} min</span>
                    </div>
                    <div>•</div>
                    <div className="flex items-center gap-1">
                      <span>{formatTimeSince(entry.added_at)}</span>
                    </div>
                  </div>

                  {entry.special_requests && (
                    <div className="mt-2 ml-11 text-sm text-gray-600">
                      <span className="font-medium">Note:</span> {entry.special_requests}
                    </div>
                  )}
                </div>

                {/* Right side: Status and actions */}
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(entry.status)}`}>
                    {entry.status}
                  </span>

                  <div className="flex gap-2">
                    {entry.status === 'Waiting' && (
                      <>
                        <button
                          onClick={() => notifyMutation.mutate(entry.id)}
                          disabled={notifyMutation.isPending}
                          className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                        >
                          Notify
                        </button>
                        <button
                          onClick={() => {
                            // TODO: Open seat party modal with pre-filled data from waitlist entry
                            alert('Seat Now functionality will be integrated with existing seat party flow');
                          }}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Seat Now
                        </button>
                      </>
                    )}

                    {entry.status === 'Notified' && (
                      <>
                        <div className="text-xs text-gray-500">
                          Notified {entry.notified_at && formatTimeSince(entry.notified_at)}
                        </div>
                        <button
                          onClick={() => {
                            // TODO: Open seat party modal with pre-filled data from waitlist entry
                            alert('Seat Now functionality will be integrated with existing seat party flow');
                          }}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Seat Now
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                          removeMutation.mutate(entry.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
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
    </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-xl font-semibold mb-4">Add to Waitlist</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (Optional)
              </label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Party Size *
              </label>
              <select
                required
                value={formData.party_size}
                onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(size => (
                  <option key={size} value={size}>{size} {size === 1 ? 'guest' : 'guests'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Requests (Optional)
              </label>
              <textarea
                value={formData.special_requests}
                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="High chair needed, outdoor seating preferred..."
              />
            </div>

            {addMutation.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {(addMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
