import { useState, useMemo, useRef } from 'react';
import { Link, useSearchParams, useParams, useLocation } from 'react-router-dom';
import DemoSlideIn from '../landing/components/DemoSlideIn';
import DemoSidebar from '../components/demo/DemoSidebar';
import DemoTablesGrid from '../components/demo/DemoTablesGrid';
import DemoWhatsAppSim from '../components/demo/DemoWhatsAppSim';
import DemoAnalyticsPanel from '../components/demo/DemoAnalyticsPanel';
import DemoRestaurantInfoCard from '../components/demo/DemoRestaurantInfoCard';
import RealRestaurantCard, { type ScrapedRestaurantData } from '../components/demo/RealRestaurantCard';
import ThiingsIcon from '../components/common/ThiingsIcon';
import StatsBar from '../components/dashboard/StatsBar';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import DemoWaitlistPanel from '../components/demo/DemoWaitlistPanel';
import DemoAIInsightsBar from '../components/demo/DemoAIInsightsBar';
import CustomerProfileDrawer from '../components/dashboard/CustomerProfileDrawer';
import { useDemoState } from '../hooks/useDemoState';
import { useDemoLocale } from '../hooks/useDemoLocale';
import { useDemoSession } from '../hooks/useDemoSession';
import { useExitIntent } from '../hooks/useExitIntent';
import { DEMO_PRESETS } from '../data/demoPresets';
import { trackDemoFunnel } from '../lib/analytics';
import type { UpcomingReservation, ActiveParty } from '../types/host.types';

// Map DB table rows to the shape useDemoState expects
function mapApiTables(apiTables: Array<{ id: string; table_number: number; capacity: number; status: string; location: string }>) {
  return apiTables.map(t => ({
    id: t.id,
    table_number: String(t.table_number),
    capacity: t.capacity,
    status: (t.status === 'occupied' ? 'Occupied' : t.status === 'reserved' ? 'Reserved' : 'Available') as 'Available' | 'Occupied' | 'Reserved',
    location: t.location ? t.location.charAt(0).toUpperCase() + t.location.slice(1) : 'Indoor',
  }));
}

// Cuisine type display map
const CUISINE_DISPLAY: Record<string, string> = {
  fine_dining: 'Fine Dining', casual_dining: 'Casual Dining', fast_casual: 'Fast Casual',
  cafe: 'Café', bar: 'Bar', steakhouse: 'Steakhouse', italian: 'Italiana',
  japanese: 'Japonesa', mexican: 'Mexicana', other: 'Restaurante',
};

export default function DemoDashboard() {
  const [searchParams] = useSearchParams();
  const { token: pathToken } = useParams<{ token?: string }>();
  const location = useLocation();
  // Real Google Places data — first checked from router state (fastest, set
  // when arriving from /demo/setup) then falls back to the persisted JSONB
  // column returned by the session API. This means the wow card survives
  // page refreshes and deep-links from email.
  const stateScrapedData = (location.state as { scraped_data?: ScrapedRestaurantData } | null)?.scraped_data ?? null;
  const presetKey = searchParams.get('preset') || undefined;
  const demoToken = searchParams.get('token') || pathToken || undefined;
  const isEmbed = searchParams.get('embed') === 'true';

  // Fetch personalized demo from API when token is present
  const { data: tokenSession, isLoading: tokenLoading, isError: tokenError } = useDemoSession(demoToken);

  // Composite resolver: prefer fresh router state, fall back to DB-persisted
  // payload from session API. Both have the same ScrapedRestaurantData shape.
  const realScrapedData = stateScrapedData ?? tokenSession?.restaurant?.scraped_data ?? null;

  // Build override data from API response
  const overrideData = useMemo(() => {
    if (!tokenSession) return undefined;
    return {
      tables: tokenSession.tables ? mapApiTables(tokenSession.tables as never[]) : undefined,
      reservations: tokenSession.reservations || undefined,
      isTokenDemo: true,
    };
  }, [tokenSession]);

  const demo = useDemoState(presetKey, overrideData);
  const { t, dateLocale, lang, setLang, showLangPopup, dismissPopup } = useDemoLocale();
  const presetInfo = presetKey ? DEMO_PRESETS[presetKey]?.info : undefined;

  // Override restaurant identity when using token-based demo
  const restaurantName = tokenSession?.restaurant?.restaurant_name || t.restaurantName;
  const cuisineLabel = tokenSession?.restaurant?.restaurant_type
    ? (CUISINE_DISPLAY[tokenSession.restaurant.restaurant_type] || tokenSession.restaurant.restaurant_type)
    : t.cuisine;
  const neighborhoodLabel = tokenSession?.restaurant?.city || t.neighborhood;

  const hasTrackedInteraction = useRef(false);

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'tables' | 'whatsapp' | 'manager-ai' | 'analytics'>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isEmbed);
  const [selectedCustomer, setSelectedCustomer] = useState<UpcomingReservation | null>(null);
  const { showPopup: showExitPopup, dismiss: dismissExitPopup } = useExitIntent();

  // Walk-in form state
  const [walkInForm, setWalkInForm] = useState({
    customer_name: '',
    customer_phone: '',
    party_size: '',
  });

  const dayName = new Date().toLocaleDateString(dateLocale, { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });

  // ---- Handlers ----
  const handleCancelReservation = (reservation: UpcomingReservation) => {
    demo.cancelReservation(reservation.reservation_id);
  };

  const handleCheckIn = (reservation: UpcomingReservation) => {
    const available = demo.tables.find(
      (tbl) => tbl.status === 'Available' && tbl.capacity >= reservation.party_size,
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

  const handleCompleteService = (party: ActiveParty, billAmount?: number) => {
    demo.completeService(party.service_id, billAmount);
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
      <DemoSidebar
        lang={lang}
        activeView={activeView}
        onNavigate={(v) => {
          setActiveView(v as typeof activeView);
          if (!hasTrackedInteraction.current) {
            hasTrackedInteraction.current = true;
            trackDemoFunnel({ step: 'demo_interacted', preset: presetKey });
          }
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />

      {/* Language Popup */}
      {!isEmbed && showLangPopup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-lg border border-border-gray p-6 max-w-sm w-full text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-burgundy/10 flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="globe" pxSize={24} className="text-burgundy" />
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-1">
              {t.langPopupTitle}
            </h3>
            <p className="text-sm text-stone-gray mb-5">
              {t.langPopupDesc}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setLang('en')}
                className="w-full px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {t.langSwitchYes}
              </button>
              <button
                type="button"
                onClick={dismissPopup}
                className="w-full px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors text-sm"
              >
                {t.langKeepEn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Banner — hidden in embed mode */}
      {!isEmbed && (
        <div className={`bg-gradient-to-r from-burgundy to-burgundy-dark text-white ${sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[220px]'} transition-all duration-300`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <ThiingsIcon name="sparkles" pxSize={12} className="text-white" />
              </div>
              <p className="text-sm font-medium">{t.banner}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLang(lang === 'en' ? 'es' : lang === 'es' ? 'pt-BR' : 'en')}
                className="text-xs font-medium text-white/70 hover:text-white transition-colors flex items-center gap-1.5"
                aria-label={t.toggleLanguage}
              >
                <ThiingsIcon name="globe" pxSize={12} className="text-white/70" />
                {lang === 'en' ? 'EN' : lang === 'es' ? 'ES' : 'PT'}
              </button>
              <Link
                to="/"
                className="text-xs font-semibold text-white/80 hover:text-white underline underline-offset-2 transition-colors"
              >
                {t.backToHome}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Loading state for token-based demos */}
      {demoToken && tokenLoading && (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-burgundy border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-warm-stone text-sm">{t.loadingDemo}</p>
          </div>
        </div>
      )}

      {/* Invalid/expired demo token — the previous version silently fell back
          to the default preset, so a user with a broken link saw a generic
          demo and never knew their personalised one had failed to load. */}
      {demoToken && tokenError && !tokenLoading && (
        <div className={`${sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[220px]'} px-4 sm:px-8 pt-4 transition-all duration-300`}>
          <div className="max-w-7xl mx-auto bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">{t.tokenErrorTitle}</p>
              <p className="text-xs text-amber-800 mt-0.5">{t.tokenErrorBody}</p>
            </div>
            <Link
              to="/demo/setup"
              className="px-4 py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {t.createNewDemo}
            </Link>
          </div>
        </div>
      )}

      {/* Page content */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-8 py-8 pb-24 sm:pb-8 space-y-8 ${sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[220px]'} transition-all duration-300 ${demoToken && tokenLoading ? 'hidden' : ''}`}>
        {/* View: Tables Grid */}
        {activeView === 'tables' && (
          <DemoTablesGrid tables={demo.tables} lang={lang} />
        )}

        {/* View: WhatsApp Simulator */}
        {activeView === 'whatsapp' && (
          <DemoWhatsAppSim restaurantName={restaurantName} lang={lang} />
        )}

        {/* View: Manager AI — full-page chat */}
        {activeView === 'manager-ai' && (
          <div className="space-y-4">
            <div>
              <h1 className="font-serif text-[22px] font-bold text-stone-900 tracking-tight">{restaurantName}</h1>
              <p className="text-stone-500 text-[13px] mt-0.5">
                {lang === 'es' ? 'IA del Gerente' : lang === 'pt-BR' ? 'IA do Gerente' : 'Manager AI'}
              </p>
            </div>
            <DemoAIInsightsBar
              restaurantName={restaurantName}
              occupiedTables={demo.stats.occupiedTables}
              totalTables={demo.stats.totalTables}
              reservationsToday={demo.stats.reservationsToday}
              waitlistCount={demo.stats.waitlistCount}
              totalGuests={demo.stats.totalGuests}
              completedCount={demo.stats.completedCount}
              totalRevenue={demo.stats.totalRevenue}
              lang={lang}
              presetKey={presetKey}
            />
          </div>
        )}

        {/* View: Analytics */}
        {activeView === 'analytics' && (
          <DemoAnalyticsPanel
            restaurantName={restaurantName}
            lang={lang}
            presetKey={presetKey}
          />
        )}

        {/* View: Dashboard (default) */}
        {activeView !== 'tables' && activeView !== 'whatsapp' && activeView !== 'manager-ai' && activeView !== 'analytics' && (<>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="font-serif text-[22px] font-bold text-stone-900 tracking-tight">
                {restaurantName}
              </h1>
              <span className="text-stone-400 text-sm font-light">
                &mdash; {cuisineLabel} &middot; {neighborhoodLabel}
              </span>
            </div>
            <p className="text-stone-500 text-[13px] mt-0.5">{dayName}, {dateStr}</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowWalkInModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white rounded-lg text-sm font-semibold transition-all"
            >
              <ThiingsIcon name="plus" pxSize={14} />
              {t.addWalkIn}
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
          predictedRevenue={demo.stats.totalRevenue > 0 ? demo.stats.totalRevenue : undefined}
          isLoading={false}
        />

        {/* Real Google Places data card — only for users who came through
            /demo/setup with a real scrape. Falls back to preset info for
            users hitting hardcoded preset URLs (e.g. /demo?preset=italian). */}
        {realScrapedData ? (
          <RealRestaurantCard
            data={realScrapedData}
            onConversionClick={() => trackDemoFunnel({ step: 'signup_started', preset: presetKey })}
          />
        ) : presetInfo && (
          <DemoRestaurantInfoCard info={presetInfo} lang={lang} />
        )}

        {/* AI Insights Bar */}
        <DemoAIInsightsBar
          restaurantName={restaurantName}
          occupiedTables={demo.stats.occupiedTables}
          totalTables={demo.stats.totalTables}
          reservationsToday={demo.stats.reservationsToday}
          waitlistCount={demo.stats.waitlistCount}
          totalGuests={demo.stats.totalGuests}
          completedCount={demo.stats.completedCount}
          totalRevenue={demo.stats.totalRevenue}
          lang={lang}
          presetKey={presetKey}
        />

        {/* Main Content: Unified container with 2px dividers */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
          {/* Left Column: Reservations — spans all right-column rows */}
          <div className="space-y-6">
            <ReservationsList
              todayReservations={demo.todayReservations}
              tomorrowReservations={demo.tomorrowReservations}
              onCheckIn={handleCheckIn}
              onCancel={handleCancelReservation}
              onIntervention={() => {}}
              onCustomerClick={setSelectedCustomer}
              isLoading={false}
              language={lang as 'en' | 'es' | 'pt-BR'}
            />
          </div>

          {/* Right Column: Waitlist */}
          <div>
            <DemoWaitlistPanel
              entries={demo.waitlist}
              onSeat={handleSeatFromWaitlist}
              lang={lang}
            />
          </div>

          {/* Right Column: Active Parties */}
          <div>
            <ActivePartiesPanel
              parties={demo.activeParties}
              onCompleteService={handleCompleteService}
              isLoading={false}
            />
          </div>

        </div>

        {/* Footer CTA — hidden inside embed (landing page has its own CTA below the iframe) */}
        {!isEmbed && (
          <div className="bg-stone-900 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-white text-2xl font-serif font-bold mb-2">{t.readyToGoLive}</h2>
              <p className="text-stone-400 text-sm">{t.setupYourOwn}</p>
            </div>
            <Link
              to="/login"
              onClick={() => trackDemoFunnel({ step: 'signup_started', preset: presetKey })}
              className="px-8 py-3.5 bg-burgundy text-white rounded-full font-bold text-sm hover:bg-burgundy-dark transition-all"
            >
              {t.getStartedFree}
            </Link>
          </div>
        )}
      </>)}
      </div>

      {/* FAB: Add Walk-in (only on dashboard and tables views) */}
      {(activeView === 'dashboard' || activeView === 'tables') && (
        <button
          type="button"
          onClick={() => setShowWalkInModal(true)}
          aria-label={t.addWalkIn}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 w-14 h-14 bg-deep-charcoal hover:bg-charcoal-dark hover:scale-105 active:scale-95 text-white rounded-full shadow-xl shadow-black/20 transition-all duration-200 flex items-center justify-center"
        >
          <ThiingsIcon name="plus" pxSize={24} />
        </button>
      )}

      {/* Exit Intent Popup */}
      {!isEmbed && showExitPopup && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          onClick={(e) => { if (e.target === e.currentTarget) dismissExitPopup(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.exitTitle}
            className="bg-white rounded-lg shadow-lg border border-border-gray p-6 max-w-sm w-full text-center animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="w-14 h-14 rounded-2xl bg-burgundy/10 flex items-center justify-center mx-auto mb-4">
              <ThiingsIcon name="star" pxSize={28} className="text-burgundy" />
            </div>
            <h3 className="text-lg font-bold text-deep-charcoal mb-2">
              {t.exitTitle}
            </h3>
            <p className="text-sm text-stone-gray mb-6 leading-relaxed">
              {t.exitMessage}
            </p>
            <div className="flex flex-col gap-2.5">
              <Link
                to="/login"
                className="w-full px-4 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                <ThiingsIcon name="star" pxSize={16} className="text-white" />
                {t.exitTrialCTA}
              </Link>
              <button
                type="button"
                onClick={dismissExitPopup}
                className="w-full px-4 py-3 border border-border-gray text-stone-gray font-medium rounded-xl hover:bg-soft-gray transition-colors text-sm"
              >
                {t.exitContinue}
              </button>
            </div>
          </div>
        </div>
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
            aria-label={t.walkInTitle}
            className="bg-white rounded-lg shadow-lg border border-border-gray p-6 max-w-md w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-deep-charcoal">{t.walkInTitle}</h2>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                aria-label={t.close}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
              >
                <ThiingsIcon name="close" pxSize={16} />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  {t.guestName} *
                </label>
                <input
                  type="text"
                  required
                  value={walkInForm.customer_name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, customer_name: e.target.value })}
                  placeholder={t.namePlaceholder}
                  className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  {t.phone}
                </label>
                <input
                  type="tel"
                  value={walkInForm.customer_phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, customer_phone: e.target.value })}
                  placeholder={t.phonePlaceholder}
                  className="w-full px-4 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-deep-charcoal mb-1">
                  {t.partySize} *
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
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-burgundy text-white font-medium rounded-xl hover:bg-burgundy-dark transition-colors"
                >
                  {t.seatGuest}
                </button>
              </div>

              {demo.tables.filter((tbl) => tbl.status === 'Available').length === 0 && (
                <p className="text-xs text-amber-600 text-center">
                  {t.noTablesAvailable}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Conversion nudge — appears after 60s (hidden for personalized outreach demos and embed mode) */}
      {!demoToken && !isEmbed && <DemoSlideIn />}

      {/* Customer Profile Drawer */}
      <CustomerProfileDrawer
        reservation={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}
