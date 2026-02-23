/**
 * Unified Dashboard - Clean, modular replacement for SimpleDashboard
 *
 * Layout:
 *   Header (date, controls)
 *   Stats Row (4 key metrics)
 *   Two-column main:
 *     Left (wider): Table Layout + Reservations
 *     Right (narrower): Waitlist + Active Parties
 *   FAB: Add Walk-in
 *
 * All panels are extracted into standalone components.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hostAPI, authFetch } from '../services/api';
import { usePlanInfo } from '../hooks/useSubscription';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatsBar from '../components/dashboard/StatsBar';
import ReferralWidget from '../components/dashboard/ReferralWidget';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import WaitlistPanel from '../components/host/WaitlistPanel';
import ManagerNotesPanel from '../components/dashboard/ManagerNotesPanel';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import QuickInterventionModal from '../components/host/QuickInterventionModal';
import type { UpcomingReservation, ActiveParty } from '../types/host.types';
import { trackFirstReservationCreated } from '../lib/analytics';

function maybeTrackFirstReservation() {
  if (!localStorage.getItem('seatable_first_reservation_tracked')) {
    trackFirstReservationCreated();
    localStorage.setItem('seatable_first_reservation_tracked', '1');
  }
}

export default function Dashboard() {
  const { t } = useTranslation();
  // ---- Modal state ----
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const [interventionReservation, setInterventionReservation] = useState<any>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [serviceToComplete, setServiceToComplete] = useState<ActiveParty | null>(null);

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

  const occupiedTables = tables.filter((t: any) => t.status === 'Occupied').length;
  const totalTables = tables.length;
  const totalGuests = activeParties.reduce((sum, p) => sum + (p.party_size || 0), 0);
  const availableTables = tables.filter((t: any) => t.status === 'Available');

  // ---- Handlers ----
  const handleWalkInSuccess = (partyData: any) => {
    maybeTrackFirstReservation();
    setSelectedParty(partyData);
    setShowWalkInModal(false);
    setShowSeatModal(true);
  };

  const handleCheckIn = (reservation: UpcomingReservation) => {
    setSelectedReservation(reservation);
    setShowCheckInModal(true);
  };

  const handleCheckInSuccess = (reservationData: any) => {
    setSelectedReservation(reservationData);
    setShowCheckInModal(false);
    setShowSeatModal(true);
  };

  const handleCompleteService = async (party: ActiveParty) => {
    try {
      const response = await authFetch('/api/host-dashboard?action=complete-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_record_id: party.service_id }),
      });
      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Error completing service:', error);
    }
  };

  const handleSeatFromWaitlist = (entry: any) => {
    setSelectedParty({
      customer_name: entry.customer_name,
      customer_phone: entry.customer_phone,
      party_size: entry.party_size,
      special_requests: entry.special_requests,
      waitlist_entry_id: entry.id,
    });
    setShowSeatModal(true);
  };

  // ---- Subscription / trial ----
  const { isTrial, trialEnd, isActive } = usePlanInfo();

  const trialDaysLeft = useMemo(() => {
    if (!isTrial || !trialEnd) return null;
    const end = new Date(trialEnd);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [isTrial, trialEnd]);

  // ---- Date display ----
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  // ---- Error state ----
  if (isError && !isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
      <div className="dashboard min-h-screen bg-soft-gray p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8 pb-28 sm:pb-20">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* ---- Header ---- */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              {t('navigation.dashboard')} <span className="font-light text-warm-stone">/ {dayName}, {dateStr}</span>
            </h1>

            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-warm-stone bg-white border border-border-gray px-4 py-2 rounded-[10px] hidden sm:inline-block">
                {t('dashboard.weekView')}
              </span>
              <button
                onClick={() => window.location.href = '/host-dashboard/calls'}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 text-stone-gray hover:border-muted-stone rounded-[10px] text-[13px] font-medium transition-colors"
              >
                {t('common.export')}
              </button>
              <button
                onClick={() => setShowWalkInModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white rounded-[10px] text-[13px] font-medium transition-colors"
              >
                {t('dashboard.addWalkIn')}
              </button>
            </div>
          </div>

          {/* ---- Trial Banner ---- */}
          {isTrial && isActive && trialDaysLeft !== null && (
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
              trialDaysLeft <= 3
                ? 'bg-red-50 border-red-200'
                : 'bg-orange-50 border-orange-300'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  trialDaysLeft <= 3 ? 'bg-red-100' : 'bg-orange-300/30'
                }`}>
                  <svg className={`w-4 h-4 ${trialDaysLeft <= 3 ? 'text-red-600' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${trialDaysLeft <= 3 ? 'text-red-900' : 'text-orange-800'}`}>
                    {t('dashboard.freeTrial')} {trialDaysLeft === 0 ? t('dashboard.trialExpiresToday') : `\u2014 ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`}
                  </p>
                  <p className={`text-xs ${trialDaysLeft <= 3 ? 'text-red-700' : 'text-orange-700'}`}>
                    {t('dashboard.trialUpgradeHint')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.location.href = '/#pricing'}
                className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
              >
                {t('dashboard.viewPlans')}
              </button>
            </div>
          )}

          {/* ---- Stats Row ---- */}
          <StatsBar
            occupiedTables={occupiedTables}
            totalTables={totalTables}
            reservationsToday={todayReservations.length}
            seatedReservations={todayReservations.filter((r) => r.checked_in).length}
            waitlistCount={rawStats.waitlist_count || 0}
            estimatedWaitTime={rawStats.estimated_wait_time}
            activeParties={activeParties.length}
            totalGuests={totalGuests}
            isLoading={isLoading}
          />

          {/* ---- Referral Widget ---- */}
          <ReferralWidget />

          {/* ---- Main Content: 2-column layout ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            {/* Left Column: Tables + Reservations */}
            <div className="space-y-4">
              <TableLayoutPanel
                tables={tables}
                activeParties={activeParties}
                onRefresh={refetch}
                isLoading={isLoading}
              />

              <ReservationsList
                todayReservations={todayReservations}
                tomorrowReservations={tomorrowReservations}
                onCheckIn={handleCheckIn}
                onIntervention={(r) => setInterventionReservation(r)}
                isLoading={isLoading}
              />
            </div>

            {/* Right Column: Waitlist + Active Parties */}
            <div className="space-y-4">
              <div className="bg-white border border-border-gray rounded-2xl flex flex-col overflow-hidden">
                <WaitlistPanel onSeatNow={handleSeatFromWaitlist} />
              </div>

              <ActivePartiesPanel
                parties={activeParties}
                onCompleteService={handleCompleteService}
                isLoading={isLoading}
              />

              <ManagerNotesPanel language="en" />
            </div>
          </div>
        </div>

        {/* ---- FAB: Add Walk-in ---- */}
        <button
          onClick={() => setShowWalkInModal(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-deep-charcoal hover:bg-charcoal-dark hover:scale-105 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
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
          data={selectedParty || selectedReservation}
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
          <div className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">{t('dashboard.completeService')}</h3>
            <p className="text-sm text-stone-gray mb-6">
              Complete service for <span className="font-semibold">{serviceToComplete.customer_name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCompleteModal(false); setServiceToComplete(null); }}
                className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  handleCompleteService(serviceToComplete);
                  setShowCompleteModal(false);
                  setServiceToComplete(null);
                }}
                className="flex-1 px-4 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors"
              >
                {t('dashboard.complete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
