/**
 * Unified host dashboard — operational summary beside the live floor.
 *
 * Layout:
 *   Header and metrics on the canvas; saved floor plan as one object.
 *   Reservations, waitlist and service tools follow below the first fold.
 *
 * All panels are extracted into standalone components.
 * DashboardLayout supplies the shared navigation shell.
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import { useRealtimeDashboard } from '../hooks/useRealtimeSubscription';
import { useCompleteService } from '../hooks/useCompleteService';
import { usePlanInfo } from '../hooks/useSubscription';
import DashboardLayout from '../components/layout/DashboardLayout';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import TableTimeline from '../components/dashboard/TableTimeline';
import { hasPositionData } from '../components/host/floorPlanHelpers';
import { useServiceMode } from '../hooks/useServiceMode';
import ReservationsList from '../components/dashboard/ReservationsList';
import CustomerProfileDrawer from '../components/dashboard/CustomerProfileDrawer';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import WaitlistPanel from '../components/host/WaitlistPanel';
import ManagerNotesPanel from '../components/dashboard/ManagerNotesPanel';
import StaffingForecastWidget from '../components/dashboard/StaffingForecastWidget';
import StripeConnectStatusBadge from '../components/dashboard/StripeConnectStatusBadge';
import StripeConnectNudgeBanner from '../components/dashboard/StripeConnectNudgeBanner';
import RevenueStatsWidget from '../components/dashboard/RevenueStatsWidget';
import RevenueByPartySizeWidget from '../components/dashboard/RevenueByPartySizeWidget';
import ProactiveCommsPanel from '../components/dashboard/ProactiveCommsPanel';
// FeedbackWidget removed — dead feature
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import QuickInterventionModal from '../components/host/QuickInterventionModal';
import AddReservationModal from '../components/host/AddReservationModal';
import EditReservationModal from '../components/host/EditReservationModal';
import CancelReservationDialog from '../components/host/CancelReservationDialog';
import DepositRequestModal from '../components/dashboard/DepositRequestModal';
import type { UpcomingReservation, ActiveParty, SeatModalData } from '../types/host.types';
import { trackFirstReservationCreated } from '../lib/analytics';
import { useRevenueStats } from '../hooks/useRevenueStats';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { LS_FIRST_RESERVATION_TRACKED, LS_LAUNCH_CHECKLIST_DONE } from '../config/localStorageKeys';
import LaunchChecklistModal from '../components/dashboard/LaunchChecklistModal';
import { useToast } from '../contexts/ToastContext';
import { formatLocalDate, todayLocalISO } from '../utils/timeFormatting';

function maybeTrackFirstReservation() {
  if (!localStorage.getItem(LS_FIRST_RESERVATION_TRACKED)) {
    trackFirstReservationCreated();
    localStorage.setItem(LS_FIRST_RESERVATION_TRACKED, '1');
  }
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('pageTitles.dashboard'));
  const { success } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationFocusId = searchParams.get('reservation') ?? '';

  // Launch checklist: show after first subscription
  const [showLaunchChecklist, setShowLaunchChecklist] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('launch') === '1' && !localStorage.getItem(LS_LAUNCH_CHECKLIST_DONE);
  });

  // Show a one-time welcome toast when arriving from demo conversion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('converted') === 'demo') {
      success(t('dashboard.welcomeFromDemo'));
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('launch') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Modal state ----
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<SeatModalData | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const [interventionReservation, setInterventionReservation] = useState<UpcomingReservation | null>(null);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [editReservation, setEditReservation] = useState<UpcomingReservation | null>(null);
  const [cancelReservation, setCancelReservation] = useState<UpcomingReservation | null>(null);
  // Phase AA.5: deposit-suggest chip → request modal.
  const [depositRequestReservation, setDepositRequestReservation] = useState<UpcomingReservation | null>(null);
  // O perfil do cliente na hora de sentar. O drawer, /api/guest-context e
  // /api/ltv já existiam e estavam ligados SÓ na DemoDashboard — o prospect
  // via na demo o que o restaurante pagante não tinha. Aqui, diferente da
  // demo, a sessão é autenticada, então as duas queries do drawer de fato
  // rodam e trazem memórias, preferências e churn real.
  const [selectedCustomer, setSelectedCustomer] = useState<UpcomingReservation | null>(null);
  const [showInsightsWidgets, setShowInsightsWidgets] = useState(false);

  // ---- Data fetching ----
  // BB.2: dropped from 30s → 5min poll. Supabase Realtime now invalidates
  // the cache on every reservations / tables / waitlist / service_records
  // change (see useRealtimeDashboard below), so the 30s safety net was
  // costing ~120 function calls/hour per open tab for nothing. Keep a
  // 5-minute heartbeat as belt-and-suspenders in case the realtime
  // channel drops mid-session.
  const { data: dashboardData, refetch, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (reservationFocusId && !isLoading) {
      document.getElementById('reservations')?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [reservationFocusId, isLoading]);

  // ---- Data extraction ----
  const rawStats = dashboardData?.data?.summary || {};
  const tables = dashboardData?.data?.tables || [];
  const reservations: UpcomingReservation[] = dashboardData?.data?.upcoming_reservations || [];
  const activeParties: ActiveParty[] = dashboardData?.data?.active_parties || [];
  const restaurantSlug: string = dashboardData?.data?.slug || '';
  const restaurantId: string | undefined = dashboardData?.data?.restaurant_id;

  // BB.2: subscribe to live changes the moment we know which tenant we are.
  // Each INSERT/UPDATE/DELETE on reservations, tables, waitlist, or
  // service_records triggers a dashboard refetch — sub-second perceived
  // latency vs the old 30s poll. Cleans itself up on unmount.
  useRealtimeDashboard(restaurantId);

  // Local timezone — see todayLocalISO docs. Anti-pattern toISOString().split('T')[0]
  // gave hosts in São Paulo at 23:00 tomorrow's date, hiding actual-today reservations.
  const today = todayLocalISO();
  const tomorrow = formatLocalDate(new Date(Date.now() + 86400000));
  // Day+2..Day+7 so a restaurant sees any booking made up to a week ahead.
  // Before: anything past tomorrow was invisible on the dashboard — caught
  // by an E2E that booked 2 days out and had the reservation vanish.
  const weekEnd = formatLocalDate(new Date(Date.now() + 7 * 86400000));
  const todayReservations = reservations.filter((r) => r.date === today);
  const tomorrowReservations = reservations.filter((r) => r.date === tomorrow);
  const weekReservations = reservations.filter((r) => r.date > tomorrow && r.date <= weekEnd);

  // Revenue stats (used by ReservationsList for per-reservation predictions)
  const { data: revenueStats } = useRevenueStats();
  const avgSpendPerCover = revenueStats?.avg_spend_per_cover;

  const totalTables = tables.length;
  const availableTables = tables.filter((t: { status: string }) => t.status === 'Available');

  // ---- Mutations ----
  const completeService = useCompleteService();

  // ---- Handlers ----
  const handleWalkInSuccess = (partyData: SeatModalData) => {
    maybeTrackFirstReservation();
    setSelectedParty(partyData);
    setShowWalkInModal(false);
    setShowSeatModal(true);
  };

  const handleCheckIn = (reservation: UpcomingReservation) => {
    setSelectedReservation(reservation);
    setShowCheckInModal(true);
  };

  const handleCheckInSuccess = (reservationData: SeatModalData) => {
    setSelectedReservation(reservationData as unknown as UpcomingReservation);
    setShowCheckInModal(false);
    setShowSeatModal(true);
  };

  const handleCompleteService = (party: ActiveParty, totalBill?: number) => {
    completeService.mutate({ serviceRecordId: party.service_id, totalBill });
  };

  const handleSeatFromWaitlist = (entry: { customer_name: string; customer_phone: string; party_size: number; special_requests?: string; id: string }) => {
    setSelectedParty({
      type: 'waitlist',
      customer_name: entry.customer_name,
      customer_phone: entry.customer_phone,
      party_size: entry.party_size,
      table_ids: [],
      special_requests: entry.special_requests,
      waitlist_entry_id: entry.id,
    });
    setShowSeatModal(true);
  };

  // ---- Modo Serviço (Palco à noite) ----
  const { isNight, toggle: toggleServiceMode } = useServiceMode();

  // ---- Subscription / trial ----
  const { isTrial, trialEnd, isActive, status: subStatus } = usePlanInfo();

  const trialDaysLeft = useMemo(() => {
    if (!isTrial || !trialEnd) return null;
    const end = new Date(trialEnd);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [isTrial, trialEnd]);

  // ---- Date display ----
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const fullDateStr = new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' });
  const compactDateStr = new Date().toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });

  // ---- Short date for header ----

  // ---- Computed metrics ----
  const waitlistReady = Number.isFinite(rawStats.waitlist_count);
  const waitlistCount: number = waitlistReady ? rawStats.waitlist_count : 0;
  const guestsExpected = todayReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);

  // ---- Progressive disclosure: detect if dashboard is mostly empty (new user) ----
  const hasReservations = todayReservations.length > 0 || tomorrowReservations.length > 0 || weekReservations.length > 0;
  const hasActiveParties = activeParties.length > 0;
  const isDashboardEmpty = waitlistReady && !hasReservations && !hasActiveParties && waitlistCount === 0;

  // ---- Error state ----
  if (isError && !isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="alert-circle" pxSize={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-red-900 mb-2">{t('dashboard.errorTitle')}</h3>
            <p className="text-sm text-red-700 mb-4">{t('errors.serverError')}</p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout mobileHeaderIntegrated appearance={isNight ? 'default' : 'hero'} darkMobileMenu={isNight}>
      <div className={`dashboard min-h-screen px-4 sm:px-6 lg:px-10 pt-5 lg:pt-9 pb-24 sm:pb-20 ${isNight ? 'service-mode' : 'bg-brand-paper font-brand text-brand-ink'}`}>
        <div className="mx-auto max-w-[1240px]">

          {/* ---- Payment Failure Banner ---- */}
          {subStatus === 'past_due' && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-6 sm:mb-8">
              <p className="text-sm text-red-800 flex-1 min-w-0">
                <span className="font-semibold">{t('dashboard.paymentFailed', 'Payment failed')}</span>
                {' — '}
                {t('dashboard.paymentFailedHint', 'Please update your payment method to keep your subscription active.')}
              </p>
              <a
                href="/subscription/manage"
                className="text-sm font-semibold text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-4 py-1.5 rounded-xl whitespace-nowrap transition-colors"
              >
                {t('dashboard.updatePayment', 'Update Payment')}
              </a>
            </div>
          )}

          {/* ---- Trial Banner ---- */}
          {/* The audit found the previous amber-on-amber strip read as a
              passive note rather than a time-bounded prompt. Promote the
              countdown into a glanceable widget: large day count + bold
              "Atualizar" pill, with urgency colours (burgundy when ≤2 days
              left, amber otherwise). The whole row remains a single banner —
              not a card — so it doesn't compete with the page header below. */}
          {isTrial && isActive && trialDaysLeft !== null && (() => {
            const urgent = trialDaysLeft <= 2;
            return (
              <div
                className={`rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 flex items-center gap-3 mb-6 sm:mb-8 ${
                  urgent
                    ? 'bg-burgundy/5 border border-burgundy/30'
                    : 'bg-amber-50 border border-amber-200'
                }`}
                role="status"
                aria-live="polite"
              >
                {/* Countdown badge — the headline number */}
                <div
                  className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg ${
                    urgent ? 'bg-burgundy text-white' : 'bg-amber-100 text-amber-900'
                  }`}
                  aria-hidden="true"
                >
                  <span className="text-xl font-bold leading-none">{trialDaysLeft}</span>
                  <span className="text-[10px] uppercase tracking-wider mt-0.5 font-semibold">
                    {trialDaysLeft === 1
                      ? t('dashboard.trialDayUnit', 'dia')
                      : t('dashboard.trialDaysUnit', 'dias')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${urgent ? 'text-burgundy-dark' : 'text-amber-900'}`}>
                    {trialDaysLeft === 0
                      ? t('dashboard.trialExpiresToday')
                      : t('dashboard.trialHeadline', 'Teste Gratuito termina em breve')}
                  </p>
                  <p className={`text-xs mt-0.5 ${urgent ? 'text-burgundy/80' : 'text-amber-700'}`}>
                    {t('dashboard.trialUpgradeHint')}
                  </p>
                </div>
                <a
                  href="/subscription/manage"
                  className={`flex-shrink-0 inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    urgent
                      ? 'bg-burgundy hover:bg-burgundy-dark text-white'
                      : 'bg-amber-700 hover:bg-amber-800 text-white'
                  }`}
                >
                  {t('dashboard.viewPlans')}
                </a>
              </div>
            );
          })()}

          {/* The floor is the main operational object; the facts above it
              describe the same service without shrinking the live map. */}
          <div className="mb-2 sm:mb-10">
            <header className="mb-4 flex flex-col gap-3 pb-4 sm:mb-5 sm:gap-4 sm:border-b sm:border-brand-line sm:pb-5 lg:mb-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
              <div className="min-w-0 pl-12 lg:pl-0">
                <p className={`mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.13em] ${isNight ? 'text-white/65' : 'text-brand-muted'}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                  {t('dashboard.live', 'Ao vivo')}
                  <span className="mx-1 h-3 w-px bg-brand-line" aria-hidden="true" />
                  <span className="normal-case tracking-normal min-[380px]:hidden">{compactDateStr}</span>
                  <span className="hidden normal-case tracking-normal min-[380px]:inline">{fullDateStr}</span>
                </p>
                <h1 className={`font-brand text-[36px] font-normal leading-[1.03] tracking-[-0.055em] sm:text-[48px] ${isNight ? 'text-white' : 'text-brand-ink'}`}>
                  {t('dashboard.serviceTitle', 'Today on the floor')}
                </h1>
                <div className="mt-2"><StripeConnectStatusBadge /></div>
              </div>
              <div className="flex w-full flex-nowrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
                <button
                  type="button"
                  onClick={toggleServiceMode}
                  aria-pressed={isNight}
                  aria-label={t('dashboard.serviceMode', 'Modo Serviço')}
                  className={`order-2 inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action lg:order-1 ${isNight ? 'border-white/25 text-white/80 hover:bg-white/10' : 'border-brand-line text-brand-ink hover:bg-brand-line/35'}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 13.2A8.5 8.5 0 0 1 10.8 3a8.5 8.5 0 1 0 10.2 10.2z" />
                  </svg>
                  {isNight && <span className="hidden sm:inline">{t('dashboard.serviceMode', 'Modo Serviço')}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/host-dashboard/reports')}
                  aria-label={t('dashboard.reports', 'Reports')}
                  className={`order-2 hidden min-h-[40px] min-w-[40px] items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action sm:inline-flex ${isNight ? 'border-white/25 text-white hover:bg-white/10' : 'border-brand-line text-brand-ink hover:bg-brand-line/35'}`}
                >
                  <ThiingsIcon name="bar-chart" pxSize={16} />
                  <span className="hidden sm:inline">{t('dashboard.reports', 'Reports')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(true)}
                  className={`order-1 min-h-[40px] rounded-full px-3 text-[12px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action sm:px-4 sm:text-[13px] lg:order-3 ${isNight ? 'bg-white text-brand-ink hover:bg-white/85' : 'bg-brand-action text-white hover:bg-brand-ink'}`}
                >
                  {t('dashboard.walkIn.actionShort', 'Add walk-in')}
                </button>
              </div>
            </header>

            <section aria-label={t('dashboard.quickStats', 'Quick stats')} className={`mb-3 grid grid-cols-4 border-y py-4 sm:mb-6 sm:py-5 ${isNight ? 'border-white/15' : 'border-brand-line'}`}>
              {[
                { value: todayReservations.length, label: t('dashboard.stats.reservationsShort', 'Bookings'), aria: t('dashboard.stats.reservations', 'Reservations') },
                { value: guestsExpected, label: t('dashboard.stats.guestsShort', 'Guests'), aria: t('dashboard.stats.guests', 'Guests') },
                { value: `${availableTables.length}/${totalTables}`, label: t('dashboard.stats.tablesShort', 'Free'), aria: t('dashboard.stats.tables', 'Tables Available') },
                { value: waitlistReady ? waitlistCount : '—', label: t('dashboard.stats.waitlistShort', 'Queue'), aria: t('waitlist.title', 'Waitlist') },
              ].map(({ value, label, aria }, index) => (
                <div key={aria} className={`min-w-0 px-2 sm:px-5 ${index === 0 ? 'pl-0' : 'border-l border-brand-line'} ${index === 3 ? 'pr-0' : ''}`}>
                  {isLoading
                    ? <div className="mb-2 h-9 w-14 animate-pulse rounded bg-brand-line/60" />
                    : <p className={`font-brand text-[27px] font-normal leading-none tracking-[-0.055em] tabular-nums sm:text-[39px] ${isNight ? 'text-white' : 'text-brand-ink'}`}>{value}</p>}
                  <p className={`mt-2 text-[11px] font-medium uppercase tracking-[0.07em] sm:text-[12px] ${isNight ? 'text-white/65' : 'text-brand-muted'}`} aria-label={aria}>{label}</p>
                </div>
              ))}
            </section>

            <div className="mb-5 px-1 sm:hidden">
              <TableTimeline
                tables={tables}
                activeParties={activeParties}
                todayReservations={todayReservations}
                night={isNight}
              />
            </div>

            <section className={`min-w-0 border ${hasPositionData(tables)
              ? isNight ? 'glass-panel rounded-[14px] border-white/15' : 'rounded-[14px] border-brand-line bg-brand-paper/55'
              : isNight ? 'border-x-0 border-white/15' : 'border-x-0 border-brand-line'}`}>
              <TableLayoutPanel
                tables={tables}
                activeParties={activeParties}
                onRefresh={refetch}
                isLoading={isLoading}
                night={isNight}
              />
            </section>
          </div>

          {/* Setup guidance follows the floor, where a new host can see what
              is configured before reading how live activity will appear. */}
          {isDashboardEmpty && !isLoading && (
            <div className="border-t hairline pt-3 pb-1 mb-6 sm:mb-10 text-sm text-stone-gray">
              <span className="font-semibold text-deep-charcoal">{t('dashboard.welcomeGuide.title', 'Your dashboard is ready!')}</span>
              {' '}{t('dashboard.welcomeGuide.description', 'Reservations, waitlist, and activity will appear here as your restaurant starts receiving guests. Add a walk-in or create a reservation to get started.')}
            </div>
          )}

          {/* Deposit payout setup stays visible, without displacing the
              operational floor from the first viewport. */}
          <StripeConnectNudgeBanner />

          {/* ---- A régua: essa mesa libera a tempo? ---- */}
          <div className="mb-12 hidden sm:mb-20 sm:block">
            <TableTimeline
              tables={tables}
              activeParties={activeParties}
              todayReservations={todayReservations}
              night={isNight}
            />
          </div>

          {/* ---- Reservations Section ---- */}
          <section id="reservations" className="mb-12 scroll-mt-6 sm:mb-20">
            <ReservationsList
              initialSearchQuery={reservationFocusId}
              todayReservations={todayReservations}
              tomorrowReservations={tomorrowReservations}
              weekReservations={weekReservations}
              onCheckIn={handleCheckIn}
              onIntervention={(r) => setInterventionReservation(r)}
              onAdd={() => setShowAddReservation(true)}
              onEdit={(r) => setEditReservation(r)}
              onCancel={(r) => setCancelReservation(r)}
              onRequestDeposit={(r) => setDepositRequestReservation(r)}
              onCustomerClick={(r) => setSelectedCustomer(r)}
              avgSpendPerCover={avgSpendPerCover}
              byPartySize={revenueStats?.by_party_size}
              isLoading={isLoading}
              language={i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es' : 'en'}
              tables={tables}
            />
          </section>

          {/* ---- Fila + Na casa agora — listas no canvas, sem cards ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <section>
              <WaitlistPanel onSeatNow={handleSeatFromWaitlist} />
            </section>

            <section>
              <ActivePartiesPanel
                parties={activeParties}
                onCompleteService={handleCompleteService}
                isLoading={isLoading}
              />
            </section>
          </div>

          <div className="mt-10 sm:mt-16 mb-8 sm:mb-12" />

          {/* ---- Additional Widgets (progressive disclosure for new users) ---- */}
          {isDashboardEmpty && !showInsightsWidgets ? (
            <div className="text-center py-6">
              <button
                type="button"
                onClick={() => setShowInsightsWidgets(true)}
                className="text-sm text-muted-stone hover:text-deep-charcoal transition-colors inline-flex items-center gap-2"
              >
                <ThiingsIcon name="chevron-down" pxSize={14} />
                {t('dashboard.showInsights', 'Show analytics & insights')}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                <ManagerNotesPanel />
                <RevenueByPartySizeWidget />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
                <StaffingForecastWidget />
                <RevenueStatsWidget />
              </div>
              <div className="mt-6 sm:mt-8">
                <ProactiveCommsPanel />
              </div>
            </>
          )}

        </div>

      </div>

      {/* ---- Modals ---- */}
      {showWalkInModal && (
        <WalkInModal
          isOpen={showWalkInModal}
          onClose={() => setShowWalkInModal(false)}
          onSuccess={handleWalkInSuccess}
          availableTables={availableTables}
        />
      )}

      {showCheckInModal && selectedReservation && (
        <CheckInModal
          isOpen={showCheckInModal}
          reservation={selectedReservation}
          onClose={() => {
            setShowCheckInModal(false);
            setSelectedReservation(null);
          }}
          onSuccess={handleCheckInSuccess}
          availableTables={availableTables}
        />
      )}

      {showSeatModal && (selectedParty || selectedReservation) && (
        <SeatPartyModal
          isOpen={showSeatModal}
          data={(selectedParty || selectedReservation) as SeatModalData | null}
          onClose={() => {
            setShowSeatModal(false);
            setSelectedParty(null);
            setSelectedReservation(null);
            refetch();
          }}
        />
      )}

      {interventionReservation && (
        <QuickInterventionModal
          reservation={interventionReservation}
          isOpen={!!interventionReservation}
          onClose={() => setInterventionReservation(null)}
          onSuccess={() => {
            setInterventionReservation(null);
            refetch();
          }}
          language={i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es' : 'en'}
        />
      )}

      {showAddReservation && (
        <AddReservationModal
          isOpen={showAddReservation}
          onClose={() => setShowAddReservation(false)}
        />
      )}

      {editReservation && (
        <EditReservationModal
          isOpen={!!editReservation}
          reservation={editReservation}
          onClose={() => setEditReservation(null)}
        />
      )}

      {cancelReservation && (
        <CancelReservationDialog
          isOpen={!!cancelReservation}
          reservation={cancelReservation}
          onClose={() => setCancelReservation(null)}
        />
      )}

      {/* AA.5 — deposit-suggest chip opens this. Generates a Stripe Checkout
          URL via /api/request-deposit-link and surfaces copy / WhatsApp
          share buttons. AA.6 — onLinkGenerated triggers a dashboard
          refetch so the suggest chip disappears in this render cycle
          (the endpoint atomically wrote deposit_payment_intent_id onto
          the reservation before returning). */}
      <DepositRequestModal
        open={!!depositRequestReservation}
        reservation={depositRequestReservation}
        onClose={() => setDepositRequestReservation(null)}
        onLinkGenerated={() => refetch()}
      />

      <CustomerProfileDrawer
        reservation={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />

      {showLaunchChecklist && (
        <LaunchChecklistModal
          bookingSlug={restaurantSlug}
          onDismiss={() => setShowLaunchChecklist(false)}
        />
      )}

    </DashboardLayout>
  );
}
