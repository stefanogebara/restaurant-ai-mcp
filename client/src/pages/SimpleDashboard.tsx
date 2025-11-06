import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/hostAPI';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';

interface SimpleDashboardProps {
  language?: 'es' | 'en';
}

export default function SimpleDashboard({ language = 'es' }: SimpleDashboardProps) {
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);

  // Fetch dashboard data
  const { data: dashboardData, refetch } = useQuery({
    queryKey: ['simpleDashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const translations = {
    es: {
      today: 'Hoy',
      tomorrow: 'Mañana',
      tablesOccupied: 'Mesas Ocupadas',
      reservationsToday: 'Reservas Hoy',
      waiting: 'Sin mesa (espera)',
      upcomingReservations: 'Próximas Reservas',
      addWalkIn: 'Añadir Walk-in',
      viewTomorrow: 'Ver Mañana',
      noReservations: 'No hay reservas',
      checkIn: 'Check In',
      table: 'Mesa',
      people: 'personas',
      allClear: 'Todo despejado',
      noUpcoming: 'No hay reservas próximas para hoy',
    },
    en: {
      today: 'Today',
      tomorrow: 'Tomorrow',
      tablesOccupied: 'Tables Occupied',
      reservationsToday: 'Reservations Today',
      waiting: 'Waiting',
      upcomingReservations: 'Upcoming Reservations',
      addWalkIn: 'Add Walk-in',
      viewTomorrow: 'View Tomorrow',
      noReservations: 'No reservations',
      checkIn: 'Check In',
      table: 'Table',
      people: 'people',
      allClear: 'All Clear',
      noUpcoming: 'No upcoming reservations today',
    },
  };

  const t = translations[language];

  // Get current day name
  const getDayName = () => {
    const days = language === 'es'
      ? ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  // Format date
  const formatDate = () => {
    const date = new Date();
    const day = date.getDate();
    const months = language === 'es'
      ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]}`;
  };

  // Format time (24h for Spanish, 12h for English)
  const formatTime = (time: string) => {
    if (language === 'es') return time; // Already in 24h format

    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const stats = dashboardData?.data || {};
  const tables = dashboardData?.data?.tables || [];
  const reservations = dashboardData?.data?.upcomingReservations || [];
  const activeParties = dashboardData?.data?.activeParties || [];

  // Filter today's reservations
  const today = new Date().toISOString().split('T')[0];
  const todayReservations = reservations.filter((r: any) => r.date === today);

  // Calculate occupied tables
  const occupiedTables = tables.filter((t: any) => t.status === 'Occupied').length;
  const totalTables = tables.length;

  const handleWalkInSuccess = (partyData: any) => {
    setSelectedParty(partyData);
    setShowWalkInModal(false);
    setShowSeatModal(true);
  };

  const handleCheckInSuccess = (reservationData: any) => {
    setSelectedReservation(reservationData);
    setShowCheckInModal(false);
    setShowSeatModal(true);
  };

  const handleSeatSuccess = () => {
    setShowSeatModal(false);
    setSelectedParty(null);
    setSelectedReservation(null);
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold text-slate-900">
              🍽️ {t.today}
            </h1>
          </div>
          <p className="text-slate-600 text-lg">
            {getDayName()} {formatDate()}
          </p>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Occupied Tables */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-slate-200">
            <div className="flex flex-col items-center">
              <div className="text-6xl font-bold text-indigo-600 mb-2">
                {occupiedTables}/{totalTables}
              </div>
              <div className="text-slate-600 font-medium">
                {t.tablesOccupied}
              </div>
            </div>
          </div>

          {/* Today's Reservations */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-slate-200">
            <div className="flex flex-col items-center">
              <div className="text-6xl font-bold text-green-600 mb-2">
                {todayReservations.length}
              </div>
              <div className="text-slate-600 font-medium">
                {t.reservationsToday}
              </div>
            </div>
          </div>

          {/* Waiting */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-slate-200">
            <div className="flex flex-col items-center">
              <div className="text-6xl font-bold text-orange-600 mb-2">
                {stats.waitlistCount || 0}
              </div>
              <div className="text-slate-600 font-medium">
                {t.waiting}
              </div>
            </div>
          </div>
        </div>

        {/* Add Walk-in Button */}
        <button
          onClick={() => setShowWalkInModal(true)}
          className="w-full mb-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-6 px-8 rounded-2xl shadow-lg transition-all duration-200 transform hover:scale-[1.02] text-xl"
        >
          + {t.addWalkIn}
        </button>

        {/* Upcoming Reservations */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">
            📅 {t.upcomingReservations}
          </h2>

          {todayReservations.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✨</div>
              <p className="text-slate-600 text-lg">{t.allClear}</p>
              <p className="text-slate-400 mt-2">{t.noUpcoming}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayReservations.map((reservation: any) => (
                <div
                  key={reservation.reservation_id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-indigo-600">
                      {formatTime(reservation.time)}
                    </div>
                    <div className="border-l-2 border-slate-300 pl-4">
                      <div className="font-semibold text-slate-900 text-lg">
                        {reservation.customer_name}
                      </div>
                      <div className="text-slate-600">
                        {reservation.party_size} {t.people}
                        {reservation.special_requests && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">
                            ⭐ {reservation.special_requests}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!reservation.checked_in && (
                    <button
                      onClick={() => {
                        setSelectedReservation(reservation);
                        setShowCheckInModal(true);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                    >
                      {t.checkIn}
                    </button>
                  )}

                  {reservation.checked_in && (
                    <div className="bg-green-100 text-green-800 font-semibold px-6 py-3 rounded-lg">
                      ✓ {language === 'es' ? 'Sentado' : 'Seated'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Tomorrow (Optional) */}
        <div className="mt-6 text-center">
          <button className="text-indigo-600 hover:text-indigo-700 font-semibold text-lg">
            {t.viewTomorrow} →
          </button>
        </div>
      </div>

      {/* Modals */}
      {showWalkInModal && (
        <WalkInModal
          onClose={() => setShowWalkInModal(false)}
          onSuccess={handleWalkInSuccess}
        />
      )}

      {showCheckInModal && selectedReservation && (
        <CheckInModal
          reservation={selectedReservation}
          onClose={() => {
            setShowCheckInModal(false);
            setSelectedReservation(null);
          }}
          onSuccess={handleCheckInSuccess}
        />
      )}

      {showSeatModal && (selectedParty || selectedReservation) && (
        <SeatPartyModal
          partyData={selectedParty || selectedReservation}
          onClose={() => {
            setShowSeatModal(false);
            setSelectedParty(null);
            setSelectedReservation(null);
          }}
          onSuccess={handleSeatSuccess}
        />
      )}
    </div>
  );
}
