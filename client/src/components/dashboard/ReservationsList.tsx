import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import StatusLegend, { chipClassesForStatus, type StatusLegendItem } from '../common/StatusLegend';
import type { UpcomingReservation, Table } from '../../types/host.types';
import NoShowRiskBadge from './NoShowRiskBadge';
import DepositSuggestChip from './DepositSuggestChip';
import DepositBadge from './DepositBadge';
import CustomerTierBadge from './CustomerTierBadge';
import DepositActions from './DepositActions';
import { formatCurrency } from '../../utils/currency';
import { predictReservationRevenue, type PartySizeRevenue } from '../../utils/revenuePredictor';

type StatusFilter = 'all' | 'confirmed' | 'at_risk' | 'checked_in';
type DayFilter = 'today' | 'tomorrow' | 'week';

interface ReservationsListProps {
  todayReservations: UpcomingReservation[];
  tomorrowReservations: UpcomingReservation[];
  /** Reservations from day+2 through day+7. Optional for backwards compat. */
  weekReservations?: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onIntervention: (reservation: UpcomingReservation) => void;
  onDepositAction?: () => void;
  /** Phase AA: triggered by the deposit-suggest chip on high-risk
   *  bookings. Parent decides how to surface the request (modal /
   *  WhatsApp link / email). Optional — when absent, the chip renders
   *  as a passive info badge instead of a clickable button. */
  onRequestDeposit?: (reservation: UpcomingReservation) => void;
  onAdd?: () => void;
  onEdit?: (reservation: UpcomingReservation) => void;
  onCancel?: (reservation: UpcomingReservation) => void;
  onCustomerClick?: (reservation: UpcomingReservation) => void;
  avgSpendPerCover?: number;
  byPartySize?: PartySizeRevenue[];
  language?: 'en' | 'es' | 'pt-BR';
  isLoading?: boolean;
  tables?: Table[];
}

export default function ReservationsList({
  todayReservations,
  tomorrowReservations,
  weekReservations = [],
  onCheckIn,
  onIntervention,
  onDepositAction,
  onRequestDeposit,
  onAdd,
  onEdit,
  onCancel,
  onCustomerClick,
  avgSpendPerCover,
  byPartySize,
  language = 'en',
  isLoading,
  tables = [],
}: ReservationsListProps) {
  // Build id→table_number lookup once for all rows
  const tableMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tables) m.set(t.id, t.table_number);
    return m;
  }, [tables]);
  const { t } = useTranslation();
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const displayed =
    dayFilter === 'tomorrow' ? tomorrowReservations :
    dayFilter === 'week' ? weekReservations :
    todayReservations;
  const tl = (key: string) => t(`dashboard.reservationsList.${key}`);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter by search query + status
  const filtered = useMemo(() => {
    return displayed.filter((r) => {
      // Search filter
      if (debouncedQuery.trim()) {
        const q = debouncedQuery.toLowerCase();
        const matchesSearch =
          r.customer_name?.toLowerCase().includes(q) ||
          r.customer_phone?.includes(q) ||
          r.reservation_id?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter === 'confirmed') {
        return !r.checked_in && r.ml_risk_level !== 'high' && r.ml_risk_level !== 'very-high';
      }
      if (statusFilter === 'at_risk') {
        return r.ml_risk_level === 'high' || r.ml_risk_level === 'very-high';
      }
      if (statusFilter === 'checked_in') {
        return r.checked_in;
      }
      return true;
    });
  }, [displayed, debouncedQuery, statusFilter]);

  const isFiltering = debouncedQuery.trim() !== '' || statusFilter !== 'all';

  const statusFilters: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: tl('filterAll') },
    { key: 'confirmed', label: tl('filterConfirmed') },
    { key: 'at_risk', label: tl('filterAtRisk') },
    { key: 'checked_in', label: tl('filterCheckedIn') },
  ];

  if (isLoading) {
    return (
      <div role="status" aria-label={t('common.loading')} className="p-5">
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
      <div className="px-3 sm:px-6 py-4 sm:py-5 border-b border-glass-border-dark">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] sm:text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{tl('upcoming')}</span>
            <span className="text-[11px] font-semibold bg-[#9F1239]/[8%] text-[#9F1239] px-2.5 py-0.5 rounded-full">
              {displayed.length}
            </span>
            {displayed.length > 0 && dayFilter === 'today' && (
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
            <div className="flex border border-glass-border-dark rounded-lg text-[11px] font-medium overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => setDayFilter('today')}
                className={`px-4 py-1.5 transition-all border-r border-glass-border-dark ${
                  dayFilter === 'today' ? 'bg-[#F9FAFB] text-[#111827]' : 'text-[#9CA3AF] hover:text-[#111827]'
                }`}
              >
                {tl('today')}
              </button>
              <button
                type="button"
                onClick={() => setDayFilter('tomorrow')}
                className={`px-4 py-1.5 transition-all border-r border-glass-border-dark ${
                  dayFilter === 'tomorrow' ? 'bg-[#F9FAFB] text-[#111827]' : 'text-[#9CA3AF] hover:text-[#111827]'
                }`}
              >
                {tl('tomorrow')}
              </button>
              <button
                type="button"
                onClick={() => setDayFilter('week')}
                className={`px-4 py-1.5 transition-all ${
                  dayFilter === 'week' ? 'bg-[#F9FAFB] text-[#111827]' : 'text-[#9CA3AF] hover:text-[#111827]'
                }`}
                title={tl('thisWeekHint')}
              >
                {tl('thisWeek')}
                {weekReservations.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#9F1239]/[10%] text-[10px] font-semibold text-[#9F1239]">
                    {weekReservations.length}
                  </span>
                )}
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

        {/* Status legend — answers Carla's "what does each color mean?"
            question once at the top of the panel so individual badges below
            don't need labels. Hidden on mobile where header space is tight. */}
        <div className="hidden sm:flex mt-3 pt-3 border-t border-[#F3F4F6]">
          <StatusLegend
            items={[
              { label: tl('confirmed'), token: 'good' },
              { label: tl('seated'),    token: 'active' },
              { label: tl('atRisk'),    token: 'warn' },
            ] as StatusLegendItem[]}
          />
        </div>

        {/* Search input */}
        <div className="relative mt-3">
          <ThiingsIcon
            name="search"
            pxSize={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tl('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-sm font-[Inter] border border-glass-border-dark rounded-lg bg-white/60 placeholder-[#9CA3AF] text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#9F1239]/30 focus:border-[#9F1239]/40 transition-colors"
            aria-label={tl('searchPlaceholder')}
          />
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto sm:overflow-x-visible sm:flex-wrap pb-1 sm:pb-0 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide">
          {statusFilters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`text-[11px] font-medium px-3 py-1 rounded-full transition-colors whitespace-nowrap flex-shrink-0 ${
                statusFilter === key
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Showing X of Y */}
        {isFiltering && (
          <p className="text-[11px] text-[#9CA3AF] mt-2" data-testid="filter-result-count">
            {t('dashboard.reservationsList.showingResults', {
              shown: filtered.length,
              total: displayed.length,
              defaultValue: `Mostrando ${filtered.length} de ${displayed.length}`,
            })}
          </p>
        )}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <ThiingsIcon name="calendar-x" pxSize={20} className="text-muted-stone" />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{tl('allClear')}</p>
          <p className="text-xs text-stone-gray">
            {dayFilter === 'tomorrow' ? tl('noTomorrow')
              : dayFilter === 'week' ? tl('noThisWeek')
              : tl('noUpcoming')}
          </p>
          {dayFilter === 'today' && <p className="text-xs text-muted-stone mt-1">{tl('aiHint')}</p>}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg bg-[#9F1239]/[8%] text-[#9F1239] hover:bg-[#9F1239]/[14%] transition-colors"
            >
              {tl('addReservation')}
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <ThiingsIcon name="search" pxSize={20} className="text-muted-stone" />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">{tl('noResults')}</p>
          <p className="text-xs text-stone-gray">{tl('noResultsHint')}</p>
        </div>
      ) : (
        <div>
          {filtered.map((reservation) => (
            <ReservationRow
              key={reservation.reservation_id}
              reservation={reservation}
              onCheckIn={() => onCheckIn(reservation)}
              onIntervention={() => onIntervention(reservation)}
              onDepositAction={onDepositAction}
              onRequestDeposit={onRequestDeposit
                ? () => onRequestDeposit(reservation)
                : undefined}
              onEdit={onEdit ? () => onEdit(reservation) : undefined}
              onCancel={onCancel ? () => onCancel(reservation) : undefined}
              onCustomerClick={onCustomerClick ? () => onCustomerClick(reservation) : undefined}
              avgSpendPerCover={avgSpendPerCover}
              byPartySize={byPartySize}
              language={language}
              tableMap={tableMap}
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
  /** Phase AA: fires when host clicks the deposit-suggest chip. */
  onRequestDeposit?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onCustomerClick?: () => void;
  avgSpendPerCover?: number;
  byPartySize?: PartySizeRevenue[];
  language: 'en' | 'es' | 'pt-BR';
  tableMap?: Map<string, number>;
}

function ReservationRow({ reservation, onCheckIn, onIntervention, onDepositAction, onRequestDeposit, onEdit, onCancel, onCustomerClick, avgSpendPerCover, byPartySize, language, tableMap }: ReservationRowProps) {
  const { t } = useTranslation();
  const tl = (key: string) => t(`dashboard.reservationsList.${key}`);
  // Mobile-only bottom sheet for Edit / Cancel / Call. Desktop has its own
  // hover-icon row; on touch devices the 14px icons were unreachable and
  // hidden behind `hidden sm:flex` which left mobile hosts with NO way to
  // act on a reservation row.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    if (language !== 'en') return `${hours}:${minutes}`; // Always HH:MM, strip seconds
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

  // customer_name is typed `string`, but the search filter and avatar-hue
  // computation both guard it with `?.` — the backend has been seen to
  // return null here. Guard the split too, or the whole row crashes.
  const initials = (reservation.customer_name ?? '')
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Status badge colors now map to the canonical semantic palette
  // (emerald/blue/amber/red). Previously: confirmed=rose, seated=violet,
  // at-risk=amber — three different random palettes that didn't match the
  // floor-plan table colors or any other status-bearing surface.
  const statusBadge = reservation.checked_in
    ? { label: tl('seated'),    classes: `${chipClassesForStatus('active')}` }
    : isHighRisk
    ? { label: tl('atRisk'),    classes: `${chipClassesForStatus('warn')}` }
    : { label: tl('confirmed'), classes: `${chipClassesForStatus('good')}` };

  const hue = (reservation.customer_name?.charCodeAt(0) ?? 65) * 137 % 360;
  const avatarStyle = { background: `linear-gradient(135deg, hsl(${hue},50%,75%), hsl(${(hue + 40) % 360},50%,65%))` };

  return (
    <div className={`flex items-center py-3 sm:py-[18px] border-b border-[#F3F4F6] last:border-b-0 gap-2 sm:gap-4 transition-colors ${
  reservation.party_size >= 6
    ? 'pl-3 sm:pl-5 pr-3 sm:pr-6 border-l-2 border-l-[#9F1239]/30'
    : 'px-3 sm:px-6'
}`}>
      {/* Avatar */}
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-[11px] sm:text-[13px] font-semibold text-warm-stone flex-shrink-0" style={avatarStyle}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCustomerClick}
            className="text-[13px] sm:text-sm font-semibold text-deep-charcoal tracking-tight truncate hover:text-burgundy transition-colors text-left"
            title={reservation.customer_name}
          >
            {reservation.customer_name}
          </button>
          <CustomerTierBadge tier={reservation.customer_tier} visitCount={reservation.visit_count} compact />
          {reservation.source && reservation.source !== 'seatable' && (() => {
            // Previously the source rendered as raw uppercase (e.g. "WA",
            // "WHATSAPP_AI") which read as a cryptic acronym to hosts. Map
            // to friendly labels.
            const src = reservation.source.toLowerCase();
            const isWhatsApp = src === 'whatsapp' || src === 'whatsapp_ai' || src === 'wa';
            const label = isWhatsApp
              ? 'WhatsApp'
              : src === 'voice' || src === 'phone' || src === 'voice_ai'
                ? tl('byPhone')
                : src === 'manual'
                  ? tl('addedByStaff')
                  : reservation.source;
            return (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  isWhatsApp ? 'bg-green-50 text-green-700' : 'bg-blue-500/10 text-blue-600'
                }`}
                title={label}
              >
                {isWhatsApp && <span aria-hidden="true">💬</span>}
                {label}
              </span>
            );
          })()}
        </div>
        <div className="text-[11px] sm:text-xs text-muted-stone mt-0.5 truncate">
          {reservation.party_size} {tl('people')}
          {tableMap && reservation.table_ids && reservation.table_ids.length > 0 && (
            <span className="text-burgundy font-medium">
              {' · '}T{reservation.table_ids.map(id => tableMap.get(id)).filter(Boolean).join(', T')}
            </span>
          )}
          {avgSpendPerCover ? (
            // Previously rendered as a bare "~€120" next to the party size,
            // which read as if the guest cost the restaurant money. Now
            // explicitly labelled "Expected spend".
            <span
              className="text-rose-600 font-medium"
              title={tl('expectedSpendHint')}
            >
              {' · '}{tl('expectedSpendShort')} ~{formatCurrency(predictReservationRevenue(reservation.party_size, avgSpendPerCover, byPartySize))}
            </span>
          ) : null}
          {reservation.special_requests && <span className="hidden sm:inline"> · {reservation.special_requests}</span>}
        </div>
        {/* Risk + Deposit badges */}
        {(reservation.ml_risk_score != null || reservation.deposit_amount || reservation.deposit_suggested) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <NoShowRiskBadge
              riskScore={reservation.ml_risk_score}
              riskLevel={reservation.ml_risk_level}
            />
            <DepositBadge amount={reservation.deposit_amount} />
            {/* Phase AA: shows when backend says risk is high enough to
                warrant requesting a deposit AND none is collected yet.
                Clicking would hand off to the existing deposit-request
                flow; the wiring lives one level up in the parent so
                each surface can decide what "request" means (modal,
                link copy, WhatsApp share, etc.). */}
            <DepositSuggestChip
              suggested={reservation.deposit_suggested}
              reason={reservation.deposit_suggested_reason}
              onRequestDeposit={onRequestDeposit}
            />
          </div>
        )}
        {/* CRM preference icons — hide on mobile to save space */}
        <div className="hidden sm:block">
          <CrmBadges reservation={reservation} />
        </div>
      </div>

      {/* Time */}
      <div className="text-right flex-shrink-0">
        <div className="text-[12px] sm:text-[13px] font-medium text-stone-gray">{formatTime(reservation.time)}</div>
        <div className="text-[10px] sm:text-[11px] text-muted-stone">{getMealPeriod(reservation.time)}</div>
      </div>

      {/* Status / Action */}
      <div className="flex-shrink-0 hidden sm:block">
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
          // Previously rendered as a pill that looked identical to passive
          // status badges. Now a filled call-to-action button with a verb-
          // first label ("Send reminder") so hosts can tell it's clickable.
          <button
            type="button"
            onClick={onIntervention}
            aria-label={tl('takeActionAriaLabel')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white transition-colors inline-flex items-center gap-1.5 shadow-sm"
          >
            <span aria-hidden="true">⚡</span>
            {tl('takeActionButton')}
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

      {/* Mobile-only: compact status dot */}
      <div className="flex-shrink-0 sm:hidden">
        {!reservation.checked_in && !isHighRisk ? (
          <button
            type="button"
            onClick={onCheckIn}
            aria-label={tl('checkIn')}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.classes}`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {statusBadge.label}
            </span>
          </button>
        ) : isHighRisk && !reservation.intervention_taken ? (
          <button
            type="button"
            onClick={onIntervention}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-600/[8%] text-amber-600"
          >
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              !
            </span>
          </button>
        ) : (
          // Previously this rendered just a colored dot with no label —
          // hosts on iPad / phone couldn't tell what the colored circle
          // meant. Now we also surface the short status label.
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.classes}`}>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              {statusBadge.label}
            </span>
          </span>
        )}
      </div>

      {/* Deposit Actions */}
      {reservation.deposit_amount && reservation.deposit_payment_intent_id && (
        <div className="flex-shrink-0 hidden sm:block">
          <DepositActions
            reservationId={reservation.reservation_id}
            depositAmount={reservation.deposit_amount}
            onActionComplete={onDepositAction || (() => {})}
          />
        </div>
      )}

      {/* Edit / Cancel — desktop hover-icon row */}
      {(onEdit || onCancel) && !reservation.checked_in && (
        <div className="flex-shrink-0 hidden sm:flex items-center gap-1">
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

      {/* Mobile-only 3-dot trigger + bottom sheet menu. Replaces the 14px
          icons hidden behind `sm:flex` which left mobile hosts with NO
          discoverable way to edit or cancel a row. */}
      {(onEdit || onCancel || reservation.customer_phone) && !reservation.checked_in && (
        <div className="flex-shrink-0 sm:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={tl('rowActionsAriaLabel', 'Reservation actions')}
            className="p-2 -m-2 rounded-lg text-muted-stone hover:text-deep-charcoal hover:bg-soft-gray transition-colors"
          >
            <ThiingsIcon name="more-horizontal" pxSize={18} />
          </button>
          {mobileMenuOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={tl('rowActionsAriaLabel', 'Reservation actions')}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div
                className="bg-glass-modal backdrop-blur-glass-modal w-full rounded-t-2xl shadow-glass-modal border-t border-glass-border p-2 pb-6 max-h-[70vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag-handle affordance */}
                <div className="mx-auto mb-2 w-12 h-1.5 rounded-full bg-stone-200" aria-hidden="true" />
                <div className="px-2 pb-2 text-xs font-medium text-stone-gray truncate">
                  {reservation.customer_name}
                </div>
                {reservation.customer_phone && (
                  <a
                    href={`tel:${reservation.customer_phone}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-deep-charcoal hover:bg-soft-gray rounded-xl transition-colors"
                  >
                    <ThiingsIcon name="phone" pxSize={18} className="text-stone-gray" />
                    {tl('callGuest', 'Call guest')}
                  </a>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); onEdit(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-deep-charcoal hover:bg-soft-gray rounded-xl transition-colors"
                  >
                    <ThiingsIcon name="pencil" pxSize={18} className="text-stone-gray" />
                    {tl('editFull', 'Edit reservation')}
                  </button>
                )}
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); onCancel(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <ThiingsIcon name="close" pxSize={18} className="text-red-600" />
                    {tl('cancelFull', 'Cancel reservation')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full mt-2 px-4 py-3 text-sm font-medium text-stone-gray hover:bg-soft-gray rounded-xl transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
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
