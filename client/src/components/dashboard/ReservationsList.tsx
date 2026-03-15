import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UpcomingReservation } from '../../types/host.types';
import NoShowRiskBadge from './NoShowRiskBadge';
import DepositBadge from './DepositBadge';
import DepositActions from './DepositActions';
import { formatCurrency } from '../../utils/currency';
import { predictReservationRevenue, type PartySizeRevenue } from '../../utils/revenuePredictor';

interface ReservationsListProps {
  todayReservations: UpcomingReservation[];
  tomorrowReservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onIntervention: (reservation: UpcomingReservation) => void;
  onDepositAction?: () => void;
  onAdd?: () => void;
  onEdit?: (reservation: UpcomingReservation) => void;
  onCancel?: (reservation: UpcomingReservation) => void;
  avgSpendPerCover?: number;
  byPartySize?: PartySizeRevenue[];
  language?: 'en' | 'es' | 'pt-BR';
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
    lunch: 'Lunch',
    dinner: 'Dinner',
    atRisk: 'At Risk',
    confirmed: 'Confirmed',
    edit: 'Edit',
    cancel: 'Cancel',
    addReservation: '+ Add',
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
    lunch: 'Almuerzo',
    dinner: 'Cena',
    atRisk: 'En Riesgo',
    confirmed: 'Confirmado',
    edit: 'Editar',
    cancel: 'Cancelar',
    addReservation: '+ Agregar',
  },
  'pt-BR': {
    upcoming: 'Próximas Reservas',
    tomorrow: 'Amanhã',
    today: 'Hoje',
    week: 'Semana',
    allClear: 'Tudo em Dia',
    noUpcoming: 'Sem reservas futuras para hoje',
    noTomorrow: 'Sem reservas amanhã',
    aiHint: 'Reservas do assistente de IA ou adicionadas manualmente aparecerão aqui',
    checkIn: 'Check In',
    seated: 'Sentado',
    takeAction: 'Tomar Ação',
    actionTaken: 'Ação realizada',
    people: 'pessoas',
    lunch: 'Almoço',
    dinner: 'Jantar',
    atRisk: 'Em Risco',
    confirmed: 'Confirmado',
    edit: 'Editar',
    cancel: 'Cancelar',
    addReservation: '+ Adicionar',
  },
};

export default function ReservationsList({
  todayReservations,
  tomorrowReservations,
  onCheckIn,
  onIntervention,
  onDepositAction,
  onAdd,
  onEdit,
  onCancel,
  avgSpendPerCover,
  byPartySize,
  language = 'en',
  isLoading,
}: ReservationsListProps) {
  const [showTomorrow, setShowTomorrow] = useState(false);
  const displayed = showTomorrow ? tomorrowReservations : todayReservations;
  const t = translations[language] || translations.en;

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading reservations" className="bg-white border border-border-gray rounded-2xl p-5">
        <div className="h-6 w-52 bg-border-gray rounded-lg animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-warm-white rounded-xl">
              <div className="w-9 h-9 bg-border-gray rounded-xl animate-pulse" />
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
          {displayed.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-soft-gray rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setShowTomorrow(false)}
              className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${
                !showTomorrow
                  ? 'bg-white text-deep-charcoal shadow-sm'
                  : 'text-muted-stone hover:text-stone-gray'
              }`}
            >
              {t.today}
            </button>
            <button
              type="button"
              onClick={() => setShowTomorrow(true)}
              className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${
                showTomorrow
                  ? 'bg-white text-deep-charcoal shadow-sm'
                  : 'text-muted-stone hover:text-stone-gray'
              }`}
            >
              {t.tomorrow}
            </button>
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="text-xs font-semibold px-3 py-1 rounded-lg bg-burgundy/[8%] text-burgundy hover:bg-burgundy/[14%] transition-colors"
            >
              {t.addReservation}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <ThiingsIcon name="calendar-x" pxSize={20} className="text-muted-stone" />
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
              onDepositAction={onDepositAction}
              onEdit={onEdit ? () => onEdit(reservation) : undefined}
              onCancel={onCancel ? () => onCancel(reservation) : undefined}
              avgSpendPerCover={avgSpendPerCover}
              byPartySize={byPartySize}
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
  onDepositAction?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  avgSpendPerCover?: number;
  byPartySize?: PartySizeRevenue[];
  language: 'en' | 'es' | 'pt-BR';
}

function ReservationRow({ reservation, onCheckIn, onIntervention, onDepositAction, onEdit, onCancel, avgSpendPerCover, byPartySize, language }: ReservationRowProps) {
  const t = translations[language] || translations.en;

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
    if (hour < 15) return t.lunch;
    return t.dinner;
  };

  const isHighRisk = reservation.ml_risk_level === 'high' || reservation.ml_risk_level === 'very-high';

  const initials = reservation.customer_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const statusBadge = reservation.checked_in
    ? { label: t.seated, classes: 'bg-violet-600/[8%] text-violet-600' }
    : isHighRisk
    ? { label: t.atRisk, classes: 'bg-amber-600/[8%] text-amber-600' }
    : { label: t.confirmed, classes: 'bg-green-600/[8%] text-green-600' };

  const hue = (reservation.customer_name?.charCodeAt(0) ?? 65) * 137 % 360;
  const avatarStyle = { background: `linear-gradient(135deg, hsl(${hue},50%,75%), hsl(${(hue + 40) % 360},50%,65%))` };

  return (
    <div className={`flex items-center py-[18px] border-b border-warm-white last:border-b-0 gap-2.5 sm:gap-4 hover:bg-warm-white/50 transition-colors ${
  reservation.party_size >= 6
    ? 'pl-3 sm:pl-5 pr-4 sm:pr-6 border-l-2 border-l-burgundy/30'
    : 'px-3 sm:px-6'
}`}>
      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-semibold text-warm-stone flex-shrink-0" style={avatarStyle}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-deep-charcoal tracking-tight truncate" title={reservation.customer_name}>{reservation.customer_name}</div>
        <div className="text-xs text-muted-stone mt-0.5 truncate">
          {reservation.party_size} {t.people}
          {avgSpendPerCover ? (
            <span className="text-emerald-600 font-medium"> · ~{formatCurrency(predictReservationRevenue(reservation.party_size, avgSpendPerCover, byPartySize))}</span>
          ) : null}
          {reservation.special_requests && <span> · {reservation.special_requests}</span>}
        </div>
        {/* Risk + Deposit badges */}
        {(reservation.ml_risk_score !== undefined || reservation.deposit_amount) && (
          <div className="flex items-center gap-1.5 mt-1">
            <NoShowRiskBadge
              riskScore={reservation.ml_risk_score}
              riskLevel={reservation.ml_risk_level}
            />
            <DepositBadge amount={reservation.deposit_amount} />
          </div>
        )}
        {/* CRM preference icons */}
        <CrmBadges reservation={reservation} />
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
            type="button"
            onClick={onCheckIn}
            aria-label={t.checkIn}
            className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge.classes}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {statusBadge.label}
            </span>
          </button>
        ) : isHighRisk && !reservation.intervention_taken ? (
          <button
            type="button"
            onClick={onIntervention}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-600/[8%] text-amber-600"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {t.takeAction}
            </span>
          </button>
        ) : reservation.intervention_taken ? (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-600/[8%] text-green-600">
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

      {/* Deposit Actions */}
      {reservation.deposit_amount && reservation.deposit_payment_intent_id && (
        <div className="flex-shrink-0">
          <DepositActions
            reservationId={reservation.reservation_id}
            depositAmount={reservation.deposit_amount}
            onActionComplete={onDepositAction || (() => {})}
          />
        </div>
      )}

      {/* Edit / Cancel actions */}
      {(onEdit || onCancel) && !reservation.checked_in && (
        <div className="flex-shrink-0 flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={t.edit}
              className="p-1.5 rounded-lg text-muted-stone hover:text-deep-charcoal hover:bg-soft-gray transition-colors"
            >
              <ThiingsIcon name="pencil" pxSize={14} />
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label={t.cancel}
              className="p-1.5 rounded-lg text-muted-stone hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <ThiingsIcon name="close" pxSize={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact CRM preference badges for reservation cards */
function CrmBadges({ reservation }: { reservation: UpcomingReservation }) {
  const badges: Array<{ icon: string; label: string; color: string }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = reservation as any;

  if (r.dietary_preferences?.length > 0) {
    badges.push({ icon: '⚠️', label: r.dietary_preferences[0], color: 'bg-red-50 text-red-700' });
  }
  if (r.special_occasions) {
    const occasions = r.special_occasions;
    const types = Object.keys(occasions).filter(k => !k.startsWith('_'));
    if (types.length > 0) {
      badges.push({ icon: '🎂', label: types[0], color: 'bg-purple-50 text-purple-700' });
    }
    if (occasions._seating_preference) {
      badges.push({ icon: '💺', label: occasions._seating_preference, color: 'bg-blue-50 text-blue-700' });
    }
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {badges.map((b, i) => (
        <span key={i} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${b.color}`}>
          <span>{b.icon}</span>
          <span className="truncate max-w-[80px]">{b.label}</span>
        </span>
      ))}
    </div>
  );
}
