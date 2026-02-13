import { useState } from 'react';
import type { UpcomingReservation } from '../../types/host.types';

interface ReservationsListProps {
  todayReservations: UpcomingReservation[];
  tomorrowReservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onIntervention: (reservation: UpcomingReservation) => void;
  isLoading?: boolean;
}

export default function ReservationsList({
  todayReservations,
  tomorrowReservations,
  onCheckIn,
  onIntervention,
  isLoading,
}: ReservationsListProps) {
  const [showTomorrow, setShowTomorrow] = useState(false);
  const displayed = showTomorrow ? tomorrowReservations : todayReservations;

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
            Upcoming Reservations
            {showTomorrow && (
              <span className="ml-2 text-sm font-normal text-[#57534E]">(Tomorrow)</span>
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
          {showTomorrow ? 'Today' : 'Tomorrow'}
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
            <p className="text-sm font-semibold text-[#1C1917] mb-1">All Caught Up</p>
            <p className="text-xs text-[#57534E]">
              {showTomorrow ? 'No reservations tomorrow' : 'No upcoming reservations for today'}
            </p>
          </div>
        ) : (
          displayed.map((reservation) => (
            <ReservationRow
              key={reservation.reservation_id}
              reservation={reservation}
              onCheckIn={() => onCheckIn(reservation)}
              onIntervention={() => onIntervention(reservation)}
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
}

function ReservationRow({ reservation, onCheckIn, onIntervention }: ReservationRowProps) {
  const formatTime = (time: string) => {
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
        <div className="text-lg font-mono font-bold text-[#9F1239] bg-white px-2.5 py-1.5 rounded-lg shadow-sm border border-[#9F1239]/20">
          {formatTime(reservation.time)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 border-l-2 border-[#9F1239]/30 pl-3">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="font-semibold text-[#1C1917] text-sm truncate">
            {reservation.customer_name}
          </span>

          {/* Risk badges */}
          {reservation.ml_risk_level === 'very-high' && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded border border-red-300">
              VERY HIGH RISK
            </span>
          )}
          {reservation.ml_risk_level === 'high' && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-bold rounded border border-orange-300">
              HIGH RISK
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
          <span className="font-medium">{reservation.party_size} people</span>
          {reservation.special_requests && (
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[200px]">
              {reservation.special_requests}
            </span>
          )}
        </div>

        {/* Intervention button for high risk */}
        {isHighRisk && !(reservation as any).intervention_taken && (
          <button
            onClick={onIntervention}
            className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-semibold rounded transition-colors"
          >
            Take Action
          </button>
        )}
        {(reservation as any).intervention_taken && (
          <span className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded border border-green-200">
            Action taken
          </span>
        )}
      </div>

      {/* Check-in button */}
      <div className="flex-shrink-0">
        {!reservation.checked_in ? (
          <button
            onClick={onCheckIn}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 min-h-[40px] rounded-lg transition-colors text-sm"
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Check In
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-100 text-green-800 font-semibold rounded-lg border border-green-200 text-sm">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Seated
          </span>
        )}
      </div>
    </div>
  );
}
