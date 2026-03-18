import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpcomingReservation } from '../../types/host.types';
import ReservationDetailsModal from './ReservationDetailsModal';
import RiskBadge from './RiskBadge';
import { hostAPI } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

interface ReservationsCalendarProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onRecordOutcome?: (reservation: UpcomingReservation) => void;
  onReservationUpdated?: () => void;
}

export default function ReservationsCalendar({ reservations, onCheckIn, onRecordOutcome, onReservationUpdated }: ReservationsCalendarProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailsReservation, setDetailsReservation] = useState<UpcomingReservation | null>(null);

  const handleUpdateReservation = async (updates: Partial<UpcomingReservation>) => {
    if (!detailsReservation) return;

    try {
      await hostAPI.updateReservation({
        reservation_id: detailsReservation.reservation_id,
        ...updates,
      });

      // Close modal and refresh data
      setDetailsReservation(null);
      if (onReservationUpdated) {
        onReservationUpdated();
      }
    } catch (error) {
      console.error('Failed to update reservation:', error);
      alert(t('reservationsCalendar.updateError'));
    }
  };

  // Group reservations by date
  const reservationsByDate = useMemo(() => {
    const grouped: Record<string, UpcomingReservation[]> = {};

    reservations.forEach(reservation => {
      const date = reservation.date || reservation.reservation_time?.split(' ')[0];
      if (date) {
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(reservation);
      }
    });

    // Sort reservations within each date by time
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => {
        const timeA = a.time || a.reservation_time?.split(' ')[1] || '';
        const timeB = b.time || b.reservation_time?.split(' ')[1] || '';
        return timeA.localeCompare(timeB);
      });
    });

    return grouped;
  }, [reservations]);

  // Get sorted dates
  const sortedDates = useMemo(() => {
    return Object.keys(reservationsByDate).sort();
  }, [reservationsByDate]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return t('reservationsCalendar.today');
    if (dateStr === tomorrowStr) return t('reservationsCalendar.tomorrow');

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    };
    return date.toLocaleDateString(dateLocale, options);
  };

  // Format time for display
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Count total reservations per date
  const getReservationCount = (date: string) => {
    return reservationsByDate[date]?.length || 0;
  };

  // Export reservations to CSV
  const exportToCSV = () => {
    // CSV headers
    const headers = [
      t('reservationsCalendar.csvDate'),
      t('reservationsCalendar.csvTime'),
      t('reservationsCalendar.csvCustomerName'),
      t('reservationsCalendar.csvPhone'),
      t('reservationsCalendar.csvPartySize'),
      t('reservationsCalendar.csvStatus'),
      t('reservationsCalendar.csvSpecialRequests')
    ];

    // CSV rows
    const rows = reservations.map(r => [
      r.date || r.reservation_time?.split(' ')[0] || '',
      r.time || r.reservation_time?.split(' ')[1] || '',
      r.customer_name,
      r.customer_phone || '',
      r.party_size.toString(),
      r.checked_in ? t('reservationsCalendar.checkedIn') : r.status || t('reservationsCalendar.confirmed'),
      r.special_requests || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `reservations-${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 bg-soft-gray rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="calendar" pxSize={28} />
        </div>
        <p className="font-semibold text-deep-charcoal">{t('reservationsCalendar.noUpcoming')}</p>
        <p className="text-sm text-stone-gray mt-1">{t('reservationsCalendar.noUpcomingHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar View: List of dates */}
      <div className="grid gap-2">
        {sortedDates.map(date => {
          const count = getReservationCount(date);
          const isSelected = selectedDate === date;
          const isToday = date === new Date().toISOString().split('T')[0];

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(isSelected ? null : date)}
              aria-expanded={isSelected}
              className={`
                w-full p-4 rounded-2xl border-2 transition-all text-left
                ${isSelected
                  ? 'border-burgundy bg-burgundy/5'
                  : isToday
                  ? 'border-burgundy/50 bg-burgundy/5 hover:bg-burgundy/10'
                  : 'border-border-gray hover:border-burgundy/30 bg-white'
                }
              `}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl
                    ${isSelected
                      ? 'bg-burgundy text-white'
                      : isToday
                      ? 'bg-burgundy text-white'
                      : 'bg-soft-gray text-deep-charcoal'
                    }
                  `}>
                    {new Date(date + 'T00:00:00').getDate()}
                  </div>
                  <div>
                    <div className={`font-semibold ${isSelected ? 'text-burgundy' : isToday ? 'text-burgundy' : 'text-deep-charcoal'}`}>
                      {formatDate(date)}
                    </div>
                    <div className="text-sm text-stone-gray">
                      {t('reservationsCalendar.reservationCount', { count })}
                    </div>
                  </div>
                </div>
                <div className={`transform transition-transform ${isSelected ? 'rotate-180' : ''}`}>
                  <ThiingsIcon name="chevron-down" pxSize={20} className={isSelected ? 'text-burgundy' : 'text-stone-gray'} />
                </div>
              </div>

              {/* Expanded Reservations List */}
              {isSelected && (
                <div className="mt-4 space-y-2 border-t border-border-gray pt-4">
                  {reservationsByDate[date].map((reservation) => (
                    <div
                      key={reservation.reservation_id}
                      className="bg-soft-gray rounded-xl p-3 border border-border-gray"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-deep-charcoal">{reservation.customer_name}</span>
                            {reservation.checked_in && (
                              <span className="px-2 py-0.5 bg-rose-600/10 text-rose-600 text-xs rounded-full">
                                ✓ {t('reservationsCalendar.checkedIn')}
                              </span>
                            )}
                            <RiskBadge
                              riskLevel={reservation.no_show_risk_level}
                              riskScore={reservation.no_show_risk_score}
                              size="sm"
                            />
                          </div>
                          <div className="text-sm text-stone-gray mt-1">
                            {t('reservationsCalendar.partyOf', { size: reservation.party_size })} · {formatTime(reservation.time || '')}
                          </div>
                          {reservation.customer_phone && (
                            <div className="text-xs text-muted-stone mt-1">
                              📞 {reservation.customer_phone}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-burgundy">
                            {formatTime(reservation.time || '')}
                          </div>
                        </div>
                      </div>

                      {reservation.special_requests && (
                        <div className="text-xs text-stone-gray bg-white rounded-lg p-2 mb-2 border border-border-gray">
                          <span className="text-muted-stone">{t('reservationsCalendar.note')}:</span> {reservation.special_requests}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {!reservation.checked_in && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCheckIn(reservation);
                            }}
                            className="flex-1 px-3 py-2 text-sm bg-burgundy text-white rounded-xl hover:bg-burgundy-dark transition-colors font-medium"
                          >
                            {t('reservationsCalendar.checkIn')}
                          </button>
                        )}
                        {reservation.no_show_risk_score && onRecordOutcome && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRecordOutcome(reservation);
                            }}
                            className="px-3 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-medium"
                            title="Record actual outcome for ML training"
                          >
                            📊 {t('reservationsCalendar.outcome')}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailsReservation(reservation);
                          }}
                          className="px-3 py-2 text-sm bg-white text-stone-gray border border-border-gray rounded-xl hover:bg-border-gray transition"
                        >
                          {t('reservationsCalendar.details')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Export Button */}
      <button
        onClick={exportToCSV}
        className="w-full px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
      >
        <ThiingsIcon name="download" pxSize={20} />
        {t('reservationsCalendar.exportCsv', { count: reservations.length })}
      </button>

      {/* Summary Stats */}
      <div className="bg-white rounded-2xl p-4 border border-border-gray shadow-md">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-deep-charcoal">{reservations.length}</div>
            <div className="text-xs text-muted-stone">{t('reservationsCalendar.totalReservations')}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-burgundy">{sortedDates.length}</div>
            <div className="text-xs text-muted-stone">{t('reservationsCalendar.daysWithBookings')}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-violet-600">
              {reservations.reduce((sum, r) => sum + (r.party_size || 0), 0)}
            </div>
            <div className="text-xs text-muted-stone">{t('reservationsCalendar.totalGuests')}</div>
          </div>
        </div>
      </div>

      {/* Reservation Details Modal */}
      <ReservationDetailsModal
        isOpen={detailsReservation !== null}
        reservation={detailsReservation}
        onClose={() => setDetailsReservation(null)}
        onUpdate={handleUpdateReservation}
      />
    </div>
  );
}
