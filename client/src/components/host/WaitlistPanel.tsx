import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WAITLIST_POLL_INTERVAL } from '../../config/constants';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import ThiingsIcon from '../common/ThiingsIcon';
import WaitlistEntryCard from './WaitlistEntryCard';
import AddToWaitlistModal from './AddToWaitlistModal';
import type { WaitlistEntry, WaitlistResponse } from './waitlistHelpers';

interface WaitlistPanelProps {
  onSeatNow: (entry: WaitlistEntry) => void;
  restaurantId?: string;
}

export default function WaitlistPanel({ onSeatNow, restaurantId }: WaitlistPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'seated' | 'removed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);

  useRealtimeSubscription('waitlist', restaurantId);

  const { data, isLoading, error } = useQuery<WaitlistResponse>({
    queryKey: ['waitlist', 'all'],
    queryFn: async () => {
      const response = await authFetch('/api/waitlist');
      if (!response.ok) throw new Error('Failed to fetch waitlist');
      return response.json();
    },
    refetchInterval: WAITLIST_POLL_INTERVAL,
  });

  const notifyMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await authFetch(`/api/waitlist?id=${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Notified' }),
      });
      if (!response.ok) throw new Error('Failed to notify customer');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await authFetch(`/api/waitlist?id=${entryId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to remove from waitlist');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const waitlist = data?.waitlist || [];
  const activeCount = waitlist.filter(e => ['Waiting', 'Notified'].includes(e.status)).length;
  const seatedCount = waitlist.filter(e => e.status === 'Seated').length;
  const removedCount = waitlist.filter(e => ['Cancelled', 'No Show'].includes(e.status)).length;

  const filteredWaitlist = useMemo(() => {
    let filtered = waitlist;
    switch (activeTab) {
      case 'active': filtered = filtered.filter(e => ['Waiting', 'Notified'].includes(e.status)); break;
      case 'seated': filtered = filtered.filter(e => e.status === 'Seated'); break;
      case 'removed': filtered = filtered.filter(e => ['Cancelled', 'No Show'].includes(e.status)); break;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.customer_name?.toLowerCase().includes(query) ||
        e.customer_phone?.includes(query)
      );
    }
    return filtered;
  }, [waitlist, activeTab, searchQuery]);

  const tableReadyEntries = filteredWaitlist.filter(e => e.status === 'Notified');
  const waitingEntries = filteredWaitlist.filter(e => e.status === 'Waiting');

  if (isLoading) {
    return (
      <div className="p-5" role="status">
        <span className="sr-only">{t('waitlist.loading')}</span>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 bg-border-gray rounded animate-pulse" />
          <div className="h-8 w-24 bg-border-gray rounded-lg animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 bg-soft-gray rounded-xl">
              <div className="h-4 w-32 bg-border-gray rounded animate-pulse mb-2" />
              <div className="h-3 w-20 bg-soft-gray rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
          {t('common.errorLoadingData', 'Could not load waitlist. Please refresh to try again.')}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-warm-divider">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#8C8C8C]">{t('waitlist.title')}</h2>
            <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl shadow-sm shadow-burgundy/20 transition-all"
          >
            + {t('waitlist.addGuest')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-0.5 bg-soft-gray rounded-lg p-0.5" role="tablist" aria-label="Waitlist status filter">
            {[
              { key: 'active', label: t('waitlist.tabActive'), count: activeCount },
              { key: 'seated', label: t('waitlist.tabSeated'), count: seatedCount },
              { key: 'removed', label: t('waitlist.tabRemoved'), count: removedCount }
            ].map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-deep-charcoal shadow-sm'
                    : 'text-stone-gray hover:text-deep-charcoal'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                  activeTab === tab.key ? 'bg-burgundy/10 text-burgundy' : 'bg-border-gray text-stone-gray'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[120px] max-w-[200px]">
            <ThiingsIcon name="search" pxSize={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-stone" />
            <input
              type="text"
              placeholder={t('common.searchPlaceholder', 'Search...')}
              aria-label="Search waitlist"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-soft-gray border border-border-gray rounded-xl text-xs focus:ring-2 focus:ring-burgundy focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* Waitlist Entries */}
      <div className="overflow-y-auto flex-1">
        {filteredWaitlist.length === 0 ? (
          <div className="py-10 px-6 text-center text-stone-gray">
            <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
              <ThiingsIcon name="clipboard-list" pxSize={20} className="text-muted-stone" />
            </div>
            <div className="font-medium">
              {activeTab === 'active' && t('waitlist.noActive')}
              {activeTab === 'seated' && t('waitlist.noSeated')}
              {activeTab === 'removed' && t('waitlist.noRemoved')}
            </div>
            {activeTab === 'active' && (
              <div className="text-sm text-muted-stone">{t('waitlist.addGuestHint')}</div>
            )}
          </div>
        ) : activeTab === 'active' ? (
          <>
            {tableReadyEntries.length > 0 && (
              <div className="mb-2">
                <div className="px-4 py-2 bg-green-600/10 border-l-4 border-green-600">
                  <span className="text-xs font-bold text-green-600 uppercase tracking-wide">
                    {t('waitlist.tableReady')} ({tableReadyEntries.length})
                  </span>
                </div>
                {tableReadyEntries.map(entry => (
                  <WaitlistEntryCard
                    key={entry.id}
                    entry={entry}
                    isTableReady
                    onNotify={(id) => notifyMutation.mutate(id)}
                    onRemove={(id) => setConfirmRemove({ id, name: entry.customer_name || 'Guest' })}
                    onSeatNow={onSeatNow}
                    isNotifying={notifyMutation.isPending}
                    isRemoving={removeMutation.isPending}
                  />
                ))}
              </div>
            )}

            {waitingEntries.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-soft-gray border-l-4 border-stone-gray">
                  <span className="text-xs font-bold text-stone-gray uppercase tracking-wide">
                    {t('waitlist.waiting')} ({waitingEntries.length})
                  </span>
                </div>
                {waitingEntries.map(entry => (
                  <WaitlistEntryCard
                    key={entry.id}
                    entry={entry}
                    onNotify={(id) => notifyMutation.mutate(id)}
                    onRemove={(id) => setConfirmRemove({ id, name: entry.customer_name || 'Guest' })}
                    onSeatNow={onSeatNow}
                    isNotifying={notifyMutation.isPending}
                    isRemoving={removeMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          filteredWaitlist.map(entry => (
            <WaitlistEntryCard
              key={entry.id}
              entry={entry}
              onNotify={(id) => notifyMutation.mutate(id)}
              onRemove={(id) => setConfirmRemove({ id, name: entry.customer_name || 'Guest' })}
              onSeatNow={onSeatNow}
              isNotifying={notifyMutation.isPending}
              isRemoving={removeMutation.isPending}
              showActions={false}
            />
          ))
        )}
      </div>

      {showAddModal && (
        <AddToWaitlistModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ['waitlist'] });
          }}
        />
      )}

      {confirmRemove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('waitlist.removeFromWaitlist')}</h3>
            <p className="text-sm text-stone-gray mb-6">
              Remove <span className="font-semibold text-deep-charcoal">{confirmRemove.name}</span> from the waitlist?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  removeMutation.mutate(confirmRemove.id);
                  setConfirmRemove(null);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
              >
                {t('waitlist.remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
