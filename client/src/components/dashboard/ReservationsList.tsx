import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [showTomorrow, setShowTomorrow] = useState(false);
  const displayed = showTomorrow ? tomorrowReservations : todayReservations;
  const tl = (key: string) => t(`dashboard.reservationsList.${key}`);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading reservations" className="p-5">
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
    <div className="overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB] gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{tl('upcoming')}</span>
          <span className="text-[11px] font-semibold bg-[#9F1239]/[8%] text-[#9F1239] px-2.5 py-0.5 rounded-full">
            {displayed.length}
          </span>
          {displayed.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-rose-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              {t('common.live', 'Live')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#E5E7EB] rounded-lg text-[11px] font-medium overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowTomorrow(false)}
              className={`px-4 py-1.5 transition-all ${
                !showTomorrow
                  ? 'bg-[#F9FAFB] text-[#111827] border-r border-[#E5E7EB]'
                  : 'text-[#9CA3AF] hover:text-[#111827] border-r border-[#E5E7EB]'
              }`}
            >
              {tl('today')}
            </button>
            <button
              type="button"
              onClick={() => setShowTomorrow(true)}
              className={`px-4 py-1.5 transition-all ${
                showTomorrow
                  ? 'bg-[#F9FAFB] text-[#111827]'
                  : 'text-[#9CA3AF] hover:text-[#111827]'
              }`}
            >
              {tl('tomorrow')}
            </button>
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="text-xs font-semibold px-3 py-1 rounded-lg bg-[#9F1239]/[8%] text-[#9F1239] hover:bg-[#9F1239]/[14%] transition-colors"
            >
              {tl('addReservation')}
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
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{tl('allClear')}</p>
          <p className="text-xs text-stone-gray">
            {showTomorrow ? tl('noTomorrow') : tl('noUpcoming')}
          </p>
          {!showTomorrow && <p className="text-xs text-muted-stone mt-1">{tl('aiHint')}</p>}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg bg-[#9F1239]/[8%] text-[#9F1239] hover:bg-[#9F1239]/[14%] transition-colors"
            >
              + {tl('addReservation')}
            </button>
          )}
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
  const { t } = useTranslation();
  const tl = (key: string) => t(`dashboard.reservationsList.${key}`);

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
    if (hour < 15) return tl('lunch');
    return tl('dinner');
  };

  const isHighRisk = reservation.ml_risk_level === 'high' || reservation.ml_risk_level === 'very-high';

  const initials = reservation.customer_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const statusBadge = reservation.checked_in
    ? { label: tl('seated'), classes: 'bg-violet-600/[8%] text-violet-600' }
    : isHighRisk
    ? { label: tl('atRisk'), classes: 'bg-amber-600/[8%] text-amber-600' }
    : { label: tl('confirmed'), classes: 'bg-rose-600/[8%] text-rose-600' };

  const hue = (reservation.customer_name?.charCodeAt(0) ?? 65) * 137 % 360;
  const avatarStyle = { background: `linear-gradient(135deg, hsl(${hue},50%,75%), hsl(${(hue + 40) % 360},50%,65%))` };

  return (
    <div className={`flex items-center py-[18px] border-b border-[#F3F4F6] last:border-b-0 gap-2.5 sm:gap-4 transition-colors ${
  reservation.party_size >= 6
    ? 'pl-3 sm:pl-5 pr-4 sm:pr-6 border-l-2 border-l-[#9F1239]/30'
    : 'px-3 sm:px-6'
}`}>
      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-semibold text-warm-stone flex-shrink-0" style={avatarStyle}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-deep-charcoal tracking-tight break-words" title={reservation.customer_name}>{reservation.customer_name}</div>
        <div className="text-xs text-muted-stone mt-0.5 truncate">
          {reservation.party_size} {tl('people')}
          {avgSpendPerCover ? (
            <span className="text-rose-600 font-medium"> · ~{formatCurrency(predictReservationRevenue(reservation.party_size, avgSpendPerCover, byPartySize))}</span>
          ) : null}
          {reservation.special_requests && <span> · {reservation.special_requests}</span>}
        </div>
        {/* Risk + Deposit badges */}
        {(reservation.ml_risk_score != null || reservation.deposit_amount) && (
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
            aria-label={tl('checkIn')}
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
              {tl('takeAction')}
            </span>
          </button>
        ) : reservation.intervention_taken ? (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-600/[8%] text-rose-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {tl('actionTaken')}
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
              aria-label={tl('edit')}
              className="p-1.5 rounded-lg text-muted-stone hover:text-deep-charcoal hover:bg-soft-gray transition-colors"
            >
              <ThiingsIcon name="pencil" pxSize={14} />
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label={tl('cancel')}
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

  if (reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0) {
    badges.push({ icon: '⚠️', label: reservation.dietary_restrictions[0], color: 'bg-red-50 text-red-700' });
  }
  if (reservation.special_occasion) {
    badges.push({ icon: '🎂', label: reservation.special_occasion, color: 'bg-purple-50 text-purple-700' });
  }
  if (reservation.seating_preference) {
    badges.push({ icon: '💺', label: reservation.seating_preference, color: 'bg-blue-50 text-blue-700' });
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
