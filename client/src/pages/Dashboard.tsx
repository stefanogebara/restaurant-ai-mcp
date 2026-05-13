/**
 * Unified Dashboard - Nordic Clean Design
 *
 * Layout:
 *   Header (title, date, controls)
 *   Metrics Row (4 metrics with border-bottom, gap-12)
 *   Reservations Table (upcoming)
 *   Grid 12 cols: Floor Plan (7) + Waitlist/Active (5)
 *   Additional widgets below
 *
 * All panels are extracted into standalone components.
 * Sidebar (DashboardLayout) is completely unchanged.
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import { useCompleteService } from '../hooks/useCompleteService';
import { usePlanInfo } from '../hooks/useSubscription';
import DashboardLayout from '../components/layout/DashboardLayout';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import WaitlistPanel from '../components/host/WaitlistPanel';
import ManagerNotesPanel from '../components/dashboard/ManagerNotesPanel';
import StaffingForecastWidget from '../components/dashboard/StaffingForecastWidget';
import RevenueStatsWidget from '../components/dashboard/RevenueStatsWidget';
import RevenueByPartySizeWidget from '../components/dashboard/RevenueByPartySizeWidget';
import ProactiveCommsPanel from '../components/dashboard/ProactiveCommsPanel';
// ActivityFeedWidget removed — dead feature
// FeedbackWidget removed — dead feature
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
import { LS_FIRST_RESERVATION_TRACKED, LS_LAUNCH_CHECKLIST_DONE } from '../config/localStorageKeys';
import LaunchChecklistModal from '../components/dashboard/LaunchChecklistModal';
import { useToast } from '../contexts/ToastContext';
import { formatLocalDate, todayLocalISO } from '../utils/timeFormatting';

function maybeTrackFirstReservation() {
  if (!localStorage.getItem(LS_FIRST_RESERVATION_TRACKED)) {
    trackFirstReservationCreated();
    localStorage.setItem(LS_FIRST_RESERVATION_TRACKED, '1');
  }
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('pageTitles.dashboard'));
  const { success } = useToast();
  const navigate = useNavigate();

  // Launch checklist: show after first subscription
  const [showLaunchChecklist, setShowLaunchChecklist] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('launch') === '1' && !localStorage.getItem(LS_LAUNCH_CHECKLIST_DONE);
  });

  // Show a one-time welcome toast when arriving from demo conversion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('converted') === 'demo') {
      success(t('dashboard.welcomeFromDemo'));
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('launch') === '1') {
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
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [editReservation, setEditReservation] = useState<UpcomingReservation | null>(null);
  const [cancelReservation, setCancelReservation] = useState<UpcomingReservation | null>(null);
  const [showInsightsWidgets, setShowInsightsWidgets] = useState(false);

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
  const restaurantSlug: string = dashboardData?.data?.slug || '';

  // Local timezone — see todayLocalISO docs. Anti-pattern toISOString().split('T')[0]
  // gave hosts in São Paulo at 23:00 tomorrow's date, hiding actual-today reservations.
  const today = todayLocalISO();
  const tomorrow = formatLocalDate(new Date(Date.now() + 86400000));
  // Day+2..Day+7 so a restaurant sees any booking made up to a week ahead.
  // Before: anything past tomorrow was invisible on the dashboard — caught
  // by an E2E that booked 2 days out and had the reservation vanish.
  const weekEnd = formatLocalDate(new Date(Date.now() + 7 * 86400000));
  const todayReservations = reservations.filter((r) => r.date === today);
  const tomorrowReservations = reservations.filter((r) => r.date === tomorrow);
  const weekReservations = reservations.filter((r) => r.date > tomorrow && r.date <= weekEnd);

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

  // ---- Short date for header ----

  // ---- Computed metrics ----
  const waitlistCount = rawStats.waitlist_count || 0;
  const guestsExpected = todayReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);

  // ---- Progressive disclosure: detect if dashboard is mostly empty (new user) ----
  const hasReservations = todayReservations.length > 0 || tomorrowReservations.length > 0;
  const hasActiveParties = activeParties.length > 0;
  const isDashboardEmpty = !hasReservations && !hasActiveParties && waitlistCount === 0;

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
      <div className="dashboard min-h-screen bg-white px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-24 sm:pb-20">
        <div className="max-w-[1240px]">

          {/* ---- Payment Failure Banner ---- */}
          {subStatus === 'past_due' && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-6 sm:mb-8">
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-6 sm:mb-8">
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
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-8 sm:mb-14 mt-14 sm:mt-0 gap-3 sm:gap-4">
            <div className="pl-12 lg:pl-0">
              <h1 className="font-sans text-xl sm:text-2xl font-semibold tracking-tight text-deep-charcoal">
                {t('dashboard.overview')}
              </h1>
              <p className="text-[12px] sm:text-[13px] text-muted-stone font-mono uppercase tracking-widest mt-1">
                {fullDateStr}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 pl-12 lg:pl-0">
              <button
                onClick={() => navigate('/host-dashboard/reports')}
                className="px-3 sm:px-4 py-2 border border-border-gray rounded-lg text-[12px] sm:text-[13px] font-medium bg-transparent hover:bg-soft-gray transition-colors text-deep-charcoal"
              >
                {t('dashboard.reports', 'Reports')}
              </button>
              <button
                onClick={() => setShowWalkInModal(true)}
                className="hidden sm:inline-flex px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white border border-burgundy rounded-lg text-[13px] font-medium transition-colors"
              >
                {t('dashboard.addWalkIn')}
              </button>
            </div>
          </header>

          {/* ---- Metrics Row ---- */}
          {isLoading ? (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-12 mb-8 sm:mb-12 pb-8 sm:pb-12 border-b border-border-gray">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="h-7 w-16 bg-border-gray rounded animate-pulse mb-3" />
                  <div className="h-3 w-20 bg-border-gray rounded animate-pulse" />
                </div>
              ))}
            </section>
          ) : (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-12 mb-8 sm:mb-12 pb-8 sm:pb-12 border-b border-border-gray">
              {/* Reservations */}
              <div>
                <p className="font-mono text-[22px] sm:text-[28px] font-medium leading-none text-deep-charcoal">{todayReservations.length}</p>
                <p className="text-[12px] uppercase tracking-[0.05em] text-muted-stone mt-3">
                  {t('dashboard.stats.reservations', 'Reservations')}
                </p>
              </div>
              {/* Guests Expected */}
              <div>
                <p className="font-mono text-[22px] sm:text-[28px] font-medium leading-none text-deep-charcoal">{guestsExpected}</p>
                <p className="text-[12px] uppercase tracking-[0.05em] text-muted-stone mt-3">
                  {t('dashboard.stats.guests', 'Guests')}
                </p>
              </div>
              {/* Capacity */}
              <div>
                <p className="font-mono text-[22px] sm:text-[28px] font-medium leading-none text-deep-charcoal">
                  {occupiedTables}/{totalTables}
                </p>
                <p className="text-[12px] uppercase tracking-[0.05em] text-muted-stone mt-3">
                  {t('dashboard.stats.capacity', 'Tables Available')}
                </p>
              </div>
              {/* Waitlist */}
              <div>
                <p className="font-mono text-[22px] sm:text-[28px] font-medium leading-none text-deep-charcoal">{waitlistCount}</p>
                <p className="text-[12px] uppercase tracking-[0.05em] text-muted-stone mt-3">
                  {t('waitlist.title', 'Waitlist')}
                </p>
              </div>
            </section>
          )}

          {/* ---- Welcome Guide for New Users ---- */}
          {isDashboardEmpty && !isLoading && (
            <div className="bg-[#FFF7ED] border border-amber-200 rounded-xl px-4 sm:px-6 py-4 sm:py-5 mb-8 sm:mb-12">
              <h3 className="text-sm font-semibold text-amber-900 mb-1">
                {t('dashboard.welcomeGuide.title', 'Your dashboard is ready!')}
              </h3>
              <p className="text-sm text-amber-800">
                {t('dashboard.welcomeGuide.description', 'Reservations, waitlist, and activity will appear here as your restaurant starts receiving guests. Add a walk-in or create a reservation to get started.')}
              </p>
            </div>
          )}

          {/* ---- Reservations Section ---- */}
          <section className="mb-8 sm:mb-16">
            <ReservationsList
              todayReservations={todayReservations}
              tomorrowReservations={tomorrowReservations}
              weekReservations={weekReservations}
              onCheckIn={handleCheckIn}
              onIntervention={(r) => setInterventionReservation(r)}
              onAdd={() => setShowAddReservation(true)}
              onEdit={(r) => setEditReservation(r)}
              onCancel={(r) => setCancelReservation(r)}
              avgSpendPerCover={avgSpendPerCover}
              byPartySize={revenueStats?.by_party_size}
              isLoading={isLoading}
              language={i18n.language === 'es' ? 'es' : 'en'}
              tables={tables}
            />
          </section>

          {/* ---- Two-Column Split: Floor Plan (col-span-7) + Waitlist/Active (col-span-5) ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-16">
            {/* Left: Floor Plan / Table Layout */}
            <section className="lg:col-span-7">
              <TableLayoutPanel
                tables={tables}
                activeParties={activeParties}
                onRefresh={refetch}
                isLoading={isLoading}
              />
            </section>

            {/* Right: Waitlist + Active Parties */}
            <section className="lg:col-span-5 space-y-14">
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
          <div className="border-t border-border-gray mt-10 sm:mt-16 mb-8 sm:mb-12" />

          {/* ---- Additional Widgets (progressive disclosure for new users) ---- */}
          {isDashboardEmpty && !showInsightsWidgets ? (
            <div className="text-center py-6">
              <button
                type="button"
                onClick={() => setShowInsightsWidgets(true)}
                className="text-sm text-muted-stone hover:text-deep-charcoal transition-colors inline-flex items-center gap-2"
              >
                <ThiingsIcon name="chevron-down" pxSize={14} />
                {t('dashboard.showInsights', 'Show analytics & insights')}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                <ManagerNotesPanel />
                <RevenueByPartySizeWidget />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
                <StaffingForecastWidget />
                <RevenueStatsWidget />
              </div>
              <div className="mt-6 sm:mt-8">
                <ProactiveCommsPanel />
              </div>
            </>
          )}

        </div>

        {/* ---- FAB: Add Walk-in ---- */}
        <button
          onClick={() => setShowWalkInModal(true)}
          aria-label={t('dashboard.addWalkIn', 'Add walk-in')}
          className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-burgundy hover:bg-burgundy-dark active:scale-95 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
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
          language={i18n.language === 'es' ? 'es' : 'en'}
        />
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

      {showLaunchChecklist && (
        <LaunchChecklistModal
          bookingSlug={restaurantSlug}
          onDismiss={() => setShowLaunchChecklist(false)}
        />
      )}

    </DashboardLayout>
  );
}
