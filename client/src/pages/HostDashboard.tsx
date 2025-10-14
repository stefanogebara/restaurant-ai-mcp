import { useState } from 'react';
import { useHostDashboard } from '../hooks/useHostDashboard';
import { useToast } from '../contexts/ToastContext';
import TableGrid from '../components/host/TableGrid';
import ActivePartiesList from '../components/host/ActivePartiesList';
import UpcomingReservations from '../components/host/UpcomingReservations';
import DashboardStats from '../components/host/DashboardStats';
import WalkInModal from '../components/host/WalkInModal';
import CheckInModal from '../components/host/CheckInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import TableStatusLegend from '../components/host/TableStatusLegend';
import type { UpcomingReservation } from '../types/host.types';

export default function HostDashboard() {
  const { data, isLoading, error, refetch } = useHostDashboard();
  const { success } = useToast();
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [checkInReservation, setCheckInReservation] = useState<UpcomingReservation | null>(null);
  const [seatPartyData, setSeatPartyData] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-xl text-gray-400">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="bg-[#1E1E1E] rounded-2xl p-8 border border-red-500/30 max-w-md">
          <div className="text-6xl mb-4 text-center">⚠️</div>
          <div className="text-xl text-red-400 mb-6 text-center font-semibold">Error loading dashboard</div>
          <button
            onClick={() => refetch()}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="text-xl text-gray-400">No data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="bg-[#1A1A1A] border-b border-gray-800 sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Host Dashboard</h1>
              <p className="text-gray-400 text-sm">Manage your restaurant floor in real-time</p>
            </div>
            <button
              onClick={() => setIsWalkInModalOpen(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:-translate-y-0.5 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Walk-in
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <DashboardStats summary={data.summary} />
      </div>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table Grid - 60% width on desktop */}
          <div className="lg:col-span-2">
            <div className="bg-[#1E1E1E] rounded-2xl shadow-2xl p-8 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Table Layout</h2>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Click any table to manage</span>
                  <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="mb-6">
                <TableStatusLegend />
              </div>
              <TableGrid tables={data.tables} />
            </div>
          </div>

          {/* Right Panel - 40% width on desktop */}
          <div className="space-y-6">
            {/* Active Parties */}
            <div className="bg-[#1E1E1E] rounded-2xl shadow-2xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Active Parties</h2>
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-semibold">
                  {data.active_parties.length}
                </span>
              </div>
              <ActivePartiesList parties={data.active_parties} />
            </div>

            {/* Upcoming Reservations */}
            <div className="bg-[#1E1E1E] rounded-2xl shadow-2xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Upcoming Reservations</h2>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold">
                  {data.upcoming_reservations.length}
                </span>
              </div>
              <UpcomingReservations
                reservations={data.upcoming_reservations}
                onCheckIn={(reservation) => setCheckInReservation(reservation)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <WalkInModal
        isOpen={isWalkInModalOpen}
        onClose={() => setIsWalkInModalOpen(false)}
        onSuccess={(data) => {
          setSeatPartyData(data);
          setIsWalkInModalOpen(false);
        }}
      />

      <CheckInModal
        isOpen={checkInReservation !== null}
        reservation={checkInReservation}
        onClose={() => setCheckInReservation(null)}
        onSuccess={(data) => {
          setSeatPartyData(data);
          setCheckInReservation(null);
        }}
      />

      <SeatPartyModal
        isOpen={seatPartyData !== null}
        data={seatPartyData}
        onClose={() => {
          setSeatPartyData(null);
          success('Party seated successfully!');
        }}
      />
    </div>
  );
}
