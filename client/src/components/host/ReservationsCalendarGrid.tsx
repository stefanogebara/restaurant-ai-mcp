/**
 * Reservations Calendar Grid
 *
 * Google Calendar-style visual grid showing reservations by time and day
 * Displays party size, table assignments, and customer names
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { UpcomingReservation } from '../../types/host.types';

interface ReservationsCalendarGridProps {
  reservations: UpcomingReservation[];
  onCheckIn: (reservation: UpcomingReservation) => void;
  onRecordOutcome: (reservation: UpcomingReservation) => void;
}

// Time slots from 11:00 to 23:00 (restaurant hours)
const TIME_SLOTS = [
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'
];

// Colors for different reservation statuses
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  confirmed: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-800' },
  pending: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800' },
  seated: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' },
  completed: { bg: 'bg-soft-gray', border: 'border-muted-stone', text: 'text-stone-gray' },
  cancelled: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800' },
  'no-show': { bg: 'bg-red-200', border: 'border-red-500', text: 'text-red-900' },
};

export default function ReservationsCalendarGrid({
  reservations,
  onCheckIn,
  onRecordOutcome
}: ReservationsCalendarGridProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedReservation, setSelectedReservation] = useState<UpcomingReservation | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to dinner service time (17:00) on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Each time slot row is 48px min-height
      // 17:00 is index 12 in TIME_SLOTS (0-based: 11:00=0, 11:30=1, ..., 17:00=12)
      const dinnerStartIndex = 12;
      const rowHeight = 48;
      scrollContainerRef.current.scrollTop = dinnerStartIndex * rowHeight;
    }
  }, [weekOffset]); // Re-scroll when week changes

  // Get current week's dates
  const weekDates = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (weekOffset * 7)); // Monday

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return date;
    });
  }, [weekOffset]);

  // Group reservations by date and time
  const reservationsByDateAndTime = useMemo(() => {
    const map: Record<string, Record<string, UpcomingReservation[]>> = {};

    reservations.forEach(res => {
      const dateKey = res.date; // YYYY-MM-DD format
      const timeKey = res.time?.substring(0, 5) || '19:00'; // HH:MM format

      if (!map[dateKey]) map[dateKey] = {};
      if (!map[dateKey][timeKey]) map[dateKey][timeKey] = [];
      map[dateKey][timeKey].push(res);
    });

    return map;
  }, [reservations]);

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDayHeader = (date: Date) => {
    const today = new Date();
    const isToday = formatDate(date) === formatDate(today);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = date.getDate();

    return { dayName, dayNum, isToday };
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status.toLowerCase()] || STATUS_COLORS.pending;
  };

  const getWeekLabel = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Calendar Header */}
      <div className="px-6 py-4 border-b border-border-gray flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-deep-charcoal">Reservations Calendar</h2>
          <span className="px-3 py-1 bg-burgundy/10 text-burgundy rounded-full text-sm font-medium">
            {reservations.length} upcoming
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(0)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              weekOffset === 0
                ? 'bg-burgundy text-white'
                : 'text-warm-stone hover:bg-soft-gray'
            }`}
          >
            Today
          </button>
          <div className="flex items-center border border-border-gray rounded-lg">
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-2 hover:bg-soft-gray transition-colors rounded-l-lg"
            >
              <ThiingsIcon name="chevron-left" pxSize={16} />
            </button>
            <span className="px-4 py-1.5 text-sm font-medium min-w-[180px] text-center">
              {getWeekLabel()}
            </span>
            <button
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="p-2 hover:bg-soft-gray transition-colors rounded-r-lg"
            >
              <ThiingsIcon name="chevron-right" pxSize={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Day Headers */}
          <div className="grid grid-cols-8 border-b border-border-gray bg-soft-gray/30">
            <div className="p-3 text-xs font-medium text-warm-stone uppercase tracking-wider">
              Time
            </div>
            {weekDates.map((date, idx) => {
              const { dayName, dayNum, isToday } = formatDayHeader(date);
              return (
                <div
                  key={idx}
                  className={`p-3 text-center ${isToday ? 'bg-burgundy/10' : ''}`}
                >
                  <div className="text-xs font-medium text-warm-stone uppercase">
                    {dayName}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-burgundy' : 'text-deep-charcoal'}`}>
                    {dayNum}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Slots */}
          <div ref={scrollContainerRef} className="max-h-[500px] overflow-y-auto">
            {TIME_SLOTS.map((time) => (
              <div key={time} className="grid grid-cols-8 border-b border-border-gray/50 min-h-[48px]">
                {/* Time Label */}
                <div className="p-2 text-xs text-warm-stone font-medium border-r border-border-gray/50 flex items-start">
                  {time}
                </div>

                {/* Day Cells */}
                {weekDates.map((date, dayIdx) => {
                  const dateKey = formatDate(date);
                  const cellReservations = reservationsByDateAndTime[dateKey]?.[time] || [];
                  const isToday = formatDate(date) === formatDate(new Date());

                  return (
                    <div
                      key={dayIdx}
                      className={`p-1 border-r border-border-gray/50 min-h-[48px] ${
                        isToday ? 'bg-burgundy/5' : ''
                      } ${cellReservations.length > 0 ? '' : 'hover:bg-soft-gray/50'}`}
                    >
                      {cellReservations.map((res, resIdx) => {
                        const colors = getStatusColor(res.status || 'pending');
                        return (
                          <button
                            key={resIdx}
                            onClick={() => setSelectedReservation(res)}
                            className={`w-full mb-1 p-1.5 rounded text-left text-xs border-l-2 ${colors.bg} ${colors.border} ${colors.text} hover:opacity-80 transition-opacity`}
                          >
                            <div className="font-medium truncate">{res.customer_name}</div>
                            <div className="flex items-center gap-1 text-[10px] opacity-75">
                              <ThiingsIcon name="users" pxSize={12} />
                              <span>{res.party_size}</span>
                              {res.table_ids && res.table_ids.length > 0 && (
                                <>
                                  <span className="mx-0.5">•</span>
                                  <span>T{res.table_ids[0]}</span>
                                </>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Legend */}
      <div className="px-6 py-3 border-t border-border-gray bg-soft-gray/30 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-medium text-warm-stone">Status:</span>
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`}></div>
            <span className="text-xs text-warm-stone capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* Reservation Detail Modal */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-border-gray flex items-center justify-between">
              <h3 className="text-lg font-bold text-deep-charcoal">Reservation Details</h3>
              <button
                onClick={() => setSelectedReservation(null)}
                className="p-1 hover:bg-soft-gray rounded-lg transition-colors"
              >
                <ThiingsIcon name="close" pxSize={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-deep-charcoal">{selectedReservation.customer_name}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedReservation.status || 'pending').bg} ${getStatusColor(selectedReservation.status || 'pending').text}`}>
                  {selectedReservation.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-warm-stone">
                  <ThiingsIcon name="clock" pxSize={16} />
                  <span>{selectedReservation.time?.substring(0, 5)}</span>
                </div>
                <div className="flex items-center gap-2 text-warm-stone">
                  <ThiingsIcon name="users" pxSize={16} />
                  <span>{selectedReservation.party_size} guests</span>
                </div>
                {selectedReservation.table_ids && selectedReservation.table_ids.length > 0 && (
                  <div className="flex items-center gap-2 text-warm-stone">
                    <ThiingsIcon name="map-pin" pxSize={16} />
                    <span>Table {selectedReservation.table_ids.join(', ')}</span>
                  </div>
                )}
              </div>

              {selectedReservation.special_requests && (
                <div className="p-3 bg-soft-gray rounded-xl">
                  <div className="text-xs font-medium text-warm-stone mb-1">Special Requests</div>
                  <div className="text-sm text-deep-charcoal">{selectedReservation.special_requests}</div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {selectedReservation.status === 'confirmed' && (
                  <button
                    onClick={() => {
                      onCheckIn(selectedReservation);
                      setSelectedReservation(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-burgundy text-white font-medium rounded-lg hover:bg-burgundy-dark transition-colors"
                  >
                    Check In
                  </button>
                )}
                {selectedReservation.status === 'seated' && (
                  <button
                    onClick={() => {
                      onRecordOutcome(selectedReservation);
                      setSelectedReservation(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Record Outcome
                  </button>
                )}
                <button
                  onClick={() => setSelectedReservation(null)}
                  className="px-4 py-2.5 border border-border-gray text-deep-charcoal font-medium rounded-lg hover:bg-soft-gray transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
