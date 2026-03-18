/**
 * Unified Dashboard - Warm Editorial Design
 *
 * Layout:
 *   Header (greeting, date, controls)
 *   Metrics Row (4 inline metrics with vertical dividers)
 *   Section Divider
 *   Reservations Table (upcoming)
 *   Section Divider
 *   Two-column split (60/40):
 *     Left: Table Layout
 *     Right: Waitlist + Active Parties
 *   Additional widgets below
 *
 * All panels are extracted into standalone components.
 * Sidebar (DashboardLayout) is completely unchanged.
 */

import { useState, useMemo, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import { useCompleteService } from '../hooks/useCompleteService';
import { usePlanInfo } from '../hooks/useSubscription';
import { useAuth } from '../contexts/AuthContext';
import { useRestaurantSettings } from '../hooks/useRestaurantSettings';
import DashboardLayout from '../components/layout/DashboardLayout';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import WaitlistPanel from '../components/host/WaitlistPanel';
import ManagerNotesPanel from '../components/dashboard/ManagerNotesPanel';
import StaffingForecastWidget from '../components/dashboard/StaffingForecastWidget';
import RevenueStatsWidget from '../components/dashboard/RevenueStatsWidget';
import RevenueByPartySizeWidget from '../components/dashboard/RevenueByPartySizeWidget';
import ActivityFeedWidget from '../components/dashboard/ActivityFeedWidget';
import FeedbackWidget from '../components/dashboard/FeedbackWidget';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import QuickInterventionModal from '../components/host/QuickInterventionModal';
import AddReservationModal from '../components/host/AddReservationModal';
import EditReservationModal from '../components/host/EditReservationModal';
import CancelReservationDialog from '../components/host/CancelReservationDialog';
import type { UpcomingReservation, ActiveParty, SeatModalData } from '../types/host.types';
import { trackFirstReservationCreated } from '../lib/analytics';
import { useRevenueStats } from '../hooks/useRevenueStats';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { LS_FIRST_RESERVATION_TRACKED } from '../config/localStorageKeys';
import { useToast } from '../contexts/ToastContext';

function maybeTrackFirstReservation() {
  if (!localStorage.getItem(LS_FIRST_RESERVATION_TRACKED)) {
    trackFirstReservationCreated();
    localStorage.setItem(LS_FIRST_RESERVATION_TRACKED, '1');
  }
}

function getTimeGreeting(t: (key: string, fallback: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t('dashboard.goodMorning', 'Good morning');
  if (hour < 17) return t('dashboard.goodAfternoon', 'Good afternoon');
  return t('dashboard.goodEvening', 'Good evening');
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('pageTitles.dashboard'));
  const { success } = useToast();
  const { user } = useAuth();
  const { data: restaurantSettings } = useRestaurantSettings();

  // Show a one-time welcome toast when arriving from demo conversion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('converted') === 'demo') {
      success(t('dashboard.welcomeFromDemo'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Modal state ----
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<SeatModalData | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const [interventionReservation, setInterventionReservation] = useState<UpcomingReservation | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [serviceToComplete, setServiceToComplete] = useState<ActiveParty | null>(null);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [editReservation, setEditReservation] = useState<UpcomingReservation | null>(null);
  const [cancelReservation, setCancelReservation] = useState<UpcomingReservation | null>(null);

  // ---- Data fetching ----
  const { data: dashboardData, refetch, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 30000,
  });

  // ---- Data extraction ----
  const rawStats = dashboardData?.data?.summary || {};
  const tables = dashboardData?.data?.tables || [];
  const reservations: UpcomingReservation[] = dashboardData?.data?.upcoming_reservations || [];
  const activeParties: ActiveParty[] = dashboardData?.data?.active_parties || [];

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const todayReservations = reservations.filter((r) => r.date === today);
  const tomorrowReservations = reservations.filter((r) => r.date === tomorrow);

  // Revenue stats (used by ReservationsList for per-reservation predictions)
  const { data: revenueStats } = useRevenueStats();
  const avgSpendPerCover = revenueStats?.avg_spend_per_cover;

  const occupiedTables = tables.filter((t: { status: string }) => t.status === 'Occupied').length;
  const totalTables = tables.length;
  const availableTables = tables.filter((t: { status: string }) => t.status === 'Available');

  // ---- Mutations ----
  const completeService = useCompleteService();

  // ---- Handlers ----
  const handleWalkInSuccess = (partyData: SeatModalData) => {
    maybeTrackFirstReservation();
    setSelectedParty(partyData);
    setShowWalkInModal(false);
    setShowSeatModal(true);
  };

  const handleCheckIn = (reservation: UpcomingReservation) => {
    setSelectedReservation(reservation);
    setShowCheckInModal(true);
  };

  const handleCheckInSuccess = (reservationData: SeatModalData) => {
    setSelectedReservation(reservationData as unknown as UpcomingReservation);
    setShowCheckInModal(false);
    setShowSeatModal(true);
  };

  const handleCompleteService = (party: ActiveParty, totalBill?: number) => {
    completeService.mutate({ serviceRecordId: party.service_id, totalBill });
  };

  const handleSeatFromWaitlist = (entry: { customer_name: string; customer_phone: string; party_size: number; special_requests?: string; id: string }) => {
    setSelectedParty({
      type: 'waitlist',
      customer_name: entry.customer_name,
      customer_phone: entry.customer_phone,
      party_size: entry.party_size,
      table_ids: [],
      special_requests: entry.special_requests,
      waitlist_entry_id: entry.id,
    });
    setShowSeatModal(true);
  };

  // ---- Subscription / trial ----
  const { isTrial, trialEnd, isActive, status: subStatus } = usePlanInfo();

  const trialDaysLeft = useMemo(() => {
    if (!isTrial || !trialEnd) return null;
    const end = new Date(trialEnd);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [isTrial, trialEnd]);

  // ---- Date display ----
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const fullDateStr = new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' });

  // ---- Greeting ----
  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    || user?.email?.split('@')[0]
    || '';
  const restaurantName = restaurantSettings?.restaurant_name || '';
  const greeting = getTimeGreeting(t);

  // ---- Computed metrics ----
  const waitlistCount = rawStats.waitlist_count || 0;
  const guestsExpected = todayReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);

  // ---- Error state ----
  if (isError && !isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-red-900 mb-2">{t('dashboard.errorTitle')}</h3>
            <p className="text-sm text-red-700 mb-4">{t('errors.serverError')}</p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard min-h-screen bg-warm-bg p-6 sm:p-8 md:p-12 pb-28 sm:pb-12">
        <div className="max-w-[1220px] mx-auto">

          {/* ---- Payment Failure Banner ---- */}
          {subStatus === 'past_due' && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3.5 flex items-center justify-between gap-3 mb-8">
              <p className="text-sm text-red-800 flex-1 min-w-0">
                <span className="font-semibold">{t('dashboard.paymentFailed', 'Payment failed')}</span>
                {' — '}
                {t('dashboard.paymentFailedHint', 'Please update your payment method to keep your subscription active.')}
              </p>
              <a
                href="/subscription/manage"
                className="text-sm font-semibold text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-4 py-1.5 rounded-xl whitespace-nowrap transition-colors"
              >
                {t('dashboard.updatePayment', 'Update Payment')}
              </a>
            </div>
          )}

          {/* ---- Trial Banner ---- */}
          {isTrial && isActive && trialDaysLeft !== null && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-3 mb-8">
              <p className="text-sm text-amber-800 flex-1 min-w-0">
                <span className="font-semibold">{t('dashboard.freeTrial')}</span>
                {' — '}
                {trialDaysLeft === 0 ? t('dashboard.trialExpiresToday') : t('dashboard.trialDaysRemaining', { count: trialDaysLeft })}
                {'. '}
                {t('dashboard.trialUpgradeHint')}
              </p>
              <a
                href="/subscription/manage"
                className="text-sm font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap transition-colors"
              >
                {t('dashboard.viewPlans')}
              </a>
            </div>
          )}

          {/* ---- Header Section ---- */}
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-16 mt-14 sm:mt-0 gap-4">
            <div className="pl-12 lg:pl-0">
              <h1 className="font-serif text-[32px] leading-tight mb-2">
                {greeting}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-[#8C8C8C] text-sm font-medium uppercase tracking-wide">
                {fullDateStr}{restaurantName ? ` \u00B7 ${restaurantName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={() => window.location.href = '/host-dashboard/reports'}
                className="text-sm font-medium text-[#1A1A1A] hover:underline underline-offset-4 decoration-warm-divider"
              >
                {t('dashboard.reports', 'Export')}
              </button>
              <button
                onClick={() => setShowWalkInModal(true)}
                className="bg-accent-burgundy text-white px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              >
                + {t('dashboard.addWalkIn')}
              </button>
            </div>
          </header>

          {/* ---- Metrics Row ---- */}
          {isLoading ? (
            <section className="grid grid-cols-2 sm:grid-cols-4 items-center mb-16">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`${i < 3 ? 'pr-8 border-r border-warm-divider' : 'pl-8'} ${i > 0 && i < 3 ? 'px-8' : ''}`}>
                  <div className="h-3 w-20 bg-warm-divider rounded animate-pulse mb-3" />
                  <div className="h-10 w-16 bg-warm-divider rounded animate-pulse" />
                </div>
              ))}
            </section>
          ) : (
            <section className="grid grid-cols-2 sm:grid-cols-4 items-center mb-16">
              {/* Reservations */}
              <div className="pr-8 border-r border-warm-divider">
                <p className="text-[#8C8C8C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">
                  {t('dashboard.stats.reservations', 'Reservations')}
                </p>
                <p className="font-mono text-4xl text-[#1A1A1A]">{todayReservations.length}</p>
              </div>
              {/* Guests Expected */}
              <div className="px-8 border-r border-warm-divider">
                <p className="text-[#8C8C8C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">
                  {t('dashboard.stats.guests', 'Guests Expected')}
                </p>
                <p className="font-mono text-4xl text-[#1A1A1A]">{guestsExpected}</p>
              </div>
              {/* Capacity */}
              <div className="px-8 border-r border-warm-divider">
                <p className="text-[#8C8C8C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">
                  {t('dashboard.stats.capacity', 'Capacity')}
                </p>
                <p className="font-mono text-4xl text-[#1A1A1A]">
                  {occupiedTables}/{totalTables}{' '}
                  <span className="text-xl text-[#8C8C8C]">{t('dashboard.stats.tables', 'tables')}</span>
                </p>
              </div>
              {/* Waitlist */}
              <div className="pl-8">
                <p className="text-[#8C8C8C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">
                  {t('waitlist.title', 'Waitlist')}
                </p>
                <p className="font-mono text-4xl text-[#1A1A1A]">{waitlistCount}</p>
              </div>
            </section>
          )}

          {/* ---- Section Divider ---- */}
          <div className="border-t border-warm-divider mt-12 mb-12" />

          {/* ---- Reservations Section ---- */}
          <section className="mb-20">
            <ReservationsList
              todayReservations={todayReservations}
              tomorrowReservations={tomorrowReservations}
              onCheckIn={handleCheckIn}
              onIntervention={(r) => setInterventionReservation(r)}
              onAdd={() => setShowAddReservation(true)}
              onEdit={(r) => setEditReservation(r)}
              onCancel={(r) => setCancelReservation(r)}
              avgSpendPerCover={avgSpendPerCover}
              byPartySize={revenueStats?.by_party_size}
              isLoading={isLoading}
              language={i18n.language as 'en' | 'es' | 'pt-BR'}
            />
          </section>

          {/* ---- Section Divider ---- */}
          <div className="border-t border-warm-divider mt-12 mb-12" />

          {/* ---- Two-Column Split: Floor Plan (60%) + Waitlist/Active (40%) ---- */}
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
            {/* Left: Floor Plan / Table Layout */}
            <section className="w-full lg:w-[60%]">
              <TableLayoutPanel
                tables={tables}
                activeParties={activeParties}
                onRefresh={refetch}
                isLoading={isLoading}
              />
            </section>

            {/* Right: Waitlist + Active Parties */}
            <section className="w-full lg:w-[40%] space-y-12">
              <div>
                <WaitlistPanel onSeatNow={handleSeatFromWaitlist} />
              </div>

              <ActivePartiesPanel
                parties={activeParties}
                onCompleteService={handleCompleteService}
                isLoading={isLoading}
              />
            </section>
          </div>

          {/* ---- Section Divider ---- */}
          <div className="border-t border-warm-divider mt-12 mb-12" />

          {/* ---- Additional Widgets ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ManagerNotesPanel />
            <FeedbackWidget />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <StaffingForecastWidget />
            <RevenueStatsWidget />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <RevenueByPartySizeWidget />
            <ActivityFeedWidget />
          </div>

        </div>

        {/* ---- FAB: Add Walk-in ---- */}
        <button
          onClick={() => setShowWalkInModal(true)}
          aria-label={t('dashboard.addWalkIn', 'Add walk-in')}
          className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-accent-burgundy hover:opacity-90 active:scale-95 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
        >
          <ThiingsIcon name="plus" pxSize={24} />
        </button>

      </div>

      {/* ---- Modals ---- */}
      {showWalkInModal && (
        <WalkInModal
          isOpen={showWalkInModal}
          onClose={() => setShowWalkInModal(false)}
          onSuccess={handleWalkInSuccess}
          availableTables={availableTables}
        />
      )}

      {showCheckInModal && selectedReservation && (
        <CheckInModal
          isOpen={showCheckInModal}
          reservation={selectedReservation}
          onClose={() => {
            setShowCheckInModal(false);
            setSelectedReservation(null);
          }}
          onSuccess={handleCheckInSuccess}
          availableTables={availableTables}
        />
      )}

      {showSeatModal && (selectedParty || selectedReservation) && (
        <SeatPartyModal
          isOpen={showSeatModal}
          data={(selectedParty || selectedReservation) as SeatModalData | null}
          onClose={() => {
            setShowSeatModal(false);
            setSelectedParty(null);
            setSelectedReservation(null);
            refetch();
          }}
        />
      )}

      {interventionReservation && (
        <QuickInterventionModal
          reservation={interventionReservation}
          isOpen={!!interventionReservation}
          onClose={() => setInterventionReservation(null)}
          onSuccess={() => {
            setInterventionReservation(null);
            refetch();
          }}
          language="en"
        />
      )}

      {/* Complete Service Confirmation */}
      {showCompleteModal && serviceToComplete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-warm-divider p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{t('dashboard.completeService')}</h3>
            <p className="text-sm text-[#8C8C8C] mb-6">
              {t('dashboard.completeServiceFor', { name: serviceToComplete.customer_name })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCompleteModal(false); setServiceToComplete(null); }}
                className="flex-1 px-4 py-2.5 border border-warm-divider text-[#8C8C8C] rounded-xl hover:bg-warm-hover transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  handleCompleteService(serviceToComplete);
                  setShowCompleteModal(false);
                  setServiceToComplete(null);
                }}
                className="flex-1 px-4 py-2.5 bg-accent-burgundy hover:opacity-90 text-white font-semibold rounded-xl transition-opacity"
              >
                {t('dashboard.complete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddReservation && (
        <AddReservationModal
          isOpen={showAddReservation}
          onClose={() => setShowAddReservation(false)}
        />
      )}

      {editReservation && (
        <EditReservationModal
          isOpen={!!editReservation}
          reservation={editReservation}
          onClose={() => setEditReservation(null)}
        />
      )}

      {cancelReservation && (
        <CancelReservationDialog
          isOpen={!!cancelReservation}
          reservation={cancelReservation}
          onClose={() => setCancelReservation(null)}
        />
      )}

    </DashboardLayout>
  );
}
