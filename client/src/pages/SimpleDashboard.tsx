import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import TableGrid from '../components/host/TableGrid';
import TableStatusLegend from '../components/host/TableStatusLegend';
import type { PlanType } from '../config/planFeatures';
import { hasFeatureAccess } from '../config/planFeatures';
import { useSubscription } from '../hooks/useSubscription';
// Modern Elegant Design - Light theme with burgundy accents

type ComplexityLevel = 'completo' | 'avanzado';

interface SimpleDashboardProps {
  language?: 'es' | 'en' | 'pt' | 'fr' | 'it' | 'de';
}

export default function SimpleDashboard({ language: initialLanguage = 'en' }: SimpleDashboardProps) {
  const [complexity, setComplexity] = useState<ComplexityLevel>('completo');
  const [language, setLanguage] = useState<'es' | 'en' | 'pt' | 'fr' | 'it' | 'de'>(initialLanguage);
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
  const [showTomorrow, setShowTomorrow] = useState(false);

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

  // Load language preference from localStorage or detect from onboarding
  useEffect(() => {
    // First check dashboard language preference
    const savedLanguage = localStorage.getItem('dashboard-language');
    // Only allow EN/ES since those are the only UI toggle options
    if (savedLanguage && ['es', 'en'].includes(savedLanguage)) {
      setLanguage(savedLanguage as 'es' | 'en' | 'pt' | 'fr' | 'it' | 'de');
      return;
    }
    // If saved language is not EN/ES, reset to EN
    if (savedLanguage && !['es', 'en'].includes(savedLanguage)) {
      localStorage.setItem('dashboard-language', 'en');
      setLanguage('en');
      return;
    }

    // Try to get language from onboarding data (country-based)
    try {
      const onboardingData = localStorage.getItem('onboarding_data');
      if (onboardingData) {
        const data = JSON.parse(onboardingData);
        const countryLanguage = data?.country_language || data?.profile_data?.language;

        // Map country language codes to EN/ES only (the supported UI languages)
        const langMap: Record<string, 'es' | 'en'> = {
          'es-ES': 'es', 'es-MX': 'es', 'es-AR': 'es', 'es-CO': 'es', 'es-CL': 'es', 'es-PE': 'es',
          'en-US': 'en', 'en-GB': 'en', 'en-CA': 'en', 'en-AU': 'en',
          // Other languages default to English
          'pt-BR': 'en', 'pt-PT': 'en',
          'fr-FR': 'en', 'fr-BE': 'en', 'fr-CH': 'en',
          'it-IT': 'en',
          'de-DE': 'en', 'de-AT': 'en',
        };

        if (countryLanguage && langMap[countryLanguage]) {
          setLanguage(langMap[countryLanguage]);
          localStorage.setItem('dashboard-language', langMap[countryLanguage]);
        }
      }
    } catch (error) {
      console.error('Error loading language preference:', error);
    }
  }, []);

  // Handle language change
  const handleLanguageChange = (newLanguage: 'es' | 'en' | 'pt' | 'fr' | 'it' | 'de') => {
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
    pt: {
      today: 'Hoje',
      tomorrow: 'Amanhã',
      tablesOccupied: 'Mesas Ocupadas',
      reservationsToday: 'Reservas Hoje',
      waiting: 'Em espera',
      upcomingReservations: 'Próximas Reservas',
      addWalkIn: 'Adicionar Walk-in',
      viewTomorrow: 'Ver Amanhã',
      noReservations: 'Sem reservas',
      checkIn: 'Check In',
      table: 'Mesa',
      people: 'pessoas',
      allClear: 'Tudo livre',
      noUpcoming: 'Sem reservas para hoje',
      viewLevel: 'Visualização',
      avanzado: 'Avançado',
      estándar: 'Padrão',
      completo: 'Completo',
      occupancy: 'Ocupação',
      activeParties: 'Mesas Ativas',
      avgDuration: 'Duração Média',
      peakHours: 'Horário de Pico',
    },
    fr: {
      today: "Aujourd'hui",
      tomorrow: 'Demain',
      tablesOccupied: 'Tables Occupées',
      reservationsToday: "Réservations Aujourd'hui",
      waiting: 'En attente',
      upcomingReservations: 'Prochaines Réservations',
      addWalkIn: 'Ajouter Walk-in',
      viewTomorrow: 'Voir Demain',
      noReservations: 'Pas de réservations',
      checkIn: 'Check In',
      table: 'Table',
      people: 'personnes',
      allClear: 'Tout libre',
      noUpcoming: "Pas de réservations aujourd'hui",
      viewLevel: 'Affichage',
      avanzado: 'Avancé',
      estándar: 'Standard',
      completo: 'Complet',
      occupancy: 'Occupation',
      activeParties: 'Tables Actives',
      avgDuration: 'Durée Moyenne',
      peakHours: 'Heures de Pointe',
    },
    it: {
      today: 'Oggi',
      tomorrow: 'Domani',
      tablesOccupied: 'Tavoli Occupati',
      reservationsToday: 'Prenotazioni Oggi',
      waiting: 'In attesa',
      upcomingReservations: 'Prossime Prenotazioni',
      addWalkIn: 'Aggiungi Walk-in',
      viewTomorrow: 'Vedi Domani',
      noReservations: 'Nessuna prenotazione',
      checkIn: 'Check In',
      table: 'Tavolo',
      people: 'persone',
      allClear: 'Tutto libero',
      noUpcoming: 'Nessuna prenotazione per oggi',
      viewLevel: 'Visualizzazione',
      avanzado: 'Avanzato',
      estándar: 'Standard',
      completo: 'Completo',
      occupancy: 'Occupazione',
      activeParties: 'Tavoli Attivi',
      avgDuration: 'Durata Media',
      peakHours: 'Ore di Punta',
    },
    de: {
      today: 'Heute',
      tomorrow: 'Morgen',
      tablesOccupied: 'Besetzte Tische',
      reservationsToday: 'Reservierungen Heute',
      waiting: 'Wartend',
      upcomingReservations: 'Kommende Reservierungen',
      addWalkIn: 'Walk-in Hinzufügen',
      viewTomorrow: 'Morgen Ansehen',
      noReservations: 'Keine Reservierungen',
      checkIn: 'Check In',
      table: 'Tisch',
      people: 'Personen',
      allClear: 'Alles frei',
      noUpcoming: 'Keine Reservierungen für heute',
      viewLevel: 'Ansicht',
      avanzado: 'Erweitert',
      estándar: 'Standard',
      completo: 'Komplett',
      occupancy: 'Auslastung',
      activeParties: 'Aktive Tische',
      avgDuration: 'Durchschn. Dauer',
      peakHours: 'Stoßzeiten',
    },
  };

  const t = translations[language];

  // Get current day name
  const getDayName = () => {
    const daysByLang: Record<string, string[]> = {
      es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
      fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
      it: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
      de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    };
    return (daysByLang[language] || daysByLang.en)[new Date().getDay()];
  };

  // Format date
  const formatDate = () => {
    const date = new Date();
    const day = date.getDate();
    const monthsByLang: Record<string, string[]> = {
      es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      fr: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'],
      it: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
      de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    };
    return `${day} ${(monthsByLang[language] || monthsByLang.en)[date.getMonth()]}`;
  };

  // Format time (24h for non-English, 12h for English)
  const formatTime = (time: string) => {
    if (language !== 'en') return time; // 24h format for most languages

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
    const localeMap: Record<string, string> = {
      es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', it: 'it-IT', de: 'de-DE'
    };
    return date.toLocaleTimeString(localeMap[language] || 'en-US', {
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

  // Filter today's and tomorrow's reservations
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const todayReservations = reservations.filter((r: any) => r.date === today);
  const tomorrowReservations = reservations.filter((r: any) => r.date === tomorrow);
  const displayedReservations = showTomorrow ? tomorrowReservations : todayReservations;

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
    <div className="min-h-screen bg-[#FAFAF9] p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in-up">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#E7E5E4] border-t-[#9F1239] mb-4"></div>
            <p className="text-[#1C1917] font-sans font-semibold">
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
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-[#1C1917] tracking-tight mb-1">
                {t.today}
              </h1>
              <p className="text-[#57534E] text-base md:text-lg font-sans font-medium">
                {getDayName()}, {formatDate()}
              </p>
            </div>

            {/* Controls: Language Switcher + Complexity Toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-white border border-[#E7E5E4] rounded-xl p-1.5 shadow-md">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-colors duration-200 ${
                    language === 'en'
                      ? 'bg-[#9F1239] text-white shadow-sm'
                      : 'text-[#57534E] hover:bg-[#F5F5F4] hover:text-[#1C1917]'
                  }`}
                  title="English"
                >
                  🇬🇧 EN
                </button>
                <button
                  onClick={() => handleLanguageChange('es')}
                  className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-colors duration-200 ${
                    language === 'es'
                      ? 'bg-[#9F1239] text-white shadow-sm'
                      : 'text-[#57534E] hover:bg-[#F5F5F4] hover:text-[#1C1917]'
                  }`}
                  title="Español"
                >
                  🇪🇸 ES
                </button>
              </div>

              {/* AI Agent Button */}
              <button
                onClick={() => window.location.href = '/host-dashboard/calls'}
                className="flex items-center gap-2 px-3 py-2 bg-[#9F1239] hover:bg-[#881337] text-white rounded-xl text-sm font-sans font-semibold transition-all duration-300 shadow-md hover:shadow-lg"
                title={language === 'es' ? 'Panel del Agente AI' : 'AI Agent Dashboard'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="hidden sm:inline">{language === 'es' ? 'Agente AI' : 'AI Agent'}</span>
              </button>

              {/* Table Configuration Button */}
              <button
                onClick={() => window.location.href = '/host-dashboard/tables'}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-[#E7E5E4] hover:bg-[#F5F5F4] text-[#57534E] rounded-xl text-sm font-sans font-semibold transition-all duration-300 shadow-md hover:shadow-lg"
                title={language === 'es' ? 'Configurar Mesas' : 'Configure Tables'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">{language === 'es' ? 'Mesas' : 'Tables'}</span>
              </button>

              {/* Complexity Toggle - Enhanced Design */}
              <div className="flex items-center gap-1.5 bg-white border border-[#E7E5E4] rounded-xl p-1.5 shadow-md">
                <span className="text-xs text-[#57534E] font-sans font-semibold px-2 hidden sm:block">{t.viewLevel}</span>

              <button
                onClick={() => handleComplexityChange('completo')}
                className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ${
                  complexity === 'completo'
                    ? 'bg-[#9F1239] text-white shadow-sm'
                    : 'text-[#57534E] hover:bg-[#F5F5F4] hover:text-[#1C1917]'
                }`}
                title={t.completo}
              >
                {t.completo}
              </button>
              <button
                onClick={() => {
                  if (hasFeatureAccess(currentPlan, 'mlPerformance')) {
                    window.location.href = '/host-dashboard/advanced';
                  } else {
                    alert(language === 'es'
                      ? 'Esta función requiere el Plan Professional.\n\nActualiza tu plan para acceder al Panel de ML Performance.'
                      : 'This feature requires the Professional Plan.\n\nUpgrade your plan to access the ML Performance Dashboard.');
                  }
                }}
                className={`px-3 py-2 rounded-lg text-sm font-sans font-semibold transition-all duration-300 ${
                  !hasFeatureAccess(currentPlan, 'mlPerformance')
                    ? 'text-[#A8A29E] hover:bg-[#F5F5F4] cursor-not-allowed opacity-60'
                    : complexity === 'avanzado'
                    ? 'bg-[#d97706] text-white shadow-sm'
                    : 'text-[#57534E] hover:bg-[#F5F5F4] hover:text-[#1C1917]'
                }`}
                title={hasFeatureAccess(currentPlan, 'mlPerformance') ? t.avanzado : (language === 'es' ? 'Requiere Plan Professional' : 'Requires Professional Plan')}
              >
                {t.avanzado}
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
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-[#9F1239] tracking-tight">
                    {occupiedTables}<span className="text-[#A8A29E] text-2xl">/{totalTables}</span>
                  </div>
                  <div className="p-2 bg-[#9F1239]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-[#57534E] mb-3">{t.tablesOccupied}</div>
                <div className="space-y-2">
                  <div className="h-2 bg-[#F5F5F4] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#9F1239] to-[#881337] rounded-full transition-all duration-500"
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-[#A8A29E] font-medium">{occupancyPercent}% {t.occupancy}</div>
                </div>
              </div>

              {/* Reservations */}
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-[#16a34a] tracking-tight">
                    {todayReservations.length}
                  </div>
                  <div className="p-2 bg-[#16a34a]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-[#57534E] mb-3">{t.reservationsToday}</div>
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <div className="flex-1 h-2 bg-[#16a34a] rounded-full" style={{ width: `${(todayReservations.filter((r: any) => r.checked_in).length / Math.max(todayReservations.length, 1)) * 100}%` }} />
                    <div className="flex-1 h-2 bg-[#F5F5F4] rounded-full" />
                  </div>
                  <div className="text-xs text-[#A8A29E] font-medium">
                    {todayReservations.filter((r: any) => r.checked_in).length}/{todayReservations.length} {language === 'es' ? 'sentados' : 'seated'}
                  </div>
                </div>
              </div>

              {/* Waiting */}
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-[#d97706] tracking-tight">
                    {stats.waitlistCount || 0}
                  </div>
                  <div className="p-2 bg-[#d97706]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#d97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-[#57534E] mb-3">{t.waiting}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[#d97706]">
                    {stats.estimated_wait_time ? `~${stats.estimated_wait_time} min` : '-'}
                  </div>
                  <div className="text-xs text-[#A8A29E] font-medium">
                    {language === 'es' ? 'Espera promedio' : 'Average wait'}
                  </div>
                </div>
              </div>

              {/* Active Parties */}
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-[#7c3aed] tracking-tight">
                    {stats.activePartiesCount || 0}
                  </div>
                  <div className="p-2 bg-[#7c3aed]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#7c3aed]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-[#57534E] mb-3">{t.activeParties}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[#7c3aed]">
                    {stats.totalSeatedGuests || 0} {t.people}
                  </div>
                  <div className="text-xs text-[#A8A29E] font-medium">
                    {language === 'es' ? 'Comensales totales' : 'Total guests'}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#9F1239]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#57534E] mb-0.5">{t.avgDuration}</div>
                    <div className="text-2xl font-bold text-[#1C1917] tracking-tight">
                      {stats.avg_duration_minutes ? `${Math.round(stats.avg_duration_minutes / 60 * 10) / 10}h` : '-'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#9F1239]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#57534E] mb-0.5">{t.peakHours}</div>
                    <div className="text-2xl font-bold text-[#1C1917] tracking-tight">{stats.peak_hours || '-'}</div>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#16a34a]/10 rounded-lg">
                    <svg className="w-5 h-5 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#57534E] mb-0.5">{language === 'es' ? 'Ingresos Hoy' : 'Revenue Today'}</div>
                    <div className="text-2xl font-bold text-[#16a34a] tracking-tight">
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
          className="w-full mb-8 bg-[#9F1239] hover:bg-[#881337] text-white font-sans font-bold py-5 md:py-6 px-8 rounded-2xl shadow-md hover:shadow-lg hover:shadow-[#9F1239]/20 transition-all duration-300"
        >
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-lg md:text-xl tracking-wider uppercase">{t.addWalkIn}</span>
          </div>
        </button>

        {/* Enhanced Panels - COMPLETO MODE ONLY */}
        {complexity === 'completo' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 mb-8">

            {/* Left: Table Grid (60% on desktop) */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#9F1239]/10 rounded-lg">
                      <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                    </div>
                    <h2 className="text-lg md:text-xl font-serif font-bold text-[#1C1917]">
                      {language === 'es' ? 'Disposición de Mesas' : 'Table Layout'}
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-[#57534E] bg-[#F5F5F4] px-2.5 py-1 rounded-lg">
                    {language === 'es' ? 'Solo lectura' : 'Read-only'}
                  </span>
                </div>

                {/* Table Status Legend */}
                <div className="mb-5">
                  <TableStatusLegend />
                </div>

                {/* Table Grid - Interactive in COMPLETO mode */}
                <div className={`bg-[#F5F5F4] rounded-xl p-4 ${complexity !== 'completo' ? 'pointer-events-none opacity-90' : ''}`}>
                  <TableGrid
                    tables={tables}
                    onTableClick={complexity === 'completo' ? handleTableClick : undefined}
                  />
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#57534E] bg-[#F5F5F4] p-3 rounded-lg">
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
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-[#9F1239]/10 rounded-lg">
                      <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-serif font-bold text-[#1C1917]">
                      {language === 'es' ? 'Mesas Activas' : 'Active Parties'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-[#9F1239]/10 text-[#9F1239] rounded-lg text-xs font-bold">
                    {stats.activePartiesCount || 0}
                  </span>
                </div>

                {stats.activePartiesCount > 0 ? (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar">
                    {activeParties?.map((party: any) => (
                      <div
                        key={party.service_id}
                        className="p-3.5 bg-[#F5F5F4] rounded-xl shadow-sm hover:bg-[#E7E5E4] transition-all duration-200 border border-[#E7E5E4]"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-semibold text-[#1C1917] text-sm">
                            {party.customer_name}
                          </div>
                          <span className="text-xs font-medium text-[#57534E] bg-white px-2 py-0.5 rounded-md">
                            {formatTimestamp(party.seated_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#57534E]">
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="font-medium">{party.party_size} {language === 'es' ? 'pax' : 'guests'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="mt-2 w-full px-3 py-1.5 bg-[#9F1239] hover:bg-[#881337] text-white text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                          >
                            {language === 'es' ? 'Completar Servicio' : 'Complete Service'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4">
                    <div className="w-16 h-16 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <span className="text-3xl">🍽️</span>
                    </div>
                    <p className="text-sm font-medium text-[#1C1917] mb-1">
                      {language === 'es' ? 'No hay mesas activas' : 'No active parties'}
                    </p>
                    <p className="text-xs text-[#57534E]">
                      {language === 'es' ? 'Las mesas aparecerán aquí al sentar clientes' : 'Tables will appear here when guests are seated'}
                    </p>
                  </div>
                )}
              </div>

              {/* Waitlist Panel */}
              <div className="bg-white border border-[#E7E5E4] rounded-xl shadow-md p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-[#d97706]/10 rounded-lg">
                      <svg className="w-5 h-5 text-[#d97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-serif font-bold text-[#1C1917]">
                      {language === 'es' ? 'Lista de Espera' : 'Waitlist'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-[#d97706]/10 text-[#d97706] rounded-lg text-xs font-bold">
                    {stats.waitlistCount || 0}
                  </span>
                </div>

                <div className="text-center py-10 px-4">
                  <div className="w-16 h-16 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">⏱️</span>
                  </div>
                  <p className="text-sm font-medium text-[#1C1917] mb-1">
                    {language === 'es' ? 'La lista de espera está vacía' : 'Waitlist is empty'}
                  </p>
                  <p className="text-xs text-[#57534E] mb-4">
                    {language === 'es'
                      ? 'Los clientes pueden agregar sus nombres cuando lleguen'
                      : 'Customers can add their names when they arrive'}
                  </p>
                </div>

                <div className="flex items-start gap-2 text-xs text-[#57534E] bg-[#9F1239]/5 p-3 rounded-lg border border-[#9F1239]/20">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="bg-white border border-[#E7E5E4] rounded-2xl p-5 md:p-6 shadow-md animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-[#9F1239]/10 rounded-lg">
              <svg className="w-6 h-6 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-serif font-bold text-[#1C1917]">
              {t.upcomingReservations}
              {showTomorrow && (
                <span className="ml-2 text-sm font-sans font-normal text-[#57534E]">
                  ({language === 'es' ? 'Mañana' : 'Tomorrow'})
                </span>
              )}
            </h2>
          </div>

          {displayedReservations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-20 h-20 bg-gradient-to-br from-[#9F1239]/10 to-[#d97706]/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <span className="text-5xl">✨</span>
              </div>
              <p className="text-[#1C1917] text-lg font-serif font-semibold mb-2">{t.allClear}</p>
              <p className="text-[#57534E] text-sm font-sans">{showTomorrow ? (language === 'es' ? 'Sin reservas mañana' : 'No reservations tomorrow') : t.noUpcoming}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedReservations.map((reservation: any, index: number) => (
                <div
                  key={reservation.reservation_id}
                  className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-5 bg-[#F5F5F4] rounded-xl shadow-sm hover:bg-[#E7E5E4] transition-colors duration-200 border border-[#E7E5E4]"
                  style={{ animationDelay: `${600 + (index * 100)}ms` }}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="text-2xl md:text-3xl font-mono font-bold text-[#9F1239] bg-white px-3 py-2 rounded-lg shadow-sm border-2 border-[#9F1239]/30">
                        {formatTime(reservation.time)}
                      </div>
                    </div>
                    <div className="border-l-2 border-[#9F1239]/40 pl-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-serif font-semibold text-[#1C1917] text-base md:text-lg truncate">
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
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[#57534E]">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-sans font-semibold px-5 py-2.5 rounded-lg transition-all duration-300 shadow-sm hover:shadow-md active:scale-95"
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

        {/* View Tomorrow Toggle (Only show in COMPLETO mode) */}
        {complexity === 'completo' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowTomorrow(!showTomorrow)}
              className={`inline-flex items-center gap-2 font-sans font-semibold text-base md:text-lg transition-all duration-300 group px-4 py-2 rounded-lg ${
                showTomorrow
                  ? 'bg-[#9F1239] text-white'
                  : 'text-[#9F1239] hover:text-white hover:bg-[#9F1239]/20'
              }`}
            >
              <span>{showTomorrow ? (language === 'es' ? 'Ver Hoy' : 'View Today') : t.viewTomorrow}</span>
              <svg className={`w-5 h-5 transition-transform duration-300 ${showTomorrow ? 'rotate-180' : 'group-hover:translate-x-1'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="p-2 bg-[#9F1239]/10 rounded-lg">
                  <svg className="w-6 h-6 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1C1917]">
                    {language === 'es' ? 'Mesa' : 'Table'} {selectedTable.table_number}
                  </h3>
                  <p className="text-sm text-[#57534E]">
                    {selectedTable.capacity} {language === 'es' ? 'personas' : 'seats'} • {selectedTable.location}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTableActionsModal(false);
                  setSelectedTable(null);
                }}
                className="text-[#A8A29E] hover:text-[#57534E] transition-colors"
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
                  className="w-full flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 rounded-xl border border-green-200 transition-colors duration-200"
                >
                  <div className="p-2 bg-green-600 rounded-lg">
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
                  className="w-full flex items-center gap-3 p-4 bg-orange-50 hover:bg-orange-100 rounded-xl border border-orange-200 transition-colors duration-200"
                >
                  <div className="p-2 bg-orange-600 rounded-lg">
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
                  className="w-full flex items-center gap-3 p-4 bg-[#16a34a]/5 hover:bg-[#16a34a]/10 rounded-xl border border-[#16a34a]/20 transition-colors duration-200"
                >
                  <div className="p-2 bg-[#16a34a] rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-[#16a34a]">
                      {language === 'es' ? 'Marcar Disponible' : 'Mark as Available'}
                    </div>
                    <div className="text-xs text-[#15803d]">
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
                  className="w-full flex items-center gap-3 p-4 bg-[#9F1239]/5 hover:bg-[#9F1239]/10 rounded-xl border border-[#9F1239]/20 transition-colors duration-200"
                >
                  <div className="p-2 bg-[#9F1239] rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-[#9F1239]">
                      {language === 'es' ? 'Asignar Clientes' : 'Seat Party'}
                    </div>
                    <div className="text-xs text-[#881337]">
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
              className="w-full mt-4 px-4 py-3 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#57534E] font-semibold rounded-xl transition-all duration-200"
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
                <h3 className="text-lg font-bold text-[#1C1917]">
                  {language === 'es' ? 'Completar Servicio' : 'Complete Service'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowCompleteServiceModal(false);
                  setSelectedServiceToComplete(null);
                }}
                className="text-[#A8A29E] hover:text-[#57534E] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 p-4 bg-[#F5F5F4] rounded-xl border border-[#E7E5E4]">
              <div className="font-semibold text-[#1C1917] mb-2">
                {selectedServiceToComplete.customer_name}
              </div>
              <div className="space-y-1 text-sm text-[#57534E]">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{selectedServiceToComplete.party_size} {language === 'es' ? 'personas' : 'guests'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{language === 'es' ? 'Mesa' : 'Table'} {selectedServiceToComplete.tables?.join(', ')}</span>
                </div>
              </div>
            </div>

            <p className="text-[#57534E] text-sm mb-6">
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
                className="flex-1 px-4 py-3 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#57534E] font-semibold rounded-xl transition-all duration-200"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={() => handleCompleteService(selectedServiceToComplete.service_id)}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg active:scale-95"
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
