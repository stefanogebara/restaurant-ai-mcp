import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import TableGrid from '../components/host/TableGrid';
import TableStatusLegend from '../components/host/TableStatusLegend';
import type { PlanType } from '../config/planFeatures';
import { hasFeatureAccess, PLAN_NAMES } from '../config/planFeatures';
import { useSubscription } from '../hooks/useSubscription';
import '../landing/styles/glass-morphism.css';

type ComplexityLevel = 'completo' | 'avanzado';

interface SimpleDashboardProps {
  language?: 'es' | 'en';
}

export default function SimpleDashboard({ language: initialLanguage = 'en' }: SimpleDashboardProps) {
  const [complexity, setComplexity] = useState<ComplexityLevel>('completo');
  const [language, setLanguage] = useState<'es' | 'en'>(initialLanguage);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [showTableActionsModal, setShowTableActionsModal] = useState(false);
  const [showCompleteServiceModal, setShowCompleteServiceModal] = useState(false);
  const [selectedServiceToComplete, setSelectedServiceToComplete] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Get real subscription plan from API
  const subscription = useSubscription();
  const currentPlan = (subscription.data?.subscription?.plan?.toLowerCase() as PlanType) || 'basic';

  // Load complexity preference from localStorage
  useEffect(() => {
    // First priority: Explicit dashboard complexity preference
    const saved = localStorage.getItem('dashboard-complexity');
    if (saved && ['completo', 'avanzado'].includes(saved)) {
      setComplexity(saved as ComplexityLevel);
      return;
    }

    // Second priority: Onboarding template preference
    try {
      const onboardingData = localStorage.getItem('onboarding_data');
      if (onboardingData) {
        const data = JSON.parse(onboardingData);
        const template = data?.profile_data?.template;

        // Map onboarding template to complexity level
        const templateMap: Record<string, ComplexityLevel> = {
          'simple': 'completo',    // Map 'simple' to 'completo' (was 'estándar')
          'balanced': 'completo',
          'advanced': 'avanzado',
        };

        if (template && templateMap[template]) {
          setComplexity(templateMap[template]);
          // Save the mapped preference for future visits
          localStorage.setItem('dashboard-complexity', templateMap[template]);
        }
      }
    } catch (error) {
      // If parsing fails, just use default ('completo')
      console.error('Error loading onboarding template preference:', error);
    }
  }, []);

  // Save complexity preference to localStorage
  const handleComplexityChange = (level: ComplexityLevel) => {
    setComplexity(level);
    localStorage.setItem('dashboard-complexity', level);
  };

  // Load language preference from localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem('dashboard-language');
    if (savedLanguage === 'es' || savedLanguage === 'en') {
      setLanguage(savedLanguage);
    }
  }, []);

  // Handle language change
  const handleLanguageChange = (newLanguage: 'es' | 'en') => {
    setLanguage(newLanguage);
    localStorage.setItem('dashboard-language', newLanguage);
  };

  // Fetch dashboard data
  const { data: dashboardData, refetch, isLoading, isError } = useQuery({
    queryKey: ['simpleDashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Debug: Log API response structure to help diagnose table visualization issues
  useEffect(() => {
    if (dashboardData) {
      console.log('🔍 Dashboard API Response:', dashboardData);
      console.log('📊 Tables from data.tables:', dashboardData?.data?.tables);
      console.log('📊 Tables from direct:', (dashboardData as any)?.tables);
      console.log('📊 Tables count:', (dashboardData?.data?.tables || (dashboardData as any)?.tables || []).length);
    }
  }, [dashboardData]);

  const translations = {
    es: {
      today: 'Hoy',
      tomorrow: 'Mañana',
      tablesOccupied: 'Mesas Ocupadas',
      reservationsToday: 'Reservas Hoy',
      waiting: 'Sin mesa (espera)',
      upcomingReservations: 'Próximas Reservas',
      addWalkIn: 'Añadir Walk-in',
      viewTomorrow: 'Ver Mañana',
      noReservations: 'No hay reservas',
      checkIn: 'Check In',
      table: 'Mesa',
      people: 'personas',
      allClear: 'Todo despejado',
      noUpcoming: 'No hay reservas próximas para hoy',
      viewLevel: 'Vista',
      avanzado: 'Avanzado',
      estándar: 'Estándar',
      completo: 'Completo',
      occupancy: 'Ocupación',
      activeParties: 'Mesas Activas',
      avgDuration: 'Duración Media',
      peakHours: 'Horas Pico',
    },
    en: {
      today: 'Today',
      tomorrow: 'Tomorrow',
      tablesOccupied: 'Tables Occupied',
      reservationsToday: 'Reservations Today',
      waiting: 'Waiting',
      upcomingReservations: 'Upcoming Reservations',
      addWalkIn: 'Add Walk-in',
      viewTomorrow: 'View Tomorrow',
      noReservations: 'No reservations',
      checkIn: 'Check In',
      table: 'Table',
      people: 'people',
      allClear: 'All Clear',
      noUpcoming: 'No upcoming reservations today',
      viewLevel: 'View',
      avanzado: 'Advanced',
      estándar: 'Standard',
      completo: 'Complete',
      occupancy: 'Occupancy',
      activeParties: 'Active Tables',
      avgDuration: 'Avg Duration',
      peakHours: 'Peak Hours',
    },
  };

  const t = translations[language];

  // Get current day name
  const getDayName = () => {
    const days = language === 'es'
      ? ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };

  // Format date
  const formatDate = () => {
    const date = new Date();
    const day = date.getDate();
    const months = language === 'es'
      ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]}`;
  };

  // Format time (24h for Spanish, 12h for English)
  const formatTime = (time: string) => {
    if (language === 'es') return time; // Already in 24h format

    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Format timestamp for active parties
  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '--:--';
    const date = new Date(timestamp);
    return date.toLocaleTimeString(language === 'es' ? 'es-ES' : 'en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const rawStats = dashboardData?.data?.summary || {};
  // Map snake_case API response to camelCase for frontend
  const stats = {
    ...rawStats,
    activePartiesCount: rawStats.active_parties || 0,
    totalSeatedGuests: dashboardData?.data?.active_parties?.reduce((sum: number, p: any) => sum + (p.party_size || 0), 0) || 0,
    waitlistCount: rawStats.waitlist_count || 0,
  };
  // Handle both possible API response structures
  const tables = dashboardData?.data?.tables || (dashboardData as any)?.tables || [];
  const reservations = dashboardData?.data?.upcoming_reservations || [];
  // Map active_parties from snake_case
  const activeParties = dashboardData?.data?.active_parties || [];

  // Filter today's reservations
  const today = new Date().toISOString().split('T')[0];
  const todayReservations = reservations.filter((r: any) => r.date === today);

  // Calculate occupied tables
  const occupiedTables = tables.filter((t: any) => t.status === 'Occupied').length;
  const totalTables = tables.length;
  const occupancyPercent = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  // Get available tables for modals
  const availableTables = tables.filter((t: any) => t.status === 'Available');

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

  // Table click handler (COMPLETO mode only)
  const handleTableClick = (table: any) => {
    if (complexity !== 'completo') return; // Only interactive in COMPLETO mode
    setSelectedTable(table);
    setShowTableActionsModal(true);
  };

  // Complete Service Handler
  const handleCompleteService = async (serviceId: string) => {
    try {
      const response = await fetch(`/api/host-dashboard?action=complete-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_record_id: serviceId }),
      });

      if (response.ok) {
        setToast({ message: language === 'es' ? 'Servicio completado exitosamente' : 'Service completed successfully', type: 'success' });
        refetch(); // Refresh dashboard data
        setShowCompleteServiceModal(false);
        setSelectedServiceToComplete(null);
      } else {
        throw new Error('Failed to complete service');
      }
    } catch (error) {
      console.error('Error completing service:', error);
      setToast({ message: language === 'es' ? 'Error al completar servicio' : 'Error completing service', type: 'error' });
    }
  };

  // Table Status Update Handler
  const handleUpdateTableStatus = async (tableId: string, status: string) => {
    try {
      const response = await fetch(`/api/host-dashboard?action=update-table-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId, status }),
      });

      if (response.ok) {
        setToast({ message: language === 'es' ? 'Mesa actualizada exitosamente' : 'Table updated successfully', type: 'success' });
        refetch();
        setShowTableActionsModal(false);
        setSelectedTable(null);
      } else {
        throw new Error('Failed to update table');
      }
    } catch (error) {
      console.error('Error updating table status:', error);
      setToast({ message: language === 'es' ? 'Error al actualizar mesa' : 'Error updating table', type: 'error' });
    }
  };

  // Free Table Handler
  const handleFreeTable = async (tableId: string) => {
    try {
      const response = await fetch(`/api/host-dashboard?action=free-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId }),
      });

      if (response.ok) {
        setToast({ message: language === 'es' ? 'Mesa liberada exitosamente' : 'Table freed successfully', type: 'success' });
        refetch();
        setShowTableActionsModal(false);
        setSelectedTable(null);
      } else {
        throw new Error('Failed to free table');
      }
    } catch (error) {
      console.error('Error freeing table:', error);
      setToast({ message: language === 'es' ? 'Error al liberar mesa' : 'Error freeing table', type: 'error' });
    }
  };

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 md:p-6 lg:p-8 relative overflow-hidden">
      {/* Animated Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl opacity-40" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in-up">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-burgundy-200 border-t-burgundy-800 mb-4"></div>
            <p className="text-charcoal-800 font-sans font-semibold">
              {language === 'es' ? 'Cargando dashboard...' : 'Loading dashboard...'}
            </p>
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
              <h3 className="text-lg font-bold text-red-900 mb-2">
                {language === 'es' ? 'Error al cargar datos' : 'Error loading data'}
              </h3>
              <p className="text-sm text-red-700 mb-4">
                {language === 'es'
                  ? 'No se pudo conectar con el servidor. Por favor, intenta de nuevo.'
                  : 'Could not connect to the server. Please try again.'}
              </p>
              <button
                onClick={() => refetch()}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {language === 'es' ? 'Reintentar' : 'Retry'}
              </button>
            </div>
          </div>
        )}

        {/* Main Content - Only show when not loading and no error */}
        {!isLoading && !isError && (
          <div>
        {/* Header */}
        <div className="mb-8 md:mb-10 animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-burgundy-900 tracking-tight mb-1">
                🍽️ {t.today}
              </h1>
              <p className="text-charcoal-700 text-base md:text-lg font-sans font-medium">
                {getDayName()}, {formatDate()}
              </p>
            </div>

            {/* Controls: Subscription Badge + Language Switcher + Complexity Toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Subscription Plan Badge */}
              <div className={`px-4 py-2 rounded-xl font-sans font-semibold text-sm shadow-md border transition-all duration-300 hover:scale-105 ${
                currentPlan === 'professional'
                  ? 'bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 border-burgundy-600'
                  : currentPlan === 'basic'
                  ? 'bg-gradient-to-r from-charcoal-700 to-charcoal-800 text-cream-50 border-charcoal-600'
                  : 'bg-gradient-to-r from-success-500 to-success-600 text-white border-success-400'
              }`}>
                {currentPlan === 'professional' ? '💎' : currentPlan === 'trial' ? '🎯' : '⭐'} {PLAN_NAMES[currentPlan]}
              </div>

              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-cream-50 rounded-xl p-1.5 shadow-sm border border-cream-400/60 backdrop-blur-sm">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ease-out-expo ${
                    language === 'en'
                      ? 'bg-gradient-to-br from-burgundy-700 to-burgundy-800 text-cream-50 shadow-burgundy scale-105'
                      : 'text-charcoal-600 hover:bg-cream-100 hover:text-burgundy-800'
                  }`}
                  title="English"
                >
                  🇬🇧 EN
                </button>
                <button
                  onClick={() => handleLanguageChange('es')}
                  className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ease-out-expo ${
                    language === 'es'
                      ? 'bg-gradient-to-br from-burgundy-700 to-burgundy-800 text-cream-50 shadow-burgundy scale-105'
                      : 'text-charcoal-600 hover:bg-cream-100 hover:text-burgundy-800'
                  }`}
                  title="Español"
                >
                  🇪🇸 ES
                </button>
              </div>

              {/* AI Agent Button */}
              <button
                onClick={() => window.location.href = '/host-dashboard/calls'}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl text-sm font-sans font-semibold transition-all duration-300 ease-out-expo shadow-sm hover:shadow-md hover:scale-105"
                title={language === 'es' ? 'Panel del Agente AI' : 'AI Agent Dashboard'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="hidden sm:inline">{language === 'es' ? 'Agente AI' : 'AI Agent'}</span>
              </button>

              {/* Complexity Toggle - Enhanced Design */}
              <div className="flex items-center gap-1.5 bg-cream-50 rounded-xl p-1.5 shadow-sm border border-cream-400/60 backdrop-blur-sm">
                <span className="text-xs text-charcoal-500 font-sans font-semibold px-2 hidden sm:block">{t.viewLevel}</span>

              <button
                onClick={() => handleComplexityChange('completo')}
                className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ease-out-expo ${
                  complexity === 'completo'
                    ? 'bg-gradient-to-br from-burgundy-700 to-burgundy-800 text-cream-50 shadow-burgundy scale-105'
                    : 'text-charcoal-600 hover:bg-cream-100 hover:text-burgundy-800'
                }`}
                title={t.completo}
              >
                ⚙️ {t.completo}
              </button>
              <button
                onClick={() => {
                  if (hasFeatureAccess(currentPlan, 'mlPerformance')) {
                    window.location.href = '/host-dashboard/advanced';
                  } else {
                    alert(language === 'es'
                      ? '⭐ Esta función requiere el Plan Professional.\n\nActualiza tu plan para acceder al Panel de ML Performance.'
                      : '⭐ This feature requires the Professional Plan.\n\nUpgrade your plan to access the ML Performance Dashboard.');
                  }
                }}
                className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ease-out-expo ${
                  !hasFeatureAccess(currentPlan, 'mlPerformance')
                    ? 'text-charcoal-400 hover:bg-cream-100 cursor-not-allowed opacity-60'
                    : complexity === 'avanzado'
                    ? 'bg-gradient-to-br from-gold-500 to-gold-600 text-charcoal-900 shadow-gold scale-105'
                    : 'text-charcoal-600 hover:bg-cream-100 hover:text-burgundy-800'
                }`}
                title={hasFeatureAccess(currentPlan, 'mlPerformance') ? t.avanzado : (language === 'es' ? 'Requiere Plan Professional' : 'Requires Professional Plan')}
              >
                🎯 {t.avanzado}
              </button>
            </div>
            </div>
          </div>
        </div>


        {/* Key Stats - COMPLETO MODE */}
        {complexity === 'completo' && (
          <div className="space-y-4 md:space-y-5 mb-8">
            {/* Main Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Occupied Tables */}
              <div className="glass-card p-4 md:p-5 group hover:-translate-y-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold gradient-text tracking-tight">
                    {occupiedTables}<span className="text-gray-400 text-2xl">/{totalTables}</span>
                  </div>
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-300 mb-3">{t.tablesOccupied}</div>
                <div className="space-y-2">
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 font-medium">{occupancyPercent}% {t.occupancy}</div>
                </div>
              </div>

              {/* Reservations */}
              <div className="glass-card p-4 md:p-5 group hover:-translate-y-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold gradient-text-emerald tracking-tight">
                    {todayReservations.length}
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-300 mb-3">{t.reservationsToday}</div>
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <div className="flex-1 h-2 bg-emerald-500 rounded-full" style={{ width: `${(todayReservations.filter((r: any) => r.checked_in).length / Math.max(todayReservations.length, 1)) * 100}%` }} />
                    <div className="flex-1 h-2 bg-white/5 rounded-full" />
                  </div>
                  <div className="text-xs text-gray-400 font-medium">
                    {todayReservations.filter((r: any) => r.checked_in).length}/{todayReservations.length} {language === 'es' ? 'sentados' : 'seated'}
                  </div>
                </div>
              </div>

              {/* Waiting */}
              <div className="glass-card p-4 md:p-5 group hover:-translate-y-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-amber-400 tracking-tight">
                    {stats.waitlistCount || 0}
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-300 mb-3">{t.waiting}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-amber-400">
                    {stats.estimated_wait_time ? `~${stats.estimated_wait_time} min` : '-'}
                  </div>
                  <div className="text-xs text-gray-400 font-medium">
                    {language === 'es' ? 'Espera promedio' : 'Average wait'}
                  </div>
                </div>
              </div>

              {/* Active Parties */}
              <div className="glass-card p-4 md:p-5 group hover:-translate-y-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold gradient-text tracking-tight">
                    {stats.activePartiesCount || 0}
                  </div>
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-300 mb-3">{t.activeParties}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold gradient-text">
                    {stats.totalSeatedGuests || 0} {t.people}
                  </div>
                  <div className="text-xs text-gray-400 font-medium">
                    {language === 'es' ? 'Comensales totales' : 'Total guests'}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-4 hover:-translate-y-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-300 mb-0.5">{t.avgDuration}</div>
                    <div className="text-2xl font-bold text-blue-400 tracking-tight">
                      {stats.avg_duration_minutes ? `${Math.round(stats.avg_duration_minutes / 60 * 10) / 10}h` : '-'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="glass-card p-4 hover:-translate-y-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-pink-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-300 mb-0.5">{t.peakHours}</div>
                    <div className="text-2xl font-bold text-pink-400 tracking-tight">{stats.peak_hours || '-'}</div>
                  </div>
                </div>
              </div>
              <div className="glass-card p-4 hover:-translate-y-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-lg">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-300 mb-0.5">{language === 'es' ? 'Ingresos Hoy' : 'Revenue Today'}</div>
                    <div className="text-2xl font-bold gradient-text-emerald tracking-tight">
                      {stats.revenue_today ? `€${stats.revenue_today}` : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Walk-in Button */}
        <button
          onClick={() => setShowWalkInModal(true)}
          className="group w-full mb-8 bg-gradient-to-r from-burgundy-700 to-burgundy-800 hover:from-burgundy-800 hover:to-burgundy-900 text-cream-50 font-sans font-bold py-5 md:py-6 px-8 rounded-2xl shadow-burgundy hover:shadow-2xl transition-all duration-400 ease-out-expo transform hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 border-2 border-burgundy-600/40 animate-fade-in-up"
        >
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6 transition-transform group-hover:rotate-90 duration-400 ease-out-back" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-lg md:text-xl">{t.addWalkIn}</span>
          </div>
        </button>

        {/* Enhanced Panels - COMPLETO MODE ONLY */}
        {complexity === 'completo' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 mb-8">

            {/* Left: Table Grid (60% on desktop) */}
            <div className="lg:col-span-2">
              <div className="glass-card p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-200">
                      {language === 'es' ? 'Disposición de Mesas' : 'Table Layout'}
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-gray-400 bg-white/5 px-2.5 py-1 rounded-lg">
                    {language === 'es' ? 'Solo lectura' : 'Read-only'}
                  </span>
                </div>

                {/* Table Status Legend */}
                <div className="mb-5">
                  <TableStatusLegend />
                </div>

                {/* Table Grid - Interactive in COMPLETO mode */}
                <div className={`bg-white/5 rounded-xl p-4 ${complexity !== 'completo' ? 'pointer-events-none opacity-90' : ''}`}>
                  <TableGrid
                    tables={tables}
                    onTableClick={complexity === 'completo' ? handleTableClick : undefined}
                  />
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400 bg-white/5 p-3 rounded-lg">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {language === 'es'
                      ? complexity === 'completo'
                        ? 'Toca cualquier mesa para gestionar su estado'
                        : 'Vista de solo lectura. Activa modo Completo para interactuar con mesas.'
                      : complexity === 'completo'
                        ? 'Tap any table to manage its status'
                        : 'Read-only view. Enable Complete mode to interact with tables.'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Right: Active Parties + Waitlist (40% on desktop) */}
            <div className="space-y-5 md:space-y-6">

              {/* Active Parties Panel */}
              <div className="glass-card p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-500/10 rounded-lg">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-gray-200">
                      {language === 'es' ? 'Mesas Activas' : 'Active Parties'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-xs font-bold">
                    {stats.activePartiesCount || 0}
                  </span>
                </div>

                {stats.activePartiesCount > 0 ? (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar">
                    {activeParties?.map((party: any) => (
                      <div
                        key={party.service_id}
                        className="p-3.5 bg-white/5 rounded-xl border border-white/10 hover:border-purple-400/30 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-semibold text-gray-200 text-sm">
                            {party.customer_name}
                          </div>
                          <span className="text-xs font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded-md">
                            {formatTimestamp(party.seated_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-300">
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="font-medium">{party.party_size} {language === 'es' ? 'pax' : 'guests'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">{language === 'es' ? 'Mesa' : 'Table'} {party.tables?.join(', ')}</span>
                          </div>
                        </div>
                        {complexity === 'completo' && (
                          <button
                            onClick={() => {
                              setSelectedServiceToComplete(party);
                              setShowCompleteServiceModal(true);
                            }}
                            className="mt-2 w-full px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                          >
                            {language === 'es' ? 'Completar Servicio' : 'Complete Service'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <span className="text-3xl">🍽️</span>
                    </div>
                    <p className="text-sm font-medium text-gray-300 mb-1">
                      {language === 'es' ? 'No hay mesas activas' : 'No active parties'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {language === 'es' ? 'Las mesas aparecerán aquí al sentar clientes' : 'Tables will appear here when guests are seated'}
                    </p>
                  </div>
                )}
              </div>

              {/* Waitlist Panel */}
              <div className="glass-card p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-amber-500/10 rounded-lg">
                      <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-gray-200">
                      {language === 'es' ? 'Lista de Espera' : 'Waitlist'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-lg text-xs font-bold">
                    {stats.waitlistCount || 0}
                  </span>
                </div>

                <div className="text-center py-10 px-4">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">⏱️</span>
                  </div>
                  <p className="text-sm font-medium text-gray-300 mb-1">
                    {language === 'es' ? 'La lista de espera está vacía' : 'Waitlist is empty'}
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    {language === 'es'
                      ? 'Los clientes pueden agregar sus nombres cuando lleguen'
                      : 'Customers can add their names when they arrive'}
                  </p>
                </div>

                <div className="flex items-start gap-2 text-xs text-slate-400 bg-orange-50/50 p-3 rounded-lg border border-orange-100">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>
                    {language === 'es'
                      ? 'Upgrade a Pro para gestión de prioridades y notificaciones SMS'
                      : 'Upgrade to Pro for priority management and SMS notifications'}
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}


        {/* Upcoming Reservations */}
        <div className="bg-cream-100 rounded-2xl p-5 md:p-6 shadow-md border-2 border-cream-400 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-burgundy-100 rounded-lg">
              <svg className="w-6 h-6 text-burgundy-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-burgundy-900">
              {t.upcomingReservations}
            </h2>
          </div>

          {todayReservations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-20 h-20 bg-gradient-to-br from-burgundy-50 to-gold-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <span className="text-5xl">✨</span>
              </div>
              <p className="text-burgundy-900 text-lg font-display font-semibold mb-2">{t.allClear}</p>
              <p className="text-charcoal-500 text-sm font-sans">{t.noUpcoming}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayReservations.map((reservation: any, index: number) => (
                <div
                  key={reservation.reservation_id}
                  className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-5 bg-gradient-to-br from-cream-50 to-cream-100/50 rounded-xl border-2 border-cream-300 hover:border-burgundy-400 hover:shadow-burgundy transition-all duration-400 ease-out-expo hover:-translate-y-1 animate-fade-in-up"
                  style={{ animationDelay: `${600 + (index * 100)}ms` }}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="text-2xl md:text-3xl font-mono font-bold text-burgundy-800 bg-cream-50 px-3 py-2 rounded-lg shadow-sm border-2 border-burgundy-200">
                        {formatTime(reservation.time)}
                      </div>
                    </div>
                    <div className="border-l-2 border-burgundy-300 pl-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-display font-semibold text-burgundy-900 text-base md:text-lg truncate">
                          {reservation.customer_name}
                        </div>
                        {/* ML Risk Badges */}
                        {reservation.ml_risk_level === 'very-high' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-lg border border-red-300 shadow-sm flex-shrink-0">
                            🔴 VERY HIGH RISK
                          </span>
                        )}
                        {reservation.ml_risk_level === 'high' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded-lg border border-orange-300 shadow-sm flex-shrink-0">
                            ⚠️ HIGH RISK
                          </span>
                        )}
                      </div>
                      {/* ML Intervention Actions */}
                      {(reservation.ml_risk_level === 'high' || reservation.ml_risk_level === 'very-high') && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            onClick={async () => {
                              if (!window.confirm(language === 'es' ? '¿Confirmar que se realizó la llamada?' : 'Confirm that call was made?')) return;
                              try {
                                const response = await fetch('/api/ml-outcomes?action=mark-action-taken', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reservation_id: reservation.reservation_id,
                                    intervention_type: 'confirmation_call',
                                    notes: 'Called customer to confirm reservation'
                                  })
                                });
                                if (response.ok) {
                                  setToast({ message: language === 'es' ? 'Intervención marcada' : 'Intervention marked', type: 'success' });
                                  refetch();
                                } else {
                                  throw new Error('Failed to mark intervention');
                                }
                              } catch (error) {
                                console.error('Error marking intervention:', error);
                                setToast({ message: language === 'es' ? 'Error al marcar' : 'Error marking', type: 'error' });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 transition-all duration-200"
                          >
                            📞 {language === 'es' ? 'Marcar Llamada Hecha' : 'Mark Call Made'}
                          </button>
                          <button
                            onClick={async () => {
                              const outcome = window.prompt(language === 'es'
                                ? 'Resultado (showed_up/no_show/cancelled):'
                                : 'Outcome (showed_up/no_show/cancelled):');
                              if (!outcome || !['showed_up', 'no_show', 'cancelled'].includes(outcome)) return;
                              try {
                                const response = await fetch('/api/ml-outcomes?action=record-outcome', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    reservation_id: reservation.reservation_id,
                                    actual_outcome: outcome,
                                    intervention_taken: true,
                                    intervention_type: 'confirmation_call',
                                    intervention_cost: 3
                                  })
                                });
                                if (response.ok) {
                                  setToast({ message: language === 'es' ? 'Resultado registrado' : 'Outcome recorded', type: 'success' });
                                  refetch();
                                } else {
                                  throw new Error('Failed to record outcome');
                                }
                              } catch (error) {
                                console.error('Error recording outcome:', error);
                                setToast({ message: language === 'es' ? 'Error al registrar' : 'Error recording', type: 'error' });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold rounded-lg border border-green-300 transition-all duration-200"
                          >
                            ✅ {language === 'es' ? 'Registrar Resultado' : 'Record Outcome'}
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span className="font-medium">{reservation.party_size} {t.people}</span>
                        </div>
                        {reservation.special_requests && (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-lg font-medium">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {reservation.special_requests}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {!reservation.checked_in && (
                      <button
                        onClick={() => {
                          setSelectedReservation(reservation);
                          setShowCheckInModal(true);
                        }}
                        className="w-full sm:w-auto bg-gradient-to-r from-success-600 to-success-700 hover:from-success-700 hover:to-success-800 text-white font-sans font-semibold px-5 py-2.5 rounded-lg transition-all duration-300 ease-out-expo shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:translate-y-0"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {t.checkIn}
                        </span>
                      </button>
                    )}

                    {reservation.checked_in && (
                      <div className="w-full sm:w-auto bg-success-100 text-success-800 font-sans font-semibold px-5 py-2.5 rounded-lg border-2 border-success-300">
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          {language === 'es' ? 'Sentado' : 'Seated'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Tomorrow (Only show in COMPLETO mode) */}
        {complexity === 'completo' && (
          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-burgundy-700 hover:text-burgundy-900 font-sans font-semibold text-base md:text-lg transition-all duration-300 ease-out-expo hover:gap-3 group">
              <span>{t.viewTomorrow}</span>
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        )}
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
          data={selectedParty || selectedReservation}
          onClose={() => {
            setShowSeatModal(false);
            setSelectedParty(null);
            setSelectedReservation(null);
            refetch();
          }}
        />
      )}

      {/* Table Actions Modal */}
      {showTableActionsModal && selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {language === 'es' ? 'Mesa' : 'Table'} {selectedTable.table_number}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {selectedTable.capacity} {language === 'es' ? 'personas' : 'seats'} • {selectedTable.location}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTableActionsModal(false);
                  setSelectedTable(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {selectedTable.status === 'Occupied' && (
                <button
                  onClick={() => handleFreeTable(selectedTable.id)}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 rounded-xl border border-green-200 transition-all duration-200 group"
                >
                  <div className="p-2 bg-green-600 rounded-lg group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-green-900">
                      {language === 'es' ? 'Liberar Mesa' : 'Free Table'}
                    </div>
                    <div className="text-xs text-green-700">
                      {language === 'es' ? 'Marcar como disponible' : 'Mark as available'}
                    </div>
                  </div>
                </button>
              )}

              {selectedTable.status !== 'Being Cleaned' && (
                <button
                  onClick={() => handleUpdateTableStatus(selectedTable.id, 'Being Cleaned')}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-orange-50 to-orange-100/50 hover:from-orange-100 hover:to-orange-200/50 rounded-xl border border-orange-200 transition-all duration-200 group"
                >
                  <div className="p-2 bg-orange-600 rounded-lg group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-orange-900">
                      {language === 'es' ? 'Marcar Limpieza' : 'Mark as Cleaning'}
                    </div>
                    <div className="text-xs text-orange-700">
                      {language === 'es' ? 'Mesa en proceso de limpieza' : 'Table being cleaned'}
                    </div>
                  </div>
                </button>
              )}

              {selectedTable.status !== 'Available' && (
                <button
                  onClick={() => handleUpdateTableStatus(selectedTable.id, 'Available')}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-indigo-100/50 hover:from-indigo-100 hover:to-indigo-200/50 rounded-xl border border-indigo-200 transition-all duration-200 group"
                >
                  <div className="p-2 bg-indigo-600 rounded-lg group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-indigo-900">
                      {language === 'es' ? 'Marcar Disponible' : 'Mark as Available'}
                    </div>
                    <div className="text-xs text-indigo-700">
                      {language === 'es' ? 'Mesa lista para nuevos clientes' : 'Table ready for new guests'}
                    </div>
                  </div>
                </button>
              )}

              {selectedTable.status === 'available' && (
                <button
                  onClick={() => {
                    setShowTableActionsModal(false);
                    setShowSeatModal(true);
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 rounded-xl border border-purple-200 transition-all duration-200 group"
                >
                  <div className="p-2 bg-purple-600 rounded-lg group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-purple-900">
                      {language === 'es' ? 'Asignar Clientes' : 'Seat Party'}
                    </div>
                    <div className="text-xs text-purple-700">
                      {language === 'es' ? 'Sentar clientes en esta mesa' : 'Assign guests to this table'}
                    </div>
                  </div>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setShowTableActionsModal(false);
                setSelectedTable(null);
              }}
              className="w-full mt-4 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all duration-200"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Complete Service Confirmation Modal */}
      {showCompleteServiceModal && selectedServiceToComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {language === 'es' ? 'Completar Servicio' : 'Complete Service'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowCompleteServiceModal(false);
                  setSelectedServiceToComplete(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-semibold text-slate-900 mb-2">
                {selectedServiceToComplete.customer_name}
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{selectedServiceToComplete.party_size} {language === 'es' ? 'personas' : 'guests'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{language === 'es' ? 'Mesa' : 'Table'} {selectedServiceToComplete.tables?.join(', ')}</span>
                </div>
              </div>
            </div>

            <p className="text-slate-600 text-sm mb-6">
              {language === 'es'
                ? '¿Confirmas que el servicio ha finalizado? Las mesas serán marcadas como disponibles.'
                : 'Confirm that the service is complete? Tables will be marked as available.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCompleteServiceModal(false);
                  setSelectedServiceToComplete(null);
                }}
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all duration-200"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={() => handleCompleteService(selectedServiceToComplete.service_id)}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg active:scale-95"
              >
                {language === 'es' ? 'Confirmar' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className={`px-6 py-4 rounded-xl shadow-2xl border-2 ${
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
  );
}
