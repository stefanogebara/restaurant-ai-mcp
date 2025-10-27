import { useState, useEffect } from 'react';
import { DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useHostDashboard } from '../hooks/useHostDashboard';
import { useToast } from '../contexts/ToastContext';
import TableGrid from '../components/host/TableGrid';
import ActivePartiesList from '../components/host/ActivePartiesList';
import ReservationsCalendar from '../components/host/ReservationsCalendar';
import DashboardStats from '../components/host/DashboardStats';
import WalkInModal from '../components/host/WalkInModal';
import CheckInModal from '../components/host/CheckInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import TableStatusLegend from '../components/host/TableStatusLegend';
import WaitlistPanel from '../components/host/WaitlistPanel';
import WaitlistSeatModal from '../components/host/WaitlistSeatModal';
import type { UpcomingReservation } from '../types/host.types';

export default function HostDashboard() {
  const { data, isLoading, error, refetch, isFetching } = useHostDashboard();
  const { success } = useToast();
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [checkInReservation, setCheckInReservation] = useState<UpcomingReservation | null>(null);
  const [waitlistEntry, setWaitlistEntry] = useState<any>(null);
  const [seatPartyData, setSeatPartyData] = useState<any>(null);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Update last refresh timestamp when data changes
  useEffect(() => {
    if (data && !isFetching) {
      setLastRefresh(new Date());
    }
  }, [data, isFetching]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return; // Dropped outside a drop zone

    const draggedParty = active.data.current?.party;
    const targetTable = over.data.current?.table;

    if (!draggedParty || !targetTable) return;

    // Check if table is available
    if (targetTable.status !== 'Available') {
      return; // Can't drop on occupied/reserved tables
    }

    // Open SeatPartyModal with the party data and selected table
    setSeatPartyData({
      type: 'drag-drop',
      customer_name: draggedParty.customer_name,
      party_size: draggedParty.party_size,
      special_requests: draggedParty.special_requests || '',
      table_ids: [targetTable.id],
      service_id: draggedParty.service_id, // Include existing service ID for reassignment
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-xl text-muted-foreground">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <div className="bg-card rounded-lg p-8 border border-destructive/30 max-w-md">
          <div className="text-6xl mb-4 text-center">⚠️</div>
          <div className="text-xl text-destructive mb-6 text-center font-semibold">Error loading dashboard</div>
          <button
            onClick={() => refetch()}
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all shadow-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-xl text-muted-foreground">No data available</div>
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">Host Dashboard</h1>
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground text-sm">Manage your restaurant floor in real-time</p>
                {isFetching && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                    <span>Refreshing...</span>
                  </div>
                )}
                {!isFetching && (
                  <div className="text-xs text-muted-foreground">
                    Updated {Math.floor((new Date().getTime() - lastRefresh.getTime()) / 1000)}s ago
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/analytics"
                className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground font-medium rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analytics
              </a>
              <button
                onClick={() => setIsWalkInModalOpen(true)}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Walk-in
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <DashboardStats summary={data.summary || {
          total_capacity: 0,
          available_seats: 0,
          occupied_seats: 0,
          occupancy_percentage: 0,
          active_parties: 0
        }} />
      </div>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table Grid - 60% width on desktop */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-lg shadow-lg p-8 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-foreground">Table Layout</h2>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Click any table to manage</span>
                  <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="mb-6">
                <TableStatusLegend />
              </div>
              <TableGrid tables={data.tables || []} />
            </div>
          </div>

          {/* Right Panel - 40% width on desktop */}
          <div className="space-y-6">
            {/* Active Parties */}
            <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-foreground">Active Parties</h2>
                <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-semibold">
                  {data.active_parties?.length || 0}
                </span>
              </div>
              <ActivePartiesList parties={data.active_parties || []} />
            </div>

            {/* Reservations Calendar */}
            <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-foreground">📅 Reservations Calendar</h2>
                <span className="px-3 py-1 bg-accent text-accent-foreground rounded-full text-sm font-semibold">
                  {data.upcoming_reservations?.length || 0}
                </span>
              </div>
              <ReservationsCalendar
                reservations={data.upcoming_reservations || []}
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
        availableTables={data.tables || []}
      />

      <CheckInModal
        isOpen={checkInReservation !== null}
        reservation={checkInReservation}
        onClose={() => setCheckInReservation(null)}
        onSuccess={(data) => {
          setSeatPartyData(data);
          setCheckInReservation(null);
        }}
        availableTables={data.tables || []}
      />

      <WaitlistSeatModal
        isOpen={waitlistEntry !== null}
        entry={waitlistEntry}
        onClose={() => setWaitlistEntry(null)}
        onSuccess={(data) => {
          setSeatPartyData(data);
          setWaitlistEntry(null);
        }}
      />

      <SeatPartyModal
        isOpen={seatPartyData !== null}
        data={seatPartyData}
        onClose={async () => {
          // If this was a waitlist seating, update waitlist status
          if (seatPartyData?.type === 'waitlist' && seatPartyData?.waitlist_id) {
            try {
              await fetch(`/api/waitlist?id=${seatPartyData.waitlist_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Seated' }),
              });
            } catch (error) {
              console.error('Failed to update waitlist status:', error);
            }
          }
          setSeatPartyData(null);
          success('Party seated successfully!');
          refetch(); // Refresh dashboard data
        }}
      />

      {/* Floating Waitlist Toggle Button */}
      <button
        onClick={() => setIsWaitlistOpen(!isWaitlistOpen)}
        className="fixed right-6 bottom-6 w-16 h-16 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 transition-all flex items-center justify-center z-40 hover:scale-110"
        title="Toggle Waitlist"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </button>

      {/* Waitlist Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-[500px] bg-card shadow-2xl border-l border-border transform transition-transform duration-300 ease-in-out z-50 ${isWaitlistOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Waitlist
            </h2>
            <button
              onClick={() => setIsWaitlistOpen(false)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title="Close Waitlist"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto">
            <WaitlistPanel onSeatNow={(entry) => setWaitlistEntry(entry)} />
          </div>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isWaitlistOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsWaitlistOpen(false)}
        />
      )}
      </div>
    </DndContext>
  );
}
