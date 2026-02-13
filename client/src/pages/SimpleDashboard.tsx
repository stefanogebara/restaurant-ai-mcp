import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostAPI, authFetch } from '../services/api';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import QuickInterventionModal from '../components/host/QuickInterventionModal';
import WaitlistPanel from '../components/host/WaitlistPanel';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatsBar from '../components/dashboard/StatsBar';
import ReservationsList from '../components/dashboard/ReservationsList';
import ActivePartiesPanel from '../components/dashboard/ActivePartiesPanel';
import TableLayoutPanel from '../components/dashboard/TableLayoutPanel';
import { useRealtimeDashboard } from '../hooks/useRealtimeSubscription';

type Language = 'en' | 'es';

interface SimpleDashboardProps {
  language?: Language;
}

const translations = {
  en: {
    today: 'Today',
    aiAgent: 'AI Agent',
    tables: 'Tables',
    en: 'EN',
    es: 'ES',
    bookingLink: 'Your Booking Link',
    copy: 'Copy',
    linkCopied: 'Link copied to clipboard',
    errorLoading: 'Error loading data',
    errorMessage: 'Could not connect to the server. Please try again.',
    retry: 'Retry',
    completeService: 'Complete Service',
    confirmComplete: 'Confirm that the service is complete? Tables will be marked as available.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    guests: 'guests',
    table: 'Table',
    serviceCompleted: 'Service completed successfully',
    serviceError: 'Error completing service',
    interventionLogged: 'Intervention logged',
  },
  es: {
    today: 'Hoy',
    aiAgent: 'Agente AI',
    tables: 'Mesas',
    en: 'EN',
    es: 'ES',
    bookingLink: 'Tu Enlace de Reservas',
    copy: 'Copiar',
    linkCopied: 'Enlace copiado al portapapeles',
    errorLoading: 'Error al cargar datos',
    errorMessage: 'No se pudo conectar con el servidor. Por favor, intenta de nuevo.',
    retry: 'Reintentar',
    completeService: 'Completar Servicio',
    confirmComplete: '¿Confirmas que el servicio ha finalizado? Las mesas serán marcadas como disponibles.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    guests: 'personas',
    table: 'Mesa',
    serviceCompleted: 'Servicio completado exitosamente',
    serviceError: 'Error al completar servicio',
    interventionLogged: 'Intervención registrada',
  },
};

export default function SimpleDashboard({ language: initialLanguage = 'en' }: SimpleDashboardProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [showCompleteServiceModal, setShowCompleteServiceModal] = useState(false);
  const [selectedServiceToComplete, setSelectedServiceToComplete] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [interventionReservation, setInterventionReservation] = useState<any>(null);
  const [showFabPulse, setShowFabPulse] = useState(true);

  const t = translations[language];

  // Stop FAB pulse animation after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowFabPulse(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Load language preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-language');
    if (saved && (saved === 'en' || saved === 'es')) {
      setLanguage(saved);
      return;
    }
    // Reset non-EN/ES saved language
    if (saved) {
      localStorage.setItem('dashboard-language', 'en');
      setLanguage('en');
      return;
    }
    // Detect from onboarding country
    try {
      const onboardingData = localStorage.getItem('onboarding_data');
      if (onboardingData) {
        const data = JSON.parse(onboardingData);
        const countryLang = data?.country_language || data?.profile_data?.language;
        if (countryLang?.startsWith('es')) {
          setLanguage('es');
          localStorage.setItem('dashboard-language', 'es');
        }
      }
    } catch { /* default to en */ }
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('dashboard-language', lang);
  };

  // Fetch dashboard data
  const { data: dashboardData, refetch, isLoading, isError } = useQuery({
    queryKey: ['simpleDashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 120000,
  });

  // Real-time updates
  useRealtimeDashboard(dashboardData?.data?.restaurant_id);

  // Derived data
  const rawStats = dashboardData?.data?.summary || {};
  const tables = dashboardData?.data?.tables || [];
  const reservations = dashboardData?.data?.upcoming_reservations || [];
  const activeParties = dashboardData?.data?.active_parties || [];

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const todayReservations = reservations.filter((r: any) => r.date === today);
  const tomorrowReservations = reservations.filter((r: any) => r.date === tomorrow);

  const occupiedTables = tables.filter((t: any) => t.status === 'Occupied').length;
  const totalGuests = activeParties.reduce((sum: number, p: any) => sum + (p.party_size || 0), 0);
  const availableTables = tables.filter((t: any) => t.status === 'Available');

  // Day/date formatting
  const dayNames = language === 'es'
    ? ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = language === 'es'
    ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const dayName = dayNames[now.getDay()];
  const dateStr = `${now.getDate()} ${monthNames[now.getMonth()]}`;

  // Handlers
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

  const handleCompleteService = async (serviceId: string) => {
    try {
      const response = await authFetch('/api/host-dashboard?action=complete-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_record_id: serviceId }),
      });
      if (response.ok) {
        setToast({ message: t.serviceCompleted, type: 'success' });
        refetch();
        setShowCompleteServiceModal(false);
        setSelectedServiceToComplete(null);
      } else {
        throw new Error('Failed');
      }
    } catch {
      setToast({ message: t.serviceError, type: 'error' });
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#FAFAF9] p-3 sm:p-4 md:p-6 lg:p-8 pb-28 sm:pb-20">
        <div className="max-w-7xl mx-auto">

          {/* Loading State */}
          {isLoading && (
            <div className="animate-fade-in-up space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <div className="h-8 w-48 bg-[#E7E5E4] rounded-lg animate-pulse mb-2" />
                  <div className="h-4 w-32 bg-[#F5F5F4] rounded animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-10 w-24 bg-[#E7E5E4] rounded-xl animate-pulse" />
                  <div className="h-10 w-20 bg-[#E7E5E4] rounded-xl animate-pulse" />
                </div>
              </div>
              <StatsBar
                occupiedTables={0} totalTables={0} reservationsToday={0}
                seatedReservations={0} waitlistCount={0} activeParties={0}
                totalGuests={0} language={language} isLoading
              />
            </div>
          )}

          {/* Error State */}
          {isError && !isLoading && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-red-900 mb-2">{t.errorLoading}</h3>
                <p className="text-sm text-red-700 mb-4">{t.errorMessage}</p>
                <button
                  onClick={() => refetch()}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg"
                >
                  {t.retry}
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          {!isLoading && !isError && (
            <div>
              {/* Header */}
              <div className="mb-8 md:mb-10 animate-fade-in-up">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                  <div className="pl-12 sm:pl-0">
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-[#1C1917] tracking-tight mb-1">
                      {t.today}
                    </h1>
                    <p className="text-[#57534E] text-base md:text-lg font-sans font-medium">
                      {dayName}, {dateStr}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Language Switcher */}
                    <div className="flex items-center gap-1 bg-white border border-[#E7E5E4] rounded-xl p-1 sm:p-1.5 shadow-md">
                      {(['en', 'es'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => handleLanguageChange(lang)}
                          className={`min-h-[44px] min-w-[44px] flex items-center justify-center px-2 sm:px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-colors duration-200 ${
                            language === lang
                              ? 'bg-[#9F1239] text-white shadow-sm'
                              : 'text-[#57534E] hover:bg-[#F5F5F4] hover:text-[#1C1917]'
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* AI Agent Button */}
                    <button
                      onClick={() => window.location.href = '/host-dashboard/calls'}
                      className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-xl text-sm font-sans font-semibold transition-all shadow-md hover:shadow-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="hidden sm:inline">{t.aiAgent}</span>
                    </button>

                    {/* Table Config Button */}
                    <button
                      onClick={() => window.location.href = '/host-dashboard/tables'}
                      className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 py-2 bg-white border border-[#E7E5E4] hover:bg-[#F5F5F4] text-[#57534E] rounded-xl text-sm font-sans font-semibold transition-all shadow-md hover:shadow-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="hidden sm:inline">{t.tables}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="mb-8">
                <StatsBar
                  occupiedTables={occupiedTables}
                  totalTables={tables.length}
                  reservationsToday={todayReservations.length}
                  seatedReservations={todayReservations.filter((r: any) => r.checked_in).length}
                  waitlistCount={rawStats.waitlist_count || 0}
                  estimatedWaitTime={rawStats.estimated_wait_time}
                  activeParties={rawStats.active_parties || 0}
                  totalGuests={totalGuests}
                  language={language}
                />
              </div>

              {/* Booking Link Card */}
              {dashboardData?.data?.slug && (
                <div className="mb-6 animate-fade-in-up">
                  <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-[#9F1239]/10 rounded-lg shrink-0">
                        <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#57534E] mb-0.5">{t.bookingLink}</div>
                        <div className="text-sm font-medium text-[#9F1239] truncate">
                          {`https://restaurant-ai-mcp.vercel.app/book/${dashboardData.data.slug}`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://restaurant-ai-mcp.vercel.app/book/${dashboardData.data.slug}`);
                        setToast({ message: t.linkCopied, type: 'success' });
                      }}
                      className="shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      {t.copy}
                    </button>
                  </div>
                </div>
              )}

              {/* FAB - Add Walk-in */}
              <button
                onClick={() => setShowWalkInModal(true)}
                className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 group"
              >
                <div className="absolute inset-0 bg-[#9F1239]/20 rounded-full blur-xl group-hover:bg-[#9F1239]/30 transition-all duration-500 scale-150" />
                <div className="relative flex items-center gap-3 bg-gradient-to-r from-[#9F1239] to-[#be185d] text-white pl-4 pr-4 group-hover:pr-6 py-4 rounded-full shadow-lg shadow-[#9F1239]/30 hover:shadow-xl hover:shadow-[#9F1239]/40 transition-all duration-300 transform hover:scale-105 min-h-[56px] min-w-[56px] justify-center">
                  <div className="relative w-8 h-8 flex items-center justify-center">
                    <div className="absolute w-6 h-0.5 bg-white rounded-full group-hover:rotate-180 transition-transform duration-300" />
                    <div className="absolute w-0.5 h-6 bg-white rounded-full group-hover:rotate-180 transition-transform duration-300" />
                  </div>
                  <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-[120px] transition-all duration-300 ease-out font-semibold text-sm tracking-wide">
                    Walk-in
                  </span>
                </div>
                {showFabPulse && (
                  <div className="absolute inset-0 rounded-full border-2 border-[#9F1239]/50 animate-ping opacity-75" style={{ animationDuration: '2s' }} />
                )}
              </button>

              {/* Main Panels */}
              <div className="space-y-6 mb-8">
                <TableLayoutPanel
                  tables={tables}
                  activeParties={activeParties}
                  onRefresh={refetch}
                  onToast={showToast}
                  language={language}
                />

                <ActivePartiesPanel
                  parties={activeParties}
                  onCompleteService={(party) => {
                    setSelectedServiceToComplete(party);
                    setShowCompleteServiceModal(true);
                  }}
                  language={language}
                />

                <WaitlistPanel
                  restaurantId={dashboardData?.data?.restaurant_id}
                  onSeatNow={(entry) => {
                    setSelectedParty({
                      customer_name: entry.customer_name,
                      customer_phone: entry.customer_phone,
                      party_size: entry.party_size,
                      special_requests: entry.special_requests,
                      waitlist_entry_id: entry.id,
                    });
                    setShowSeatModal(true);
                  }}
                />
              </div>

              {/* Reservations */}
              <ReservationsList
                todayReservations={todayReservations}
                tomorrowReservations={tomorrowReservations}
                onCheckIn={(reservation) => {
                  setSelectedReservation(reservation);
                  setShowCheckInModal(true);
                }}
                onIntervention={(reservation) => setInterventionReservation(reservation)}
                language={language}
              />
            </div>
          )}
        </div>

        {/* Modals */}
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
            onClose={() => { setShowCheckInModal(false); setSelectedReservation(null); }}
            onSuccess={handleCheckInSuccess}
            availableTables={availableTables}
          />
        )}

        {showSeatModal && (selectedParty || selectedReservation) && (
          <SeatPartyModal
            isOpen={showSeatModal}
            data={selectedParty || selectedReservation}
            onClose={() => { setShowSeatModal(false); setSelectedParty(null); setSelectedReservation(null); refetch(); }}
          />
        )}

        {interventionReservation && (
          <QuickInterventionModal
            reservation={interventionReservation}
            isOpen={!!interventionReservation}
            onClose={() => setInterventionReservation(null)}
            onSuccess={() => { setToast({ message: t.interventionLogged, type: 'success' }); refetch(); }}
            language={language}
          />
        )}

        {/* Complete Service Confirmation Modal */}
        {showCompleteServiceModal && selectedServiceToComplete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-[#1C1917]">{t.completeService}</h3>
                </div>
                <button
                  onClick={() => { setShowCompleteServiceModal(false); setSelectedServiceToComplete(null); }}
                  className="text-[#A8A29E] hover:text-[#57534E] transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-6 p-4 bg-[#F5F5F4] rounded-xl border border-[#E7E5E4]">
                <div className="font-semibold text-[#1C1917] mb-2">{selectedServiceToComplete.customer_name}</div>
                <div className="space-y-1 text-sm text-[#57534E]">
                  <div>{selectedServiceToComplete.party_size} {t.guests}</div>
                  <div>{t.table} {selectedServiceToComplete.tables?.join(', ')}</div>
                </div>
              </div>

              <p className="text-[#57534E] text-sm mb-6">{t.confirmComplete}</p>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCompleteServiceModal(false); setSelectedServiceToComplete(null); }}
                  className="flex-1 px-4 py-3 min-h-[44px] bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#57534E] font-semibold rounded-xl transition-all"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={() => handleCompleteService(selectedServiceToComplete.service_id)}
                  className="flex-1 px-4 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                  {t.confirm}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[60] animate-slide-up">
            <div className={`px-4 sm:px-6 py-3 sm:py-4 rounded-xl shadow-2xl border-2 ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-500 text-green-900'
                : 'bg-red-50 border-red-500 text-red-900'
            }`}>
              <div className="flex items-center gap-3">
                {toast.type === 'success' ? (
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="font-semibold">{toast.message}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
