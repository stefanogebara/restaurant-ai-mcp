import { useState } from 'react';
import { useHostDashboard } from '../hooks/useHostDashboard';
import TableGrid from '../components/host/TableGrid';
import ActivePartiesList from '../components/host/ActivePartiesList';
import UpcomingReservations from '../components/host/UpcomingReservations';
import DashboardStats from '../components/host/DashboardStats';
import WalkInModal from '../components/host/WalkInModal';
import CheckInModal from '../components/host/CheckInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import { UpcomingReservation } from '../types/host.types';

export default function HostDashboard() {
  const { data, isLoading, error, refetch } = useHostDashboard();
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [checkInReservation, setCheckInReservation] = useState<UpcomingReservation | null>(null);
  const [seatPartyData, setSeatPartyData] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-xl text-red-600 mb-4">Error loading dashboard</div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-gray-600">No data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Host Dashboard</h1>
            <button
              onClick={() => setIsWalkInModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              + Add Walk-in
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <DashboardStats summary={data.summary} />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 pb-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table Grid - 60% width on desktop */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Table Layout</h2>
              <TableGrid tables={data.tables} />
            </div>
          </div>

          {/* Right Panel - 40% width on desktop */}
          <div className="space-y-6">
            {/* Active Parties */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Active Parties ({data.active_parties.length})
              </h2>
              <ActivePartiesList parties={data.active_parties} />
            </div>

            {/* Upcoming Reservations */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Upcoming Reservations ({data.upcoming_reservations.length})
              </h2>
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
        onClose={() => setSeatPartyData(null)}
      />
    </div>
  );
}
