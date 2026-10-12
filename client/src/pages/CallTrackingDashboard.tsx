/**
 * Call Tracking Dashboard
 *
 * Orchestrator page — manages state and data fetching.
 * UI is delegated to focused subcomponents in components/call-tracking/.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import { SkeletonCallTracking } from '../components/common/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

import { toCsv, downloadCsv } from '../utils/exportCsv';
import { todayLocalISO } from '../utils/timeFormatting';
import ThiingsIcon from '../components/common/ThiingsIcon';
import CallPhoneStatusCard from '../components/call-tracking/CallPhoneStatusCard';
import CallFilters from '../components/call-tracking/CallFilters';
import CallStatsOverview from '../components/call-tracking/CallStatsOverview';
import CallConversationList from '../components/call-tracking/CallConversationList';
import CallConversationModal from '../components/call-tracking/CallConversationModal';
import GuestProfilePanel from '../components/call-tracking/GuestProfilePanel';

import {
  CALLS_PAGE_SIZE,
  useCallConversations,
  useCallStats,
  usePhoneStatus,
  useConversationDetail,
} from '../hooks/useCallTracking';

import type { CallFilter } from '../components/call-tracking/callTrackingTypes';

export default function CallTrackingDashboard() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<CallFilter>({ period: '7d', outcome: 'all', language: 'all' });
  const [page, setPage] = useState(0);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [guestProfilePhone, setGuestProfilePhone] = useState<string | null>(null);

  const { info: toastInfo } = useToast();
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

  const { data: convsResult, isLoading, isError, isFetching: isFetchingConversations, refetch: refetchConversations } = useCallConversations(filter, restaurant_id, page);
  const { data: stats, isError: statsError, refetch: refetchStats } = useCallStats(filter, restaurant_id);
  const phoneStatusQuery = usePhoneStatus(restaurant_id);
  const { data: selectedConversation } = useConversationDetail(selectedConversationId);

  const conversations = convsResult?.conversations ?? [];
  const pagination = convsResult?.pagination;
  const changeFilter = useCallback((next: CallFilter) => {
    setPage(0);
    setFilter(next);
  }, []);
  const refreshAll = () => {
    void refetchConversations();
    void refetchStats();
    void phoneStatusQuery.refetch();
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
              onClick={refreshAll}
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
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={refreshAll}
                className="px-4 py-2 border border-glass-border-dark bg-white/50 backdrop-blur-glass-chip text-stone-gray hover:border-deep-charcoal hover:bg-white/80 rounded-full text-[13px] font-medium transition-colors"
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
                  downloadCsv(`calls-${todayLocalISO()}-page-${page + 1}.csv`, toCsv(rows, columns));
                }}
                disabled={!conversations.length}
                title={!conversations.length ? t('callTracking.noCallsToExport', 'No calls to export') : ''}
                className={`px-4 py-2 border border-glass-border-dark bg-white/50 backdrop-blur-glass-chip rounded-full text-[13px] font-medium transition-colors ${
                  conversations.length ? 'text-stone-gray hover:bg-white/80 hover:border-deep-charcoal' : 'text-muted-stone cursor-not-allowed opacity-40'
                }`}
              >
                {t('callTracking.exportPage')}
              </button>
            </div>
          </div>

          <CallPhoneStatusCard
            phoneStatus={phoneStatusQuery.data ?? null}
            phoneStatusLoading={phoneStatusQuery.isLoading}
            phoneStatusError={phoneStatusQuery.isError}
            onRefreshStatus={() => { phoneStatusQuery.refetch(); toastInfo(t('callTracking.refreshingStatus')); }}
          />

          <CallFilters filter={filter} onChange={changeFilter} />

          {stats && <CallStatsOverview stats={stats} />}
          {statsError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 border-y border-red-200 py-4 text-sm text-red-700">
              <span>{t('callTracking.statsUnavailable')}</span>
              <button type="button" onClick={() => void refetchStats()} className="font-semibold underline underline-offset-2">
                {t('common.retry')}
              </button>
            </div>
          )}

          {isLoading ? (
            <div role="status" className="py-12 text-center text-sm text-stone-gray">{t('common.loading')}</div>
          ) : (
            <>
              <CallConversationList
                conversations={conversations}
                filter={filter}
                onOutcomeChange={(outcome) => changeFilter({ ...filter, outcome })}
                onConversationClick={(id) => setSelectedConversationId(id)}
                onPhoneClick={(phone) => setGuestProfilePhone(phone)}
              />
              {pagination && pagination.total > CALLS_PAGE_SIZE && (
                <nav aria-label={t('callTracking.pages')} className="flex flex-wrap items-center justify-between gap-3 border-t border-glass-border-dark pt-4">
                  <span className="text-xs text-muted-stone">
                    {t('callTracking.showingCalls', {
                      from: pagination.offset + 1,
                      to: Math.min(pagination.offset + conversations.length, pagination.total),
                      total: pagination.total,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" disabled={page === 0 || isFetchingConversations} onClick={() => setPage(p => Math.max(0, p - 1))} className="liquid-capsule px-4 py-2 text-xs text-deep-charcoal disabled:opacity-40">{t('common.back')}</button>
                    <button type="button" disabled={!pagination.has_more || isFetchingConversations} onClick={() => setPage(p => p + 1)} className="liquid-capsule px-4 py-2 text-xs text-deep-charcoal disabled:opacity-40">{t('common.next')}</button>
                  </div>
                </nav>
              )}
            </>
          )}

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

        </div>
      </div>
    </DashboardLayout>
  );
}
