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
      <div className="bg-white border border-[#E7E5E4] rounded-xl p-5 shadow-sm">
        <div className="h-6 w-52 bg-[#E7E5E4] rounded-lg animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-[#FAFAF9] rounded-xl">
              <div className="w-16 h-10 bg-[#E7E5E4] rounded-lg animate-pulse" />
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
    <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#E7E5E4]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#9F1239]/10 rounded-lg">
            <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[#1C1917]">
            {t.upcoming}
            {showTomorrow && (
              <span className="ml-2 text-sm font-normal text-[#57534E]">({t.tomorrow})</span>
            )}
          </h2>
          <span className="px-2 py-0.5 bg-[#9F1239]/10 text-[#9F1239] rounded-lg text-xs font-bold">
            {displayed.length}
          </span>
        </div>

        {/* Tomorrow toggle */}
        <button
          onClick={() => setShowTomorrow(!showTomorrow)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            showTomorrow
              ? 'bg-[#9F1239] text-white'
              : 'text-[#9F1239] hover:bg-[#9F1239]/10'
          }`}
        >
          {showTomorrow ? t.today : t.tomorrow}
        </button>
      </div>

      {/* List */}
      <div className="divide-y divide-[#E7E5E4]/50">
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
          displayed.map((reservation) => (
            <ReservationRow
              key={reservation.reservation_id}
              reservation={reservation}
              onCheckIn={() => onCheckIn(reservation)}
              onIntervention={() => onIntervention(reservation)}
              language={language}
            />
          ))
        )}
      </div>
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

  const isHighRisk = reservation.ml_risk_level === 'high' || reservation.ml_risk_level === 'very-high';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 hover:bg-[#F5F5F4]/50 transition-colors">
      {/* Time */}
      <div className="flex-shrink-0">
        <div className="text-lg sm:text-2xl font-mono font-bold text-[#9F1239] bg-white px-2.5 py-1.5 rounded-lg shadow-sm border-2 border-[#9F1239]/30">
          {formatTime(reservation.time)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 border-l-2 border-[#9F1239]/40 pl-3">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="font-serif font-semibold text-[#1C1917] text-base truncate">
            {reservation.customer_name}
          </span>

          {/* Risk badges */}
          {reservation.ml_risk_level === 'very-high' && (
            <span className="px-2 py-1 bg-red-100 text-red-800 text-[10px] font-bold rounded-lg border border-red-300 shadow-sm">
              VERY HIGH RISK
            </span>
          )}
          {reservation.ml_risk_level === 'high' && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-[10px] font-bold rounded-lg border border-orange-300 shadow-sm">
              HIGH RISK
            </span>
          )}
        </div>

        {/* Intervention actions */}
        {isHighRisk && !(reservation as any).intervention_taken && (
          <button
            onClick={onIntervention}
            className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            {t.takeAction}
          </button>
        )}
        {(reservation as any).intervention_taken && (
          <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-lg border border-green-200">
            {t.actionTaken}
          </span>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-[#57534E] mt-1">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-medium">{reservation.party_size} {t.people}</span>
          </div>
          {reservation.special_requests && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-lg font-medium max-w-full">
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="truncate">{reservation.special_requests}</span>
            </span>
          )}
        </div>
      </div>

      {/* Check-in button */}
      <div className="flex-shrink-0">
        {!reservation.checked_in ? (
          <button
            onClick={onCheckIn}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 min-h-[44px] rounded-lg transition-colors text-sm shadow-sm hover:shadow-md active:scale-95"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t.checkIn}
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-green-100 text-green-800 font-semibold rounded-lg border-2 border-green-300 text-sm">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {t.seated}
          </span>
        )}
      </div>
    </div>
  );
}
