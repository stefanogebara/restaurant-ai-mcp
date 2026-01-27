import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatTimeAgo } from '../../utils/timeFormatting';
import WaitlistTimeDisplay from './WaitlistTimeDisplay';

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

// Search icon SVG component
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

// Parse special requests into tags
function getTags(specialRequests?: string): string[] {
  if (!specialRequests) return [];
  return specialRequests.split(',').map(t => t.trim()).filter(Boolean);
}

// Status badge color helper
function getStatusColor(status: string) {
  switch (status) {
    case 'Waiting': return 'bg-[#9F1239]/10 text-[#9F1239]';
    case 'Notified': return 'bg-[#d97706]/10 text-[#d97706]';
    case 'Seated': return 'bg-[#16a34a]/10 text-[#16a34a]';
    case 'Cancelled': return 'bg-red-500/10 text-red-500';
    case 'No Show': return 'bg-[#57534E]/10 text-[#57534E]';
    default: return 'bg-[#57534E]/10 text-[#57534E]';
  }
}

export default function WaitlistPanel({ onSeatNow }: WaitlistPanelProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'seated' | 'removed'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all waitlist entries (we'll filter client-side)
  const { data, isLoading, error } = useQuery<WaitlistResponse>({
    queryKey: ['waitlist', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/waitlist');
      if (!response.ok) throw new Error('Failed to fetch waitlist');
      return response.json();
    },
    refetchInterval: 30000,
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

  // Calculate counts for each tab
  const activeCount = waitlist.filter(e => ['Waiting', 'Notified'].includes(e.status)).length;
  const seatedCount = waitlist.filter(e => e.status === 'Seated').length;
  const removedCount = waitlist.filter(e => ['Cancelled', 'No Show'].includes(e.status)).length;

  // Filter waitlist based on tab and search
  const filteredWaitlist = useMemo(() => {
    let filtered = waitlist;

    // Tab filtering
    switch (activeTab) {
      case 'active':
        filtered = filtered.filter(e => ['Waiting', 'Notified'].includes(e.status));
        break;
      case 'seated':
        filtered = filtered.filter(e => e.status === 'Seated');
        break;
      case 'removed':
        filtered = filtered.filter(e => ['Cancelled', 'No Show'].includes(e.status));
        break;
    }

    // Search filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.customer_name?.toLowerCase().includes(query) ||
        e.customer_phone?.includes(query)
      );
    }

    return filtered;
  }, [waitlist, activeTab, searchQuery]);

  // Group entries for active tab
  const tableReadyEntries = filteredWaitlist.filter(e => e.status === 'Notified');
  const waitingEntries = filteredWaitlist.filter(e => e.status === 'Waiting');

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-[#57534E]">Loading waitlist...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error loading waitlist: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-[#E7E5E4]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[#9F1239]/10 rounded-lg">
              <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#1C1917]">Waitlist</h2>
            <span className="px-2 py-0.5 bg-[#9F1239]/10 text-[#9F1239] rounded-lg text-xs font-bold">
              {activeCount}
            </span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-semibold rounded-lg transition-all"
          >
            + Add Guest
          </button>
        </div>

        {/* Status Tabs + Search in one row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-0.5 bg-[#F5F5F4] rounded-lg p-0.5">
            {[
              { key: 'active', label: 'Active', count: activeCount },
              { key: 'seated', label: 'Seated', count: seatedCount },
              { key: 'removed', label: 'Removed', count: removedCount }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-[#1C1917] shadow-sm'
                    : 'text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {tab.label}
                <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full ${
                  activeTab === tab.key ? 'bg-[#9F1239]/10 text-[#9F1239]' : 'bg-[#E7E5E4] text-[#57534E]'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[120px] max-w-[200px]">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8A29E]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-lg text-xs focus:ring-2 focus:ring-[#9F1239] focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* Waitlist Entries */}
      <div className="overflow-y-auto flex-1">
        {filteredWaitlist.length === 0 ? (
          <div className="p-8 text-center text-[#57534E]">
            <div className="text-4xl mb-2">
              {activeTab === 'active' ? '📋' : activeTab === 'seated' ? '🍽️' : '📭'}
            </div>
            <div className="font-medium">
              {activeTab === 'active' && 'No customers waiting'}
              {activeTab === 'seated' && 'No seated customers yet'}
              {activeTab === 'removed' && 'No removed entries'}
            </div>
            {activeTab === 'active' && (
              <div className="text-sm text-[#A8A29E]">Click "+ Add Guest" to get started</div>
            )}
          </div>
        ) : activeTab === 'active' ? (
          // Grouped view for active tab
          <>
            {/* TABLE READY Section */}
            {tableReadyEntries.length > 0 && (
              <div className="mb-2">
                <div className="px-4 py-2 bg-[#16a34a]/10 border-l-4 border-[#16a34a]">
                  <span className="text-xs font-bold text-[#16a34a] uppercase tracking-wide">
                    Table Ready ({tableReadyEntries.length})
                  </span>
                </div>
                {tableReadyEntries.map(entry => (
                  <WaitlistEntryCard
                    key={entry.id}
                    entry={entry}
                    isTableReady
                    onNotify={(id) => notifyMutation.mutate(id)}
                    onRemove={(id) => {
                      if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                        removeMutation.mutate(id);
                      }
                    }}
                    onSeatNow={onSeatNow}
                    isNotifying={notifyMutation.isPending}
                    isRemoving={removeMutation.isPending}
                  />
                ))}
              </div>
            )}

            {/* WAITING Section */}
            {waitingEntries.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-[#F5F5F4] border-l-4 border-[#57534E]">
                  <span className="text-xs font-bold text-[#57534E] uppercase tracking-wide">
                    Waiting ({waitingEntries.length})
                  </span>
                </div>
                {waitingEntries.map(entry => (
                  <WaitlistEntryCard
                    key={entry.id}
                    entry={entry}
                    onNotify={(id) => notifyMutation.mutate(id)}
                    onRemove={(id) => {
                      if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                        removeMutation.mutate(id);
                      }
                    }}
                    onSeatNow={onSeatNow}
                    isNotifying={notifyMutation.isPending}
                    isRemoving={removeMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          // Regular list view for seated/removed tabs
          filteredWaitlist.map(entry => (
            <WaitlistEntryCard
              key={entry.id}
              entry={entry}
              onNotify={(id) => notifyMutation.mutate(id)}
              onRemove={(id) => {
                if (confirm(`Remove ${entry.customer_name} from waitlist?`)) {
                  removeMutation.mutate(id);
                }
              }}
              onSeatNow={onSeatNow}
              isNotifying={notifyMutation.isPending}
              isRemoving={removeMutation.isPending}
              showActions={false}
            />
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
    </>
  );
}

// Entry Card Component
interface WaitlistEntryCardProps {
  entry: WaitlistEntry;
  isTableReady?: boolean;
  onNotify: (id: string) => void;
  onRemove: (id: string) => void;
  onSeatNow: (entry: WaitlistEntry) => void;
  isNotifying: boolean;
  isRemoving: boolean;
  showActions?: boolean;
}

function WaitlistEntryCard({
  entry,
  isTableReady,
  onNotify,
  onRemove,
  onSeatNow,
  isNotifying,
  isRemoving,
  showActions = true
}: WaitlistEntryCardProps) {
  const initials = entry.customer_name
    ? entry.customer_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const tags = getTags(entry.special_requests);

  return (
    <div className={`px-3 py-2.5 border-b border-[#E7E5E4]/50 hover:bg-[#F5F5F4]/50 transition-colors ${
      isTableReady ? 'bg-[#16a34a]/5' : ''
    }`}>
      {/* Row 1: Avatar, Name, Party Size, Status */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9F1239]/20 to-[#7c3aed]/20 flex items-center justify-center font-semibold text-xs border border-[#9F1239]/30 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1C1917] text-sm truncate">{entry.customer_name || 'Guest'}</span>
            <span className="px-1.5 py-0.5 bg-[#F5F5F4] rounded text-[10px] font-medium text-[#57534E] flex-shrink-0">
              {entry.party_size}p
            </span>
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${getStatusColor(entry.status)} flex-shrink-0`}>
              {entry.status}
            </span>
          </div>
          <div className="text-[11px] text-[#57534E]">{entry.customer_phone}</div>
        </div>
      </div>

      {/* Row 2: Time Display with Progress (compact) */}
      {['Waiting', 'Notified'].includes(entry.status) && entry.added_at && entry.estimated_wait && (
        <div className="mt-1.5 ml-10">
          <WaitlistTimeDisplay addedAt={entry.added_at} estimatedWait={entry.estimated_wait} compact />
        </div>
      )}

      {/* Row 3: Tags (compact) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 ml-10">
          {tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="px-1.5 py-0.5 text-[10px] bg-[#7c3aed]/10 text-[#7c3aed] rounded">
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-[#E7E5E4] text-[#57534E] rounded">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Notified timestamp */}
      {entry.status === 'Notified' && entry.notified_at && (
        <div className="text-[10px] text-[#d97706] ml-10 mt-1">
          Notified {formatTimeAgo(entry.notified_at)}
        </div>
      )}

      {/* Row 4: Action Buttons (compact) */}
      {showActions && (
        <div className="flex items-center gap-1.5 mt-2 ml-10">
          {entry.status === 'Waiting' && (
            <>
              <button
                onClick={() => onNotify(entry.id)}
                disabled={isNotifying}
                className="px-2 py-1 text-[11px] bg-[#16a34a] hover:bg-[#15803d] text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                Ready
              </button>
              <button
                onClick={() => onSeatNow(entry)}
                className="px-2 py-1 text-[11px] bg-[#9F1239] hover:bg-[#881337] text-white font-medium rounded transition-colors"
              >
                Seat
              </button>
            </>
          )}
          {entry.status === 'Notified' && (
            <button
              onClick={() => onSeatNow(entry)}
              className="px-2 py-1 text-[11px] bg-[#9F1239] hover:bg-[#881337] text-white font-medium rounded transition-colors"
            >
              Seat Now
            </button>
          )}
          <button
            onClick={() => onRemove(entry.id)}
            disabled={isRemoving}
            className="px-2 py-1 text-[11px] border border-[#E7E5E4] text-[#57534E] hover:bg-[#F5F5F4] rounded transition-colors disabled:opacity-50 ml-auto"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// Add to Waitlist Modal Component
interface AddToWaitlistModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const TAG_PRESETS = ['High Chair', 'Outdoor', 'Birthday', 'Anniversary', 'Wheelchair', 'VIP', 'Window', 'Quiet'];

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

  const addTag = (tag: string) => {
    const current = formData.special_requests;
    const tags = current ? current.split(',').map(t => t.trim()).filter(Boolean) : [];
    if (!tags.includes(tag)) {
      const newValue = current ? `${current}, ${tag}` : tag;
      setFormData({ ...formData, special_requests: newValue });
    }
  };

  const currentTags = getTags(formData.special_requests);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E7E5E4] max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-2xl font-bold text-[#1C1917] mb-6">Add to Waitlist</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
                placeholder="+1 234 567 8900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-2">
                Party Size *
              </label>
              <select
                required
                value={formData.party_size}
                onChange={(e) => setFormData({ ...formData, party_size: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(size => (
                  <option key={size} value={size}>{size} {size === 1 ? 'guest' : 'guests'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-2">
                Tags / Special Requests
              </label>

              {/* Tag Presets */}
              <div className="flex flex-wrap gap-2 mb-3">
                {TAG_PRESETS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    disabled={currentTags.includes(tag)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      currentTags.includes(tag)
                        ? 'bg-[#7c3aed]/20 text-[#7c3aed] cursor-not-allowed'
                        : 'bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#57534E]'
                    }`}
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              {/* Selected Tags Display */}
              {currentTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {currentTags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-[#7c3aed]/10 text-[#7c3aed] rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <textarea
                value={formData.special_requests}
                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all resize-none"
                rows={2}
                placeholder="Add comma-separated tags or notes..."
              />
            </div>

            {addMutation.isError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-500">
                {(addMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-[#E7E5E4] text-[#57534E] rounded-xl hover:bg-[#F5F5F4] transition-all font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[#9F1239]/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
