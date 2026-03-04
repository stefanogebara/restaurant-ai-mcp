import { useState } from 'react';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import StatsBar from '../components/dashboard/StatsBar';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import DemoWaitlistPanel from '../components/demo/DemoWaitlistPanel';
import DemoManagerChat from '../components/demo/DemoManagerChat';
import { useDemoState } from '../hooks/useDemoState';
import type { UpcomingReservation, ActiveParty } from '../types/host.types';

export default function DemoDashboard() {
  const demo = useDemoState();

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Walk-in form state
  const [walkInForm, setWalkInForm] = useState({
    customer_name: '',
    customer_phone: '',
    party_size: '',
  });

  const dayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

  // ---- Handlers ----
  const handleCheckIn = (reservation: UpcomingReservation) => {
    // Find an available table that fits
    const available = demo.tables.find(
      (t) => t.status === 'Available' && t.capacity >= reservation.party_size,
    );
    if (available) {
      demo.seatParty({
        customer_name: reservation.customer_name,
        party_size: reservation.party_size,
        tableId: available.id,
        reservationId: reservation.reservation_id,
      });
    } else {
      demo.checkIn(reservation.reservation_id);
    }
  };

  const handleCompleteService = (party: ActiveParty) => {
    demo.completeService(party.service_id);
  };

  const handleSeatFromWaitlist = (waitlistId: string) => {
    demo.seatFromWaitlist(waitlistId);
  };

  const handleWalkInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = demo.addWalkIn({
      customer_name: walkInForm.customer_name,
      customer_phone: walkInForm.customer_phone,
      party_size: parseInt(walkInForm.party_size) || 2,
    });
    if (success) {
      setWalkInForm({ customer_name: '', customer_phone: '', party_size: '' });
      setShowWalkInModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-gray">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-burgundy to-burgundy-dark text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <ThiingsIcon name="sparkles" pxSize={12} className="text-white" />
            </div>
            <p className="text-sm font-medium">
              Demo Interativa &mdash; todas as acoes sao locais, nenhum dado real e afetado
            </p>
          </div>
          <Link
            to="/"
            className="text-xs font-semibold text-white/80 hover:text-white underline underline-offset-2 transition-colors"
          >
            Voltar ao inicio
          </Link>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
              La Bella Vista
              <span className="ml-2 text-base font-light text-warm-stone">
                &mdash; Italiano &middot; Centro
              </span>
            </h1>
            <p className="text-sm text-muted-stone mt-0.5">{dayName}, {dateStr}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowWalkInModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white rounded-xl text-[13px] font-medium transition-colors"
            >
              <ThiingsIcon name="plus" pxSize={14} />
              Adicionar Walk-In
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <StatsBar
          occupiedTables={demo.stats.occupiedTables}
          totalTables={demo.stats.totalTables}
          reservationsToday={demo.stats.reservationsToday}
          seatedReservations={demo.stats.seatedReservations}
          waitlistCount={demo.stats.waitlistCount}
          activeParties={demo.stats.activeParties}
          totalGuests={demo.stats.totalGuests}
          isLoading={false}
        />

        {/* Main Content: 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Left Column: Reservations */}
          <div className="space-y-6">
            <ReservationsList
              todayReservations={demo.todayReservations}
              tomorrowReservations={demo.tomorrowReservations}
              onCheckIn={handleCheckIn}
              onIntervention={() => {}}
              isLoading={false}
            />
          </div>

          {/* Right Column: Waitlist + Active Parties */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            <DemoWaitlistPanel
              entries={demo.waitlist}
              onSeat={handleSeatFromWaitlist}
            />

            <ActivePartiesPanel
              parties={demo.activeParties}
              onCompleteService={handleCompleteService}
              isLoading={false}
            />

            {/* Upgrade CTA */}
            <div className="bg-deep-charcoal rounded-2xl p-6 text-center">
              <h3 className="text-base font-semibold text-white mb-1 tracking-tight">
                Pronto para comecar?
              </h3>
              <p className="text-xs text-muted-stone font-light mb-4">
                Configure seu restaurante em menos de 5 minutos.
              </p>
              <Link
                to="/login"
                className="inline-block px-5 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
              >
                Comecar Gratis
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAB: Add Walk-in */}
      <button
        type="button"
        onClick={() => setShowWalkInModal(true)}
        aria-label="Adicionar walk-in"
        className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-deep-charcoal hover:bg-charcoal-dark hover:scale-105 active:scale-95 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
      >
        <ThiingsIcon name="plus" pxSize={24} />
      </button>

      {/* FAB: Manager AI Chat */}
      <button
        type="button"
        onClick={() => setChatOpen((prev) => !prev)}
        aria-label="Abrir Assistente IA"
        className="fixed bottom-20 sm:bottom-6 right-20 sm:right-24 z-40 w-14 h-14 bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
      >
        <ThiingsIcon name="chat" pxSize={22} />
      </button>

      {/* Manager Chat Panel */}
      {chatOpen && (
        <DemoManagerChat
          occupiedTables={demo.stats.occupiedTables}
          totalTables={demo.stats.totalTables}
          activeParties={demo.stats.activeParties}
          waitlistCount={demo.stats.waitlistCount}
          reservationsToday={demo.stats.reservationsToday}
          totalGuests={demo.stats.totalGuests}
          onClose={() => setChatOpen(false)}
        />
      )}

      {/* Walk-In Modal */}
      {showWalkInModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWalkInModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Adicionar cliente walk-in"
            className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-md w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-deep-charcoal">Adicionar Walk-In</h2>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
              >
                <ThiingsIcon name="close" pxSize={16} />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  Nome do Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={walkInForm.customer_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, customer_name: e.target.value })}
                  placeholder="ex. Maria Silva"
                  className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={walkInForm.customer_phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, customer_phone: e.target.value })}
                  placeholder="+55 11 99999-0000"
                  className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  Tamanho do Grupo *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="20"
                  value={walkInForm.party_size}
                  onChange={(e) => setWalkInForm({ ...walkInForm, party_size: e.target.value })}
                  placeholder="2"
                  className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="flex-1 px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-burgundy text-white font-medium rounded-xl hover:bg-burgundy-dark transition-colors"
                >
                  Sentar Cliente
                </button>
              </div>

              {demo.tables.filter((t) => t.status === 'Available').length === 0 && (
                <p className="text-xs text-amber-600 text-center">
                  Nenhuma mesa disponivel. Considere adicionar a lista de espera.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
