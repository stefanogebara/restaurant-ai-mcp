import { useState } from 'react';
import type { UpcomingReservation } from '../../types/host.types';

interface ReservationsListProps {
  todayReservations: UpcomingReservation[];
  tomorrowReservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onIntervention: (reservation: UpcomingReservation) => void;
  language?: 'en' | 'es';
  isLoading?: boolean;
}

const translations = {
  en: {
    upcoming: 'Upcoming Reservations',
    tomorrow: 'Tomorrow',
    today: 'Today',
    week: 'Week',
    allClear: 'All Caught Up',
    noUpcoming: 'No upcoming reservations for today',
    noTomorrow: 'No reservations tomorrow',
    aiHint: 'Reservations from the AI assistant or added manually will appear here',
    checkIn: 'Check In',
    seated: 'Seated',
    takeAction: 'Take Action',
    actionTaken: 'Action taken',
    people: 'people',
  },
  es: {
    upcoming: 'Próximas Reservas',
    tomorrow: 'Mañana',
    today: 'Hoy',
    week: 'Semana',
    allClear: 'Todo al dia',
    noUpcoming: 'Sin reservas pendientes para hoy',
    noTomorrow: 'Sin reservas mañana',
    aiHint: 'Las reservas del asistente AI o las añadidas manualmente aparecerán aquí',
    checkIn: 'Check In',
    seated: 'Sentado',
    takeAction: 'Tomar Acción',
    actionTaken: 'Acción tomada',
    people: 'personas',
  },
};

export default function ReservationsList({
  todayReservations,
  tomorrowReservations,
  onCheckIn,
  onIntervention,
  language = 'en',
  isLoading,
}: ReservationsListProps) {
  const [showTomorrow, setShowTomorrow] = useState(false);
  const displayed = showTomorrow ? tomorrowReservations : todayReservations;
  const t = translations[language];

  if (isLoading) {
    return (
      <div className="bg-white border border-[#E7E5E4] rounded-2xl p-5">
        <div className="h-6 w-52 bg-[#E7E5E4] rounded-lg animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-[#FAFAF9] rounded-xl">
              <div className="w-9 h-9 bg-[#E7E5E4] rounded-[10px] animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-[#E7E5E4] rounded animate-pulse mb-2" />
                <div className="h-3 w-20 bg-[#F5F5F4] rounded animate-pulse" />
              </div>
              <div className="h-9 w-20 bg-[#E7E5E4] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E7E5E4] rounded-2xl overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#F5F5F4]">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-[#1C1917] tracking-tight">{t.upcoming}</span>
          <span className="text-[11px] font-semibold bg-[rgba(159,18,57,0.08)] text-[#9F1239] px-2.5 py-0.5 rounded-full">
            {displayed.length}
          </span>
        </div>
        <div className="flex gap-0">
          <button
            onClick={() => setShowTomorrow(false)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors ${
              !showTomorrow ? 'text-[#1C1917] bg-[#F5F5F4]' : 'text-[#A8A29E] hover:text-[#57534E]'
            }`}
          >
            {t.today}
          </button>
          <button
            onClick={() => setShowTomorrow(true)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors ${
              showTomorrow ? 'text-[#1C1917] bg-[#F5F5F4]' : 'text-[#A8A29E] hover:text-[#57534E]'
            }`}
          >
            {t.tomorrow}
          </button>
        </div>
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#1C1917] mb-1">{t.allClear}</p>
          <p className="text-xs text-[#57534E]">
            {showTomorrow ? t.noTomorrow : t.noUpcoming}
          </p>
          {!showTomorrow && <p className="text-xs text-[#A8A29E] mt-1">{t.aiHint}</p>}
        </div>
      ) : (
        <div>
          {displayed.map((reservation) => (
            <ReservationRow
              key={reservation.reservation_id}
              reservation={reservation}
              onCheckIn={() => onCheckIn(reservation)}
              onIntervention={() => onIntervention(reservation)}
              language={language}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Internal row component ----

interface ReservationRowProps {
  reservation: UpcomingReservation;
  onCheckIn: () => void;
  onIntervention: () => void;
  language: 'en' | 'es';
}

function ReservationRow({ reservation, onCheckIn, onIntervention, language }: ReservationRowProps) {
  const t = translations[language];

  const formatTime = (time: string) => {
    if (language !== 'en') return time;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getMealPeriod = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour < 15) return language === 'en' ? 'Lunch' : 'Almuerzo';
    return language === 'en' ? 'Dinner' : 'Cena';
  };

  const isHighRisk = reservation.ml_risk_level === 'high' || reservation.ml_risk_level === 'very-high';

  const initials = reservation.customer_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const statusBadge = reservation.checked_in
    ? { label: t.seated, classes: 'bg-[rgba(124,58,237,0.08)] text-[#7c3aed]' }
    : isHighRisk
    ? { label: 'At Risk', classes: 'bg-[rgba(217,119,6,0.08)] text-[#d97706]' }
    : { label: 'Confirmed', classes: 'bg-[rgba(22,163,74,0.08)] text-[#16a34a]' };

  return (
    <div className="flex items-center px-6 py-4 border-b border-[#FAFAF9] last:border-b-0 gap-4 hover:bg-[#FAFAF9]/50 transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-[10px] bg-[#F5F5F4] flex items-center justify-center text-[13px] font-semibold text-[#78716C] flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#1C1917] tracking-tight">{reservation.customer_name}</div>
        <div className="text-xs text-[#A8A29E] mt-0.5">
          {reservation.party_size} guests
          {reservation.special_requests && ` \u00b7 ${reservation.special_requests}`}
        </div>
      </div>

      {/* Time */}
      <div className="text-right flex-shrink-0">
        <div className="text-[13px] font-medium text-[#57534E]">{formatTime(reservation.time)}</div>
        <div className="text-[11px] text-[#A8A29E]">{getMealPeriod(reservation.time)}</div>
      </div>

      {/* Status / Action */}
      <div className="flex-shrink-0">
        {!reservation.checked_in && !isHighRisk ? (
          <button
            onClick={onCheckIn}
            aria-label={t.checkIn}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge.classes}`}
          >
            {statusBadge.label}
          </button>
        ) : isHighRisk && !(reservation as any).intervention_taken ? (
          <button
            onClick={onIntervention}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[rgba(217,119,6,0.08)] text-[#d97706]"
          >
            {t.takeAction}
          </button>
        ) : (reservation as any).intervention_taken ? (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[rgba(22,163,74,0.08)] text-[#16a34a]">
            {t.actionTaken}
          </span>
        ) : (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge.classes}`}>
            {statusBadge.label}
          </span>
        )}
      </div>
    </div>
  );
}
