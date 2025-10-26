import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';

interface Reservation {
  reservation_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  date: string;
  time: string;
  party_size: number;
  special_requests?: string;
  status: string;
}

export default function CustomerPortal() {
  const [lookupMethod, setLookupMethod] = useState<'id' | 'phone'>('id');
  const [reservationId, setReservationId] = useState('');
  const [phone, setPhone] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedData, setModifiedData] = useState<Partial<Reservation>>({});
  const { success, error: showError, info } = useToast();

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

      const response = await fetch(`/api/reservations?${params}`);
      const data = await response.json();

      if (data.success && data.reservation) {
        setReservation(data.reservation);
        setModifiedData(data.reservation);
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
      const response = await fetch('/api/reservations?action=modify', {
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
      const response = await fetch(`/api/reservations?action=cancel&reservation_id=${reservation.reservation_id}`, {
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">🍽️ Customer Portal</h1>
              <p className="text-muted-foreground text-sm">Manage your reservations</p>
            </div>
            <a
              href="/host-dashboard"
              className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-all"
            >
              Staff Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {!reservation ? (
          /* Lookup Section */
          <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-foreground mb-6">Find Your Reservation</h2>

            {/* Lookup Method Toggle */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setLookupMethod('id')}
                className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                  lookupMethod === 'id'
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Reservation ID
              </button>
              <button
                onClick={() => setLookupMethod('phone')}
                className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                  lookupMethod === 'phone'
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Phone Number
              </button>
            </div>

            {lookupMethod === 'id' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Reservation ID
                  </label>
                  <input
                    type="text"
                    value={reservationId}
                    onChange={(e) => setReservationId(e.target.value)}
                    placeholder="RES-20251026-1234"
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555-1234"
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleLookup}
              disabled={isLoading}
              className="w-full mt-6 px-6 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
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

            <div className="mt-6 p-4 bg-muted/50 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                💡 Your reservation ID was sent to you via email or SMS when you booked.
              </p>
            </div>
          </div>
        ) : (
          /* Reservation Details Section */
          <div className="space-y-6">
            {/* Reservation Card */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-r from-primary to-primary/80 p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-primary-foreground mb-1">
                      {reservation.customer_name}
                    </h2>
                    <p className="text-primary-foreground/90">
                      Reservation {reservation.reservation_id}
                    </p>
                  </div>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    reservation.status === 'Confirmed'
                      ? 'bg-green-500 text-white'
                      : reservation.status === 'Cancelled'
                      ? 'bg-red-500 text-white'
                      : 'bg-yellow-500 text-white'
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
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Date</div>
                          <div className="font-semibold text-foreground">
                            {new Date(reservation.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Time</div>
                          <div className="font-semibold text-foreground">{reservation.time}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Party Size</div>
                          <div className="font-semibold text-foreground">{reservation.party_size} guests</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Phone</div>
                          <div className="font-semibold text-foreground">{reservation.customer_phone}</div>
                        </div>
                      </div>
                    </div>

                    {reservation.special_requests && (
                      <div className="pt-4 border-t border-border">
                        <div className="text-xs text-muted-foreground mb-2">Special Requests</div>
                        <div className="text-foreground bg-muted/50 p-3 rounded-lg">
                          {reservation.special_requests}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {reservation.status !== 'Cancelled' && (
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => setIsModifying(true)}
                          className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Modify
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={isLoading}
                          className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                        <label className="block text-sm font-medium text-foreground mb-2">Date</label>
                        <input
                          type="date"
                          value={modifiedData.date}
                          onChange={(e) => setModifiedData({ ...modifiedData, date: e.target.value })}
                          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Time</label>
                        <input
                          type="time"
                          value={modifiedData.time}
                          onChange={(e) => setModifiedData({ ...modifiedData, time: e.target.value })}
                          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Party Size</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={modifiedData.party_size}
                          onChange={(e) => setModifiedData({ ...modifiedData, party_size: parseInt(e.target.value) })}
                          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Special Requests</label>
                        <textarea
                          value={modifiedData.special_requests || ''}
                          onChange={(e) => setModifiedData({ ...modifiedData, special_requests: e.target.value })}
                          rows={3}
                          placeholder="Any dietary restrictions, occasion, seating preferences..."
                          className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setIsModifying(false);
                            setModifiedData(reservation);
                          }}
                          className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleModify}
                          disabled={isLoading}
                          className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
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
              className="w-full px-4 py-3 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-all"
            >
              ← Look up another reservation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
