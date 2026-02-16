import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface RestaurantInfo {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  slug: string;
  business_hours: Record<string, { open?: string; close?: string; closed?: boolean }>;
  max_party_size: number;
  min_party_size: number;
  advance_booking_days: number;
  average_dining_duration: number;
}

interface TimeSlot {
  time: string;
  available: boolean;
  available_seats: number;
}

type BookingStep = 'details' | 'time' | 'contact' | 'confirm';

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Restaurant data
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Booking form state
  const [step, setStep] = useState<BookingStep>('details');
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load restaurant by slug
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API_BASE}/portal?action=restaurant&slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setRestaurant(data.data);
        } else {
          setError('Restaurant not found');
        }
      })
      .catch(() => setError('Could not load restaurant information'))
      .finally(() => setLoading(false));
  }, [slug]);

  // Generate available dates (next N days)
  const availableDates = useMemo(() => {
    if (!restaurant) return [];
    const days: { value: string; label: string; dayKey: string }[] = [];
    const limit = restaurant.advance_booking_days || 30;
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    for (let i = 0; i < limit; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const value = d.toISOString().split('T')[0];
      const dayKey = dayNames[d.getDay()];
      const dayHours = restaurant.business_hours[dayKey];

      // Skip closed days
      if (!dayHours || dayHours.closed) continue;

      const label = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      days.push({ value, label, dayKey });
    }
    return days;
  }, [restaurant]);

  // Fetch time slots when date or party size changes
  useEffect(() => {
    if (!restaurant || !selectedDate || !partySize) return;
    setLoadingSlots(true);
    setSelectedTime('');
    const params = new URLSearchParams({
      action: 'availability',
      restaurant_id: restaurant.id,
      date: selectedDate,
      party_size: String(partySize)
    });
    fetch(`${API_BASE}/portal?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.slots) {
          setTimeSlots(data.slots);
        } else {
          setTimeSlots([]);
        }
      })
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [restaurant, selectedDate, partySize]);

  // Format time for display (24h -> 12h)
  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  // Handle reservation submission
  const handleSubmit = async () => {
    if (!restaurant) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch(`${API_BASE}/portal?action=reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || undefined,
          party_size: partySize,
          date: selectedDate,
          time: selectedTime,
          special_requests: specialRequests.trim() || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        navigate(`/book/${slug}/confirmed`, {
          state: {
            reservation: data.reservation,
            restaurant_name: restaurant.name
          }
        });
      } else {
        setSubmitError(data.message || 'Could not complete reservation');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step navigation
  const canGoToTime = partySize > 0 && selectedDate !== '';
  const canGoToContact = selectedTime !== '';
  const canSubmit = customerName.trim() !== '' && customerPhone.trim() !== '';

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-[#1C1917] opacity-50">
          Seatable<span className="text-[#9F1239]">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E7E5E4] border-t-[#9F1239]" />
      </div>
    );
  }

  // ---- Error state ----
  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 max-w-md text-center shadow-sm">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1C1917] mb-2">Restaurant Not Found</h1>
          <p className="text-sm text-[#57534E]">
            {error || 'The restaurant you are looking for does not exist or is not accepting online reservations.'}
          </p>
        </div>
        <p className="mt-6 text-xs text-[#A8A29E]">
          Powered by <span className="font-serif">Seatable<span className="text-[#9F1239]">.</span></span>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="bg-white border-b border-[#E7E5E4] sticky top-0 z-50">
        <div className="h-1 bg-gradient-to-r from-[#9F1239] to-[#be185d]" />
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-xl font-serif font-bold text-[#1C1917]">{restaurant.name}</h1>
          <p className="text-sm text-[#57534E]">
            {restaurant.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} &middot; {restaurant.city}, {restaurant.country}
          </p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-24">
        {/* Progress Steps */}
        <div className="flex items-center gap-1 mb-6">
          {(['details', 'time', 'contact', 'confirm'] as BookingStep[]).map((s, i) => {
            const labels = ['Details', 'Time', 'Contact', 'Confirm'];
            const isActive = i <= ['details', 'time', 'contact', 'confirm'].indexOf(step);
            return (
              <div key={s} className="flex flex-col items-center gap-1.5 flex-1">
                <div className={`h-1.5 w-full rounded-full transition-colors ${
                  isActive ? 'bg-[#9F1239]' : 'bg-[#E7E5E4]'
                }`} />
                <span className={`text-[10px] font-medium transition-colors ${
                  isActive ? 'text-[#9F1239]' : 'text-[#A8A29E]'
                }`}>{labels[i]}</span>
              </div>
            );
          })}
        </div>

        {/* Step 1: Party Size + Date */}
        {step === 'details' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-[#1C1917] mb-1">Make a Reservation</h2>
              <p className="text-sm text-[#57534E]">Choose your party size and preferred date.</p>
            </div>

            {/* Party Size */}
            <div>
              <label className="block text-sm font-semibold text-[#1C1917] mb-2">Number of Guests</label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: Math.min(restaurant.max_party_size, 10) }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setPartySize(n)}
                    className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                      partySize === n
                        ? 'bg-[#9F1239] text-white shadow-md shadow-[#9F1239]/20'
                        : 'bg-white border border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]/30'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {restaurant.max_party_size > 10 && (
                  <button
                    onClick={() => {
                      const size = prompt(`Party size (max ${restaurant.max_party_size}):`, '12');
                      if (size) {
                        const n = parseInt(size, 10);
                        if (n > 0 && n <= restaurant.max_party_size) setPartySize(n);
                      }
                    }}
                    className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                      partySize > 10
                        ? 'bg-[#9F1239] text-white shadow-md shadow-[#9F1239]/20'
                        : 'bg-white border border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]/30'
                    }`}
                  >
                    {partySize > 10 ? partySize : '10+'}
                  </button>
                )}
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-sm font-semibold text-[#1C1917] mb-2">Date</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {availableDates.slice(0, 28).map((d, idx) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-center relative ${
                      selectedDate === d.value
                        ? 'bg-[#9F1239] text-white shadow-md shadow-[#9F1239]/20'
                        : 'bg-white border border-[#E7E5E4] text-[#57534E] hover:border-[#9F1239]/30'
                    }`}
                  >
                    {idx === 0 && <span className={`block text-[9px] font-bold uppercase tracking-wider mb-0.5 ${selectedDate === d.value ? 'text-white/80' : 'text-[#9F1239]'}`}>Today</span>}
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('time')}
              disabled={!canGoToTime}
              className="w-full py-3.5 bg-[#9F1239] hover:bg-[#881337] disabled:bg-[#E7E5E4] disabled:text-[#A8A29E] text-white font-semibold rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Time Selection */}
        {step === 'time' && (
          <div className="space-y-6">
            <div>
              <button onClick={() => setStep('details')} className="text-sm text-[#9F1239] font-medium mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-bold text-[#1C1917] mb-1">Select a Time</h2>
              <p className="text-sm text-[#57534E]">
                {partySize} {partySize === 1 ? 'guest' : 'guests'} &middot; {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {loadingSlots ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E7E5E4] border-t-[#9F1239]" />
                <p className="text-sm text-[#57534E]">Checking availability...</p>
              </div>
            ) : timeSlots.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[#57534E] font-medium">No available times for this date.</p>
                <p className="text-xs text-[#A8A29E] mt-1">Try a different date or party size.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {timeSlots.map(slot => (
                  <button
                    key={slot.time}
                    onClick={() => slot.available && setSelectedTime(slot.time)}
                    disabled={!slot.available}
                    className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedTime === slot.time
                        ? 'bg-[#9F1239] text-white shadow-md shadow-[#9F1239]/20'
                        : slot.available
                          ? 'bg-white border border-[#E7E5E4] text-[#1C1917] hover:border-[#9F1239]/30'
                          : 'bg-[#F5F5F4] text-[#D6D3D1] border border-transparent cursor-not-allowed'
                    }`}
                  >
                    {formatTime(slot.time)}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep('contact')}
              disabled={!canGoToContact}
              className="w-full py-3.5 bg-[#9F1239] hover:bg-[#881337] disabled:bg-[#E7E5E4] disabled:text-[#A8A29E] text-white font-semibold rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Contact Info */}
        {step === 'contact' && (
          <div className="space-y-6">
            <div>
              <button onClick={() => setStep('time')} className="text-sm text-[#9F1239] font-medium mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-bold text-[#1C1917] mb-1">Your Details</h2>
              <p className="text-sm text-[#57534E]">
                {partySize} {partySize === 1 ? 'guest' : 'guests'} &middot; {formatTime(selectedTime)} &middot; {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1C1917] mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#9F1239] focus:ring-1 focus:ring-[#9F1239]/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1917] mb-1.5">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#9F1239] focus:ring-1 focus:ring-[#9F1239]/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1917] mb-1.5">Email</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="your@email.com (optional)"
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#9F1239] focus:ring-1 focus:ring-[#9F1239]/20 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1C1917] mb-1.5">Special Requests</label>
                <textarea
                  value={specialRequests}
                  onChange={e => setSpecialRequests(e.target.value)}
                  placeholder="Allergies, celebrations, seating preferences..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#9F1239] focus:ring-1 focus:ring-[#9F1239]/20 transition-colors resize-none"
                />
              </div>
            </div>

            <button
              onClick={() => setStep('confirm')}
              disabled={!canSubmit}
              className="w-full py-3.5 bg-[#9F1239] hover:bg-[#881337] disabled:bg-[#E7E5E4] disabled:text-[#A8A29E] text-white font-semibold rounded-xl transition-colors"
            >
              Review Reservation
            </button>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirm' && (
          <div className="space-y-6">
            <div>
              <button onClick={() => setStep('contact')} className="text-sm text-[#9F1239] font-medium mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-bold text-[#1C1917] mb-1">Confirm Your Reservation</h2>
              <p className="text-sm text-[#57534E]">Please review your details before confirming.</p>
            </div>

            <div className="bg-white border border-[#E7E5E4]/50 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Restaurant</p>
                  <p className="text-sm font-semibold text-[#1C1917]">{restaurant.name}</p>
                </div>
              </div>

              <div className="h-px bg-[#E7E5E4]" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Date</p>
                  <p className="text-sm font-semibold text-[#1C1917]">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Time</p>
                  <p className="text-sm font-semibold text-[#1C1917]">{formatTime(selectedTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Guests</p>
                  <p className="text-sm font-semibold text-[#1C1917]">{partySize}</p>
                </div>
                <div>
                  <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Name</p>
                  <p className="text-sm font-semibold text-[#1C1917]">{customerName}</p>
                </div>
              </div>

              {specialRequests && (
                <>
                  <div className="h-px bg-[#E7E5E4]" />
                  <div>
                    <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">Special Requests</p>
                    <p className="text-sm text-[#57534E] mt-0.5">{specialRequests}</p>
                  </div>
                </>
              )}
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 bg-[#9F1239] hover:bg-[#881337] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Confirming...
                </>
              ) : (
                'Confirm Reservation'
              )}
            </button>

            <p className="text-xs text-[#A8A29E] text-center">
              By confirming, you agree to the restaurant's reservation policy.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-[#E7E5E4] py-3 text-center">
        <p className="text-xs text-[#A8A29E]">
          Powered by <span className="font-serif font-semibold text-[#57534E]">Seatable<span className="text-[#9F1239]">.</span></span>
        </p>
      </footer>
    </div>
  );
}
