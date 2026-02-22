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
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <span className="text-[13px] text-warm-stone">Need help? Contact the restaurant</span>
      </header>

      <div className="flex-1 flex justify-center px-6 py-16">
        <div className="max-w-[520px] w-full">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-serif text-[32px] font-medium text-deep-charcoal tracking-tight mb-2">
              Manage your reservation
            </h1>
            <p className="text-[15px] text-warm-stone font-light">
              Look up your reservation by phone number or confirmation ID.
            </p>
          </div>

          {!reservation ? (
            <>
              {/* Lookup Card */}
              <div className="bg-white border border-border-gray rounded-2xl p-8 mb-6">
                <h3 className="text-[15px] font-semibold text-deep-charcoal mb-5">Find your reservation</h3>

                {/* Phone Input */}
                <div className="mb-4">
                  <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Phone number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setLookupMethod('phone'); }}
                    placeholder="+34 612 345 678"
                    className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-border-gray" />
                  <span className="text-xs font-medium text-muted-stone">or</span>
                  <div className="flex-1 h-px bg-border-gray" />
                </div>

                {/* Confirmation ID Input */}
                <div className="mb-2">
                  <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Confirmation ID</label>
                  <input
                    type="text"
                    value={reservationId}
                    onChange={(e) => { setReservationId(e.target.value); setLookupMethod('id'); }}
                    placeholder="e.g. CEL-2026-0218-A7K3"
                    className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>

                <button
                  onClick={handleLookup}
                  disabled={isLoading}
                  className="w-full mt-4 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Looking up...
                    </>
                  ) : (
                    'Look Up Reservation'
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {/* Result Card */}
              <div className="bg-white border border-border-gray rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
                  <span className="text-[15px] font-semibold">Your Reservation</span>
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
                    reservation.status === 'Confirmed'
                      ? 'bg-[rgba(22,163,74,0.08)] text-green-600'
                      : reservation.status === 'Cancelled'
                      ? 'bg-[rgba(220,38,38,0.08)] text-red-600'
                      : 'bg-[rgba(217,119,6,0.08)] text-amber-600'
                  }`}>
                    {reservation.status}
                  </span>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  {!isModifying ? (
                    <>
                      {(() => {
                        const { date, time } = parseReservationDateTime(reservation);
                        return (
                          <div className="space-y-0">
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">Date</span>
                              <span className="text-sm font-medium text-deep-charcoal">
                                {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                }) : 'Not set'}
                              </span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">Time</span>
                              <span className="text-sm font-medium text-deep-charcoal">{time || 'Not set'}</span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">Party size</span>
                              <span className="text-sm font-medium text-deep-charcoal">{reservation.party_size} guests</span>
                            </div>
                            <div className="flex justify-between py-2.5 border-b border-soft-gray">
                              <span className="text-[13px] text-warm-stone">Guest</span>
                              <span className="text-sm font-medium text-deep-charcoal">{reservation.customer_name}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                              <span className="text-[13px] text-warm-stone">Confirmation</span>
                              <span className="text-[13px] font-mono font-medium text-burgundy">{reservation.reservation_id}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {reservation.special_requests && (
                        <div className="mt-4 pt-4 border-t border-border-gray">
                          <div className="text-xs text-warm-stone mb-1.5">Special Requests</div>
                          <div className="text-sm text-deep-charcoal bg-soft-gray p-3 rounded-lg">{reservation.special_requests}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Date</label>
                        <input type="date" value={modifiedData.date} onChange={(e) => setModifiedData({ ...modifiedData, date: e.target.value })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Time</label>
                        <input type="time" value={modifiedData.time} onChange={(e) => setModifiedData({ ...modifiedData, time: e.target.value })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Party Size</label>
                        <input type="number" min="1" max="20" value={modifiedData.party_size} onChange={(e) => setModifiedData({ ...modifiedData, party_size: parseInt(e.target.value) })} className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal focus:outline-none focus:border-burgundy" />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Special Requests</label>
                        <textarea value={modifiedData.special_requests || ''} onChange={(e) => setModifiedData({ ...modifiedData, special_requests: e.target.value })} rows={3} placeholder="Allergies, celebrations, seating preferences..." className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy resize-none" />
                      </div>
                      <div className="flex gap-2.5 pt-2">
                        <button onClick={() => { setIsModifying(false); setModifiedData(reservation); }} className="flex-1 py-3 border border-border-gray bg-white text-stone-gray font-medium rounded-[10px] text-[13px] hover:border-muted-stone transition-colors">Cancel</button>
                        <button onClick={handleModify} disabled={isLoading} className="flex-1 py-3 bg-burgundy text-white font-semibold rounded-[10px] text-[13px] hover:bg-burgundy-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                          {isLoading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</>) : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isModifying && reservation.status !== 'Cancelled' && (
                  <div className="flex gap-2.5 px-6 py-5 border-t border-soft-gray">
                    <button onClick={() => setIsModifying(true)} className="flex-1 py-3 border border-border-gray bg-white text-stone-gray font-medium rounded-[10px] text-[13px] hover:border-muted-stone transition-colors">
                      Edit Reservation
                    </button>
                    <button onClick={handleCancel} disabled={isLoading} className="flex-1 py-3 border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.04)] text-red-600 font-medium rounded-[10px] text-[13px] hover:bg-[rgba(220,38,38,0.08)] transition-colors disabled:opacity-50">
                      Cancel Reservation
                    </button>
                  </div>
                )}
              </div>

              {/* Back Button */}
              <button
                onClick={() => { setReservation(null); setReservationId(''); setPhone(''); setIsModifying(false); }}
                className="w-full text-sm text-warm-stone hover:text-stone-gray transition-colors py-2"
              >
                &larr; Look up another reservation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
