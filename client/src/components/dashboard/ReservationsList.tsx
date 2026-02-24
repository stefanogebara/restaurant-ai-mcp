import { useState } from 'react';
import { CalendarX } from 'lucide-react';
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
      <div className="bg-white border border-border-gray rounded-2xl p-5">
        <div className="h-6 w-52 bg-border-gray rounded-lg animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-warm-white rounded-xl">
              <div className="w-9 h-9 bg-border-gray rounded-[10px] animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-border-gray rounded animate-pulse mb-2" />
                <div className="h-3 w-20 bg-soft-gray rounded animate-pulse" />
              </div>
              <div className="h-9 w-20 bg-border-gray rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-deep-charcoal tracking-tight">{t.upcoming}</span>
          <span className="text-[11px] font-semibold bg-burgundy/[8%] text-burgundy px-2.5 py-0.5 rounded-full">
            {displayed.length}
          </span>
        </div>
        <div className="flex gap-0">
          <button
            onClick={() => setShowTomorrow(false)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
              !showTomorrow ? 'text-deep-charcoal bg-soft-gray' : 'text-muted-stone hover:text-stone-gray'
            }`}
          >
            {t.today}
          </button>
          <button
            onClick={() => setShowTomorrow(true)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-xl transition-colors ${
              showTomorrow ? 'text-deep-charcoal bg-soft-gray' : 'text-muted-stone hover:text-stone-gray'
            }`}
          >
            {t.tomorrow}
          </button>
        </div>
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <CalendarX className="w-5 h-5 text-muted-stone" />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{t.allClear}</p>
          <p className="text-xs text-stone-gray">
            {showTomorrow ? t.noTomorrow : t.noUpcoming}
          </p>
          {!showTomorrow && <p className="text-xs text-muted-stone mt-1">{t.aiHint}</p>}
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
    ? { label: t.seated, classes: 'bg-[rgba(124,58,237,0.08)] text-violet-600' }
    : isHighRisk
    ? { label: 'At Risk', classes: 'bg-[rgba(217,119,6,0.08)] text-amber-600' }
    : { label: 'Confirmed', classes: 'bg-[rgba(22,163,74,0.08)] text-green-600' };

  const hue = (reservation.customer_name?.charCodeAt(0) ?? 65) * 137 % 360;
  const avatarStyle = { background: `linear-gradient(135deg, hsl(${hue},50%,75%), hsl(${(hue + 40) % 360},50%,65%))` };

  return (
    <div className="flex items-center px-6 py-[18px] border-b border-warm-white last:border-b-0 gap-4 hover:bg-warm-white/50 transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[13px] font-semibold text-warm-stone flex-shrink-0" style={avatarStyle}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-deep-charcoal tracking-tight">{reservation.customer_name}</div>
        <div className="text-xs text-muted-stone mt-0.5">
          {reservation.party_size} guests
          {reservation.special_requests && ` \u00b7 ${reservation.special_requests}`}
        </div>
      </div>

      {/* Time */}
      <div className="text-right flex-shrink-0">
        <div className="text-[13px] font-medium text-stone-gray">{formatTime(reservation.time)}</div>
        <div className="text-[11px] text-muted-stone">{getMealPeriod(reservation.time)}</div>
      </div>

      {/* Status / Action */}
      <div className="flex-shrink-0">
        {!reservation.checked_in && !isHighRisk ? (
          <button
            onClick={onCheckIn}
            aria-label={t.checkIn}
            className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge.classes}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {statusBadge.label}
            </span>
          </button>
        ) : isHighRisk && !(reservation as any).intervention_taken ? (
          <button
            onClick={onIntervention}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-[rgba(217,119,6,0.08)] text-amber-600"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {t.takeAction}
            </span>
          </button>
        ) : (reservation as any).intervention_taken ? (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[rgba(22,163,74,0.08)] text-green-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {t.actionTaken}
            </span>
          </span>
        ) : (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge.classes}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {statusBadge.label}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
