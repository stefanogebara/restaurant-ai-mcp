import { useState, useMemo } from 'react';
import type { UpcomingReservation } from '../../types/host.types';
import ReservationDetailsModal from './ReservationDetailsModal';

interface ReservationsCalendarProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
}

export default function ReservationsCalendar({ reservations, onCheckIn }: ReservationsCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailsReservation, setDetailsReservation] = useState<UpcomingReservation | null>(null);

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

    if (dateStr === todayStr) return 'Today';
    if (dateStr === tomorrowStr) return 'Tomorrow';

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
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

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📅</div>
        <div className="text-gray-400 text-lg">No upcoming reservations</div>
        <div className="text-gray-500 text-sm mt-2">Reservations will appear here when customers book</div>
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
              className={`
                w-full p-4 rounded-xl border-2 transition-all text-left
                ${isSelected
                  ? 'border-purple-500 bg-purple-500/10'
                  : isToday
                  ? 'border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-[#1E1E1E]/50'
                }
              `}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl
                    ${isSelected
                      ? 'bg-purple-500 text-white'
                      : isToday
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-300'
                    }
                  `}>
                    {new Date(date + 'T00:00:00').getDate()}
                  </div>
                  <div>
                    <div className={`font-semibold ${isSelected ? 'text-purple-400' : isToday ? 'text-blue-400' : 'text-white'}`}>
                      {formatDate(date)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {count} {count === 1 ? 'reservation' : 'reservations'}
                    </div>
                  </div>
                </div>
                <div className={`transform transition-transform ${isSelected ? 'rotate-180' : ''}`}>
                  <svg className={`w-5 h-5 ${isSelected ? 'text-purple-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Reservations List */}
              {isSelected && (
                <div className="mt-4 space-y-2 border-t border-gray-700 pt-4">
                  {reservationsByDate[date].map((reservation) => (
                    <div
                      key={reservation.reservation_id}
                      className="bg-[#0A0A0A] rounded-lg p-3 border border-gray-800"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{reservation.customer_name}</span>
                            {reservation.checked_in && (
                              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                ✓ Checked In
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            Party of {reservation.party_size} · {formatTime(reservation.time || '')}
                          </div>
                          {reservation.customer_phone && (
                            <div className="text-xs text-gray-500 mt-1">
                              📞 {reservation.customer_phone}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-purple-400">
                            {formatTime(reservation.time || '')}
                          </div>
                        </div>
                      </div>

                      {reservation.special_requests && (
                        <div className="text-xs text-gray-400 bg-gray-800/50 rounded p-2 mb-2">
                          <span className="text-gray-500">Note:</span> {reservation.special_requests}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {!reservation.checked_in && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCheckIn(reservation);
                            }}
                            className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                          >
                            Check In
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailsReservation(reservation);
                          }}
                          className="px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
                        >
                          Details
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

      {/* Summary Stats */}
      <div className="bg-[#1E1E1E]/50 rounded-xl p-4 border border-gray-800">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{reservations.length}</div>
            <div className="text-xs text-gray-400">Total Reservations</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">{sortedDates.length}</div>
            <div className="text-xs text-gray-400">Days with Bookings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              {reservations.reduce((sum, r) => sum + (r.party_size || 0), 0)}
            </div>
            <div className="text-xs text-gray-400">Total Guests</div>
          </div>
        </div>
      </div>

      {/* Reservation Details Modal */}
      <ReservationDetailsModal
        isOpen={detailsReservation !== null}
        reservation={detailsReservation}
        onClose={() => setDetailsReservation(null)}
      />
    </div>
  );
}
