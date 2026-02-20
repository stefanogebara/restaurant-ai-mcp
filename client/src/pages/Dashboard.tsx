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
import { useQuery } from '@tanstack/react-query';
import { hostAPI, authFetch } from '../services/api';
import { usePlanInfo } from '../hooks/useSubscription';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatsBar from '../components/dashboard/StatsBar';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import WaitlistPanel from '../components/host/WaitlistPanel';
import ManagerNotesPanel from '../components/dashboard/ManagerNotesPanel';
import WhatsAppStatsCard from '../components/dashboard/WhatsAppStatsCard';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import QuickInterventionModal from '../components/host/QuickInterventionModal';
import type { UpcomingReservation, ActiveParty, Table, SeatPartyRequest } from '../types/host.types';

export default function Dashboard() {
  // ---- Modal state ----
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<SeatPartyRequest | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const [interventionReservation, setInterventionReservation] = useState<UpcomingReservation | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [serviceToComplete, setServiceToComplete] = useState<ActiveParty | null>(null);

  // ---- Data fetching ----
  const { data: dashboardData, refetch, isLoading, isError } = useQuery({
    queryKey: ['hostDashboard'],
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

  const occupiedTables = tables.filter((t: Table) => t.status === 'Occupied').length;
  const totalTables = tables.length;
  const totalGuests = activeParties.reduce((sum, p) => sum + (p.party_size || 0), 0);
  const availableTables = tables.filter((t: Table) => t.status === 'Available');

  // ---- Handlers ----
  const handleWalkInSuccess = (partyData: SeatPartyRequest) => {
    setSelectedParty(partyData);
    setShowWalkInModal(false);
    setShowSeatModal(true);
  };

  const handleCheckIn = (reservation: UpcomingReservation) => {
    setSelectedReservation(reservation);
    setShowCheckInModal(true);
  };

  const handleCheckInSuccess = (reservationData: UpcomingReservation) => {
    setSelectedReservation(reservationData);
    setShowCheckInModal(false);
    setShowSeatModal(true);
  };

  const handleCompleteService = (party: ActiveParty) => {
    setServiceToComplete(party);
    setShowCompleteModal(true);
  };

  const confirmCompleteService = async () => {
    if (!serviceToComplete) return;
    try {
      const response = await authFetch('/api/host-dashboard?action=complete-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_record_id: serviceToComplete.service_id }),
      });
      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Error completing service:', error);
    } finally {
      setShowCompleteModal(false);
      setServiceToComplete(null);
    }
  };

  const handleSeatFromWaitlist = (entry: { id: string; customer_name: string; customer_phone: string; party_size: number; special_requests?: string }) => {
    setSelectedParty({
      type: 'walk-in',
      customer_name: entry.customer_name,
      customer_phone: entry.customer_phone,
      party_size: entry.party_size,
      special_requests: entry.special_requests,
      table_ids: [],
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
            <h3 className="text-lg font-bold text-red-900 mb-2">Error loading data</h3>
            <p className="text-sm text-red-700 mb-4">Could not connect to the server. Please try again.</p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard min-h-screen bg-[#F5F5F4] p-4 sm:p-6 md:p-8 lg:px-10 lg:py-8 pb-28 sm:pb-20">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* ---- Header ---- */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pl-12 sm:pl-0">
            <h1 className="text-2xl font-bold text-[#1C1917] tracking-tight">
              Dashboard <span className="font-light text-[#78716C]">/ {dayName}, {dateStr}</span>
            </h1>

            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-[#78716C] bg-white border border-[#E7E5E4] px-4 py-2 rounded-[10px] hidden sm:inline-block">
                Week view
              </span>
              <button
                onClick={() => {
                  if (!dashboardData?.data) return;
                  const rows = [['Name', 'Date', 'Time', 'Party Size', 'Status', 'Phone']];
                  reservations.forEach(r => {
                    rows.push([r.customer_name, r.date, r.time, String(r.party_size), r.status || '', r.customer_phone || '']);
                  });
                  const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `reservations-${today}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#D6D3D1] text-[#57534E] hover:border-[#A8A29E] rounded-[10px] text-[13px] font-medium transition-colors"
              >
                Export
              </button>
              <button
                onClick={() => setShowWalkInModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-[10px] text-[13px] font-medium transition-colors"
              >
                + Walk-in
              </button>
            </div>
          </div>

          {/* ---- Trial Banner ---- */}
          {isTrial && isActive && trialDaysLeft !== null && (
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
              trialDaysLeft <= 3
                ? 'bg-red-50 border-red-200'
                : 'bg-[#FFF7ED] border-[#FDBA74]'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  trialDaysLeft <= 3 ? 'bg-red-100' : 'bg-[#FDBA74]/30'
                }`}>
                  <svg className={`w-4 h-4 ${trialDaysLeft <= 3 ? 'text-red-600' : 'text-[#EA580C]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${trialDaysLeft <= 3 ? 'text-red-900' : 'text-[#9A3412]'}`}>
                    Free Trial {trialDaysLeft === 0 ? 'expires today' : `\u2014 ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`}
                  </p>
                  <p className={`text-xs ${trialDaysLeft <= 3 ? 'text-red-700' : 'text-[#C2410C]'}`}>
                    Upgrade to keep all features after your trial ends.
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.location.href = '/#pricing'}
                className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
              >
                View Plans
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
              <div className="bg-white border border-[#E7E5E4] rounded-2xl flex flex-col overflow-hidden">
                <WaitlistPanel onSeatNow={handleSeatFromWaitlist} />
              </div>

              <ActivePartiesPanel
                parties={activeParties}
                onCompleteService={handleCompleteService}
                isLoading={isLoading}
              />

              <ManagerNotesPanel language="en" />
              <WhatsAppStatsCard />
            </div>
          </div>
        </div>

        {/* ---- FAB: Add Walk-in ---- */}
        <button
          onClick={() => setShowWalkInModal(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-[#1C1917] hover:bg-[#292524] hover:scale-105 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
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
          <div role="dialog" aria-modal="true" aria-label="Complete Service" className="bg-white rounded-2xl shadow-2xl border border-[#E7E5E4] p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[#1C1917] mb-2">Complete Service</h3>
            <p className="text-sm text-[#57534E] mb-6">
              Complete service for <span className="font-semibold">{serviceToComplete.customer_name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCompleteModal(false); setServiceToComplete(null); }}
                className="flex-1 px-4 py-2.5 border border-[#E7E5E4] text-[#57534E] rounded-xl hover:bg-[#F5F5F4] transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmCompleteService}
                className="flex-1 px-4 py-2.5 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
