import { useState } from 'react';
import { authFetch } from '../services/api';
import { useToast } from '../contexts/ToastContext';

interface Reservation {
  reservation_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  date?: string;
  time?: string;
  reservation_time?: string; // API returns combined date-time
  party_size: number;
  special_requests?: string;
  status: string;
}

// Helper to parse reservation_time into date and time
function parseReservationDateTime(reservation: Reservation) {
  // If we have reservation_time (API format), parse it
  if (reservation.reservation_time) {
    const [datePart, timePart] = reservation.reservation_time.split(' ');
    return { date: datePart, time: timePart?.slice(0, 5) || '' }; // Remove seconds from time
  }
  // Otherwise use separate fields
  return { date: reservation.date || '', time: reservation.time || '' };
}

export default function CustomerPortal() {
  const [lookupMethod, setLookupMethod] = useState<'id' | 'phone'>('id');
  const [reservationId, setReservationId] = useState('');
  const [phone, setPhone] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedData, setModifiedData] = useState<Partial<Reservation>>({});
  const { success, error: showError } = useToast();

  const handleLookup = async () => {
    if (lookupMethod === 'id' && !reservationId.trim()) {
      showError('Please enter your reservation ID');
      return;
    }
    if (lookupMethod === 'phone' && !phone.trim()) {
      showError('Please enter your phone number');
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'lookup',
        ...(lookupMethod === 'id'
          ? { reservation_id: reservationId }
          : { customer_phone: phone }
        )
      });

      const response = await authFetch(`/api/reservations?${params}`);
      const data = await response.json();

      if (data.success && data.reservation) {
        setReservation(data.reservation);
        // Parse reservation_time into separate date/time for the modify form
        const { date, time } = parseReservationDateTime(data.reservation);
        setModifiedData({ ...data.reservation, date, time });
        success('Reservation found!');
      } else {
        showError(data.message || 'Reservation not found');
        setReservation(null);
      }
    } catch (err) {
      showError('Failed to lookup reservation');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModify = async () => {
    if (!reservation) return;

    setIsLoading(true);
    try {
      const response = await authFetch('/api/reservations?action=modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation.reservation_id,
          date: modifiedData.date,
          time: modifiedData.time,
          party_size: modifiedData.party_size,
          special_requests: modifiedData.special_requests
        })
      });

      const data = await response.json();

      if (data.success) {
        setReservation({ ...reservation, ...modifiedData });
        setIsModifying(false);
        success('Reservation updated successfully!');
      } else {
        showError(data.message || 'Failed to update reservation');
      }
    } catch (err) {
      showError('Failed to update reservation');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;

    if (!window.confirm('Are you sure you want to cancel this reservation?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await authFetch(`/api/reservations?action=cancel&reservation_id=${reservation.reservation_id}`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        success('Reservation cancelled successfully');
        setReservation(null);
        setReservationId('');
        setPhone('');
      } else {
        showError(data.message || 'Failed to cancel reservation');
      }
    } catch (err) {
      showError('Failed to cancel reservation');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="bg-white/95 border-b border-[#E7E5E4] sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-serif font-bold text-[#1C1917] tracking-tight">Customer Portal</h1>
              <p className="text-[#78716C] text-sm">Manage your reservations</p>
            </div>
            <a
              href="/host-dashboard"
              className="px-4 py-2 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-medium rounded-full transition-colors"
            >
              Staff Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {!reservation ? (
          /* Lookup Section */
          <div className="bg-white border border-[#E7E5E4]/50 rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-serif font-bold text-[#1C1917] mb-6">Find Your Reservation</h2>

            {/* Lookup Method Toggle */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setLookupMethod('id')}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  lookupMethod === 'id'
                    ? 'bg-[#9F1239] text-white shadow-sm'
                    : 'bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4]'
                }`}
              >
                Reservation ID
              </button>
              <button
                onClick={() => setLookupMethod('phone')}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  lookupMethod === 'phone'
                    ? 'bg-[#9F1239] text-white shadow-sm'
                    : 'bg-[#F5F5F4] text-[#78716C] hover:bg-[#E7E5E4]'
                }`}
              >
                Phone Number
              </button>
            </div>

            {lookupMethod === 'id' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-2">
                    Reservation ID
                  </label>
                  <input
                    type="text"
                    value={reservationId}
                    onChange={(e) => setReservationId(e.target.value)}
                    placeholder="RES-20251026-1234"
                    className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                    onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1C1917] mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555-1234"
                    className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                    onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleLookup}
              disabled={isLoading}
              className="w-full mt-6 px-6 py-4 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Looking up...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Find Reservation</span>
                </>
              )}
            </button>

            <div className="mt-6 p-4 bg-[#F5F5F4]/50 border border-[#E7E5E4] rounded-xl">
              <p className="text-sm text-[#78716C] text-center">
                Your reservation ID was sent to you via email when you booked.
              </p>
            </div>
          </div>
        ) : (
          /* Reservation Details Section */
          <div className="space-y-6">
            {/* Reservation Card */}
            <div className="bg-white border border-[#E7E5E4]/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-[#9F1239] to-[#881337] p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      {reservation.customer_name}
                    </h2>
                    <p className="text-white/80">
                      Reservation {reservation.reservation_id}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    reservation.status === 'Confirmed'
                      ? 'bg-[#22c55e] text-white'
                      : reservation.status === 'Cancelled'
                      ? 'bg-[#dc2626] text-white'
                      : 'bg-[#d97706] text-white'
                  }`}>
                    {reservation.status}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {!isModifying ? (
                  <>
                    {/* View Mode */}
                    <div className="grid grid-cols-2 gap-4">
                      {(() => {
                        const { date, time } = parseReservationDateTime(reservation);
                        return (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                                <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-xs text-[#78716C]">Date</div>
                                <div className="font-semibold text-[#1C1917]">
                                  {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  }) : 'Not set'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                                <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-xs text-[#78716C]">Time</div>
                                <div className="font-semibold text-[#1C1917]">{time || 'Not set'}</div>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-[#78716C]">Party Size</div>
                          <div className="font-semibold text-[#1C1917]">{reservation.party_size} guests</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#9F1239]/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-[#78716C]">Phone</div>
                          <div className="font-semibold text-[#1C1917]">{reservation.customer_phone}</div>
                        </div>
                      </div>
                    </div>

                    {reservation.special_requests && (
                      <div className="pt-4 border-t border-[#E7E5E4]">
                        <div className="text-xs text-[#78716C] mb-2">Special Requests</div>
                        <div className="text-[#1C1917] bg-[#F5F5F4]/50 p-3 rounded-xl">
                          {reservation.special_requests}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {reservation.status !== 'Cancelled' && (
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => setIsModifying(true)}
                          className="flex-1 px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Modify
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={isLoading}
                          className="flex-1 px-4 py-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel Reservation
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Edit Mode */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-[#1C1917] mb-2">Date</label>
                        <input
                          type="date"
                          value={modifiedData.date}
                          onChange={(e) => setModifiedData({ ...modifiedData, date: e.target.value })}
                          className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#1C1917] mb-2">Time</label>
                        <input
                          type="time"
                          value={modifiedData.time}
                          onChange={(e) => setModifiedData({ ...modifiedData, time: e.target.value })}
                          className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#1C1917] mb-2">Party Size</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={modifiedData.party_size}
                          onChange={(e) => setModifiedData({ ...modifiedData, party_size: parseInt(e.target.value) })}
                          className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[#1C1917] mb-2">Special Requests</label>
                        <textarea
                          value={modifiedData.special_requests || ''}
                          onChange={(e) => setModifiedData({ ...modifiedData, special_requests: e.target.value })}
                          rows={3}
                          placeholder="Any dietary restrictions, occasion, seating preferences..."
                          className="w-full px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-[#9F1239]"
                        />
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setIsModifying(false);
                            setModifiedData(reservation);
                          }}
                          className="flex-1 px-4 py-3 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleModify}
                          disabled={isLoading}
                          className="flex-1 px-4 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => {
                setReservation(null);
                setReservationId('');
                setPhone('');
                setIsModifying(false);
              }}
              className="w-full px-4 py-3 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-medium rounded-xl transition-colors"
            >
              ← Look up another reservation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
