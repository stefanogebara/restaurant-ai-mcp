import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import WalkInModal from '../components/host/WalkInModal';
import SeatPartyModal from '../components/host/SeatPartyModal';
import CheckInModal from '../components/host/CheckInModal';
import TableGrid from '../components/host/TableGrid';
import TableStatusLegend from '../components/host/TableStatusLegend';

type ComplexityLevel = 'estándar' | 'completo' | 'avanzado';

interface SimpleDashboardProps {
  language?: 'es' | 'en';
}

export default function SimpleDashboard({ language = 'es' }: SimpleDashboardProps) {
  const [complexity, setComplexity] = useState<ComplexityLevel>('estándar');
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

  // Load complexity preference from localStorage
  useEffect(() => {
    // First priority: Explicit dashboard complexity preference
    const saved = localStorage.getItem('dashboard-complexity');
    if (saved && ['estándar', 'completo', 'avanzado'].includes(saved)) {
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
          'simple': 'estándar',
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
      // If parsing fails, just use default ('estándar')
      console.error('Error loading onboarding template preference:', error);
    }
  }, []);

  // Save complexity preference to localStorage
  const handleComplexityChange = (level: ComplexityLevel) => {
    setComplexity(level);
    localStorage.setItem('dashboard-complexity', level);
  };

  // Fetch dashboard data
  const { data: dashboardData, refetch } = useQuery({
    queryKey: ['simpleDashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

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

  const stats = dashboardData?.data?.summary || {};
  const tables = dashboardData?.data?.tables || [];
  const reservations = dashboardData?.data?.upcoming_reservations || [];

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
        body: JSON.stringify({ service_id: serviceId }),
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
    <div className="min-h-screen bg-gradient-to-br from-white via-indigo-100 to-blue-100 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight mb-1">
                🍽️ {t.today}
              </h1>
              <p className="text-slate-600 text-base md:text-lg font-medium">
                {getDayName()}, {formatDate()}
              </p>
            </div>

            {/* Complexity Toggle - Enhanced Design */}
            <div className="flex items-center gap-1.5 bg-white rounded-xl p-1.5 shadow-sm border border-slate-200/60 backdrop-blur-sm">
              <span className="text-xs text-slate-500 font-semibold px-2 hidden sm:block">{t.viewLevel}</span>

              <button
                onClick={() => handleComplexityChange('estándar')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  complexity === 'estándar'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-500/20 scale-105'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={t.estándar}
              >
                📈
              </button>
              <button
                onClick={() => handleComplexityChange('completo')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  complexity === 'completo'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-500/20 scale-105'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={t.completo}
              >
                ⚙️
              </button>
              <button
                onClick={() => window.location.href = '/host-dashboard/advanced'}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  complexity === 'avanzado'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-500/20 scale-105'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={t.avanzado}
              >
                🎯
              </button>
            </div>
          </div>
        </div>

        {/* Key Stats - ESTÁNDAR MODE */}
        {complexity === 'estándar' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-8">
            {/* Occupied Tables */}
            <div className="group bg-white rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-xl border border-slate-200/60 hover:border-indigo-200 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 transition-colors">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                  {occupancyPercent}%
                </span>
              </div>
              <div className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tracking-tight">
                {occupiedTables}<span className="text-slate-400">/{totalTables}</span>
              </div>
              <div className="text-sm font-semibold text-slate-600 mb-3">
                {t.tablesOccupied}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${occupancyPercent}%` }}
                  />
                </div>
                <span className="font-medium">{t.occupancy}</span>
              </div>
            </div>

            {/* Today's Reservations */}
            <div className="group bg-white rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-xl border border-slate-200/60 hover:border-green-200 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-green-50 rounded-xl group-hover:bg-green-100 transition-colors">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                  {todayReservations.filter((r: any) => r.checked_in).length}/{todayReservations.length}
                </span>
              </div>
              <div className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tracking-tight">
                {todayReservations.length}
              </div>
              <div className="text-sm font-semibold text-slate-600 mb-3">
                {t.reservationsToday}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {todayReservations.filter((r: any) => r.checked_in).length} {language === 'es' ? 'ya sentados' : 'already seated'}
              </div>
            </div>

            {/* Waiting */}
            <div className="group bg-white rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-xl border border-slate-200/60 hover:border-orange-200 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-orange-50 rounded-xl group-hover:bg-orange-100 transition-colors">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                  ~15 min
                </span>
              </div>
              <div className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tracking-tight">
                {stats.waitlistCount || 0}
              </div>
              <div className="text-sm font-semibold text-slate-600 mb-3">
                {t.waiting}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {language === 'es' ? 'Tiempo promedio de espera' : 'Average wait time'}
              </div>
            </div>

            {/* Active Parties */}
            <div className="group bg-white rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-xl border border-slate-200/60 hover:border-purple-200 transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">
                  {stats.totalSeatedGuests || 0}
                </span>
              </div>
              <div className="text-4xl md:text-5xl font-bold text-slate-900 mb-2 tracking-tight">
                {stats.activePartiesCount || 0}
              </div>
              <div className="text-sm font-semibold text-slate-600 mb-3">
                {t.activeParties}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {stats.totalSeatedGuests || 0} {language === 'es' ? 'comensales totales' : 'total guests'}
              </div>
            </div>
          </div>
        )}

        {/* Key Stats - COMPLETO MODE */}
        {complexity === 'completo' && (
          <div className="space-y-4 md:space-y-5 mb-8">
            {/* Main Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Occupied Tables */}
              <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md border border-slate-200/60 transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-indigo-600 tracking-tight">
                    {occupiedTables}<span className="text-slate-400 text-2xl">/{totalTables}</span>
                  </div>
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-600 mb-3">{t.tablesOccupied}</div>
                <div className="space-y-2">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{occupancyPercent}% {t.occupancy}</div>
                </div>
              </div>

              {/* Reservations */}
              <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md border border-slate-200/60 transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-green-600 tracking-tight">
                    {todayReservations.length}
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-600 mb-3">{t.reservationsToday}</div>
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <div className="flex-1 h-2 bg-green-500 rounded-full" style={{ width: `${(todayReservations.filter((r: any) => r.checked_in).length / Math.max(todayReservations.length, 1)) * 100}%` }} />
                    <div className="flex-1 h-2 bg-slate-100 rounded-full" />
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {todayReservations.filter((r: any) => r.checked_in).length}/{todayReservations.length} {language === 'es' ? 'sentados' : 'seated'}
                  </div>
                </div>
              </div>

              {/* Waiting */}
              <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md border border-slate-200/60 transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-orange-600 tracking-tight">
                    {stats.waitlistCount || 0}
                  </div>
                  <div className="p-2 bg-orange-50 rounded-lg">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-600 mb-3">{t.waiting}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-orange-600">
                    ~15 min
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {language === 'es' ? 'Espera promedio' : 'Average wait'}
                  </div>
                </div>
              </div>

              {/* Active Parties */}
              <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md border border-slate-200/60 transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-3xl md:text-4xl font-bold text-purple-600 tracking-tight">
                    {stats.activePartiesCount || 0}
                  </div>
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-600 mb-3">{t.activeParties}</div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-purple-600">
                    {stats.totalSeatedGuests || 0} {t.people}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {language === 'es' ? 'Comensales totales' : 'Total guests'}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 border border-blue-200/60 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white rounded-lg shadow-sm">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-blue-700 mb-0.5">{t.avgDuration}</div>
                    <div className="text-2xl font-bold text-blue-900 tracking-tight">1.2h</div>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-pink-50 to-pink-100/50 rounded-xl p-4 border border-pink-200/60 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white rounded-lg shadow-sm">
                    <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-pink-700 mb-0.5">{t.peakHours}</div>
                    <div className="text-2xl font-bold text-pink-900 tracking-tight">20-22h</div>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 border border-emerald-200/60 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white rounded-lg shadow-sm">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 mb-0.5">{language === 'es' ? 'Ingresos Hoy' : 'Revenue Today'}</div>
                    <div className="text-2xl font-bold text-emerald-900 tracking-tight">€1,240</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Walk-in Button */}
        <button
          onClick={() => setShowWalkInModal(true)}
          className="group w-full mb-8 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold py-5 md:py-6 px-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] border border-indigo-500/20"
        >
          <div className="flex items-center justify-center gap-3">
            <svg className="w-6 h-6 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200/60">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-slate-900">
                      {language === 'es' ? 'Disposición de Mesas' : 'Table Layout'}
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {language === 'es' ? 'Solo lectura' : 'Read-only'}
                  </span>
                </div>

                {/* Table Status Legend */}
                <div className="mb-5">
                  <TableStatusLegend />
                </div>

                {/* Table Grid - Interactive in COMPLETO mode */}
                <div className={`bg-slate-50/50 rounded-xl p-4 ${complexity !== 'completo' ? 'pointer-events-none opacity-90' : ''}`}>
                  <TableGrid
                    tables={tables}
                    onTableClick={complexity === 'completo' ? handleTableClick : undefined}
                  />
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
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
              <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200/60">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900">
                      {language === 'es' ? 'Mesas Activas' : 'Active Parties'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                    {stats.activePartiesCount || 0}
                  </span>
                </div>

                {stats.activePartiesCount > 0 ? (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto custom-scrollbar">
                    {dashboardData?.data?.activeParties?.map((party: any) => (
                      <div
                        key={party.service_id}
                        className="p-3.5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200/60 hover:border-purple-200 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-semibold text-slate-900 text-sm">
                            {party.customer_name}
                          </div>
                          <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md">
                            {formatTimestamp(party.seated_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="font-medium">{party.party_size} {language === 'es' ? 'pax' : 'guests'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">{language === 'es' ? 'Mesa' : 'Table'} {party.table_ids?.join(', ')}</span>
                          </div>
                        </div>
                        {complexity === 'completo' && (
                          <button
                            onClick={() => {
                              setSelectedServiceToComplete(party);
                              setShowCompleteServiceModal(true);
                            }}
                            className="mt-2 w-full px-3 py-1.5 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                          >
                            {language === 'es' ? 'Completar Servicio' : 'Complete Service'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <span className="text-3xl">🍽️</span>
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">
                      {language === 'es' ? 'No hay mesas activas' : 'No active parties'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {language === 'es' ? 'Las mesas aparecerán aquí al sentar clientes' : 'Tables will appear here when guests are seated'}
                    </p>
                  </div>
                )}
              </div>

              {/* Waitlist Panel */}
              <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200/60">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-orange-100 rounded-lg">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900">
                      {language === 'es' ? 'Lista de Espera' : 'Waitlist'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold">
                    {stats.waitlistCount || 0}
                  </span>
                </div>

                <div className="text-center py-10 px-4">
                  <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">⏱️</span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 mb-1">
                    {language === 'es' ? 'La lista de espera está vacía' : 'Waitlist is empty'}
                  </p>
                  <p className="text-xs text-slate-400 mb-4">
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
        <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
              {t.upcomingReservations}
            </h2>
          </div>

          {todayReservations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <span className="text-5xl">✨</span>
              </div>
              <p className="text-slate-900 text-lg font-semibold mb-2">{t.allClear}</p>
              <p className="text-slate-500 text-sm">{t.noUpcoming}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayReservations.map((reservation: any) => (
                <div
                  key={reservation.reservation_id}
                  className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200/60 hover:border-indigo-200 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="text-2xl md:text-3xl font-bold text-indigo-600 bg-white px-3 py-2 rounded-lg shadow-sm">
                        {formatTime(reservation.time)}
                      </div>
                    </div>
                    <div className="border-l-2 border-indigo-200 pl-4 flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 text-base md:text-lg mb-1 truncate">
                        {reservation.customer_name}
                      </div>
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
                        className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
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
                      <div className="w-full sm:w-auto bg-green-100 text-green-800 font-semibold px-5 py-2.5 rounded-lg border border-green-200">
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

        {/* View Tomorrow (Only show in ESTÁNDAR and COMPLETO modes) */}
        {(complexity === 'estándar' || complexity === 'completo') && (
          <div className="mt-6 text-center">
            <button className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold text-base md:text-lg transition-colors group">
              <span>{t.viewTomorrow}</span>
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
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
                  onClick={() => handleFreeTable(selectedTable.record_id)}
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
                  onClick={() => handleUpdateTableStatus(selectedTable.record_id, 'Being Cleaned')}
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
                  onClick={() => handleUpdateTableStatus(selectedTable.record_id, 'Available')}
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
                  <span>{language === 'es' ? 'Mesa' : 'Table'} {selectedServiceToComplete.table_ids?.join(', ')}</span>
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
