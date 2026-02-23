import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
  business_hours: Record<string, { open_time?: string; close_time?: string; is_open?: boolean; open?: string; close?: string; closed?: boolean }>;
  max_party_size: number;
  min_party_size: number;
  advance_booking_days: number;
  average_dining_duration: number;
  cancellation_policy?: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
  available_seats: number;
}

export default function BookingPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const availableDates = useMemo(() => {
    if (!restaurant) return [];
    const days: { value: string; label: string; dayKey: string; dayNum: number; isToday: boolean }[] = [];
    const limit = restaurant.advance_booking_days || 30;
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < limit; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const value = d.toISOString().split('T')[0];
      const dayKey = dayNames[d.getDay()];
      const dayHours = restaurant.business_hours[dayKey];
      if (!dayHours || dayHours.is_open === false || dayHours.closed) continue;

      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ value, label, dayKey, dayNum: d.getDate(), isToday: value === todayStr });
    }
    return days;
  }, [restaurant]);

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

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

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
        navigate(`/book/${slug}/confirmed?id=${data.reservation.id}`, {
          state: { reservation: data.reservation, restaurant_name: restaurant.name }
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

  const canSubmit = customerName.trim() !== '' && customerPhone.trim() !== '' && selectedDate && selectedTime;

  const getTodayHours = () => {
    if (!restaurant) return '';
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[new Date().getDay()];
    const hours = restaurant.business_hours[dayKey];
    if (!hours || hours.is_open === false || hours.closed) return t('reservations.closedToday');
    const open = hours.open_time || hours.open;
    const close = hours.close_time || hours.close;
    return `${open} – ${close}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-deep-charcoal mb-2">{t('reservations.restaurantNotFound')}</h1>
          <p className="text-sm text-stone-gray">
            {error || 'The restaurant you are looking for does not exist or is not accepting online reservations.'}
          </p>
        </div>
        <p className="mt-6 text-xs text-muted-stone">
          Powered by <span className="font-serif">seatable<span className="text-burgundy">.</span></span>
        </p>
      </div>
    );
  }

  const restaurantType = restaurant.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row max-w-[1200px] mx-auto w-full px-6 sm:px-10 py-8 lg:py-12 gap-10 lg:gap-16">
        {/* Left: Restaurant Info */}
        <div className="lg:flex-shrink-0 lg:w-[340px]">
          {/* Restaurant Image */}
          <div className="w-full h-[220px] rounded-[20px] bg-gradient-to-br from-charcoal-dark to-stone-700 mb-7 flex items-end p-6">
            <div>
              <h2 className="font-serif text-[28px] font-medium text-white tracking-tight mb-1">
                {restaurant.name}
              </h2>
              <p className="text-[13px] text-stone-300 font-light">
                {restaurantType} &middot; {restaurant.city}, {restaurant.country}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="mb-7">
            <DetailRow icon="✹" label={t('reservations.cuisine')} value={restaurantType} />
            <DetailRow icon="⏱" label={t('reservations.hoursToday')} value={getTodayHours()} />
            <DetailRow icon="☾" label={t('reservations.atmosphere')} value="Intimate, candlelit" />
            <DetailRow icon="€" label={t('reservations.priceRange')} value="€€€" />
          </div>

          {/* Rating */}
          <div className="flex items-center gap-3 p-4 bg-white border border-border-gray rounded-xl">
            <div className="text-2xl font-bold tracking-tight text-deep-charcoal">4.7</div>
            <div>
              <div className="text-sm text-amber-600 tracking-wider">★★★★☆</div>
              <div className="text-xs text-muted-stone">284 reviews on Google</div>
            </div>
          </div>
        </div>

        {/* Right: Booking Form */}
        <div className="flex-1 max-w-[540px]">
          {/* Header */}
          <div className="mb-9">
            <h1 className="font-serif text-4xl font-medium text-deep-charcoal tracking-tight mb-2">
              Reserve a table
            </h1>
            <p className="text-[15px] text-warm-stone font-light">
              Choose your date, time, and party size below.
            </p>
          </div>

          {/* Date Selection */}
          <div className="mb-8">
            <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
              Select Date
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {availableDates.slice(0, 21).map((d) => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDate(d.value)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-[10px] text-[13px] transition-colors ${
                    selectedDate === d.value
                      ? 'bg-deep-charcoal text-white font-semibold'
                      : d.isToday
                        ? 'text-deep-charcoal font-semibold hover:bg-soft-gray'
                        : 'text-stone-gray hover:bg-soft-gray'
                  }`}
                >
                  <span>{d.dayNum}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Selection */}
          {selectedDate && (
            <div className="mb-8">
              <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
                Select Time
              </div>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-border-gray border-t-burgundy" />
                  <span className="text-sm text-stone-gray">Checking availability...</span>
                </div>
              ) : timeSlots.length === 0 ? (
                <p className="text-sm text-warm-stone py-4">No available times for this date.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.time}
                      onClick={() => slot.available && setSelectedTime(slot.time)}
                      disabled={!slot.available}
                      className={`py-3 rounded-[10px] text-sm font-medium border transition-colors ${
                        selectedTime === slot.time
                          ? 'border-burgundy bg-burgundy/[4%] text-burgundy font-semibold'
                          : slot.available
                            ? 'border-border-gray bg-white text-stone-gray hover:border-stone-300 hover:bg-warm-white'
                            : 'border-soft-gray bg-warm-white text-stone-300 cursor-not-allowed'
                      }`}
                    >
                      {formatTime(slot.time)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Party Size */}
          <div className="mb-8">
            <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
              Party Size
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: Math.min(restaurant.max_party_size, 7) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPartySize(n)}
                  className={`w-12 h-12 rounded-xl border text-[15px] font-medium transition-colors ${
                    partySize === n
                      ? 'border-burgundy bg-burgundy/[4%] text-burgundy font-bold'
                      : 'border-border-gray bg-white text-stone-gray hover:border-stone-300'
                  }`}
                >
                  {n}
                </button>
              ))}
              {restaurant.max_party_size > 7 && (
                <button
                  onClick={() => {
                    const size = prompt(`Party size (max ${restaurant.max_party_size}):`, '8');
                    if (size) {
                      const n = parseInt(size, 10);
                      if (n > 0 && n <= restaurant.max_party_size) setPartySize(n);
                    }
                  }}
                  className={`w-12 h-12 rounded-xl border text-[15px] font-medium transition-colors ${
                    partySize > 7
                      ? 'border-burgundy bg-burgundy/[4%] text-burgundy font-bold'
                      : 'border-border-gray bg-white text-stone-gray hover:border-stone-300'
                  }`}
                >
                  {partySize > 7 ? partySize : '8+'}
                </button>
              )}
            </div>
          </div>

          {/* Guest Info */}
          <div className="mb-8">
            <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
              Your Details
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-3.5">
              <div>
                <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+34 612 345 678"
                  className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
                />
              </div>
            </div>
            <div className="mb-3.5">
              <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Email <span className="text-muted-stone font-normal">(optional)</span></label>
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
                Special requests <span className="text-muted-stone font-normal">(optional)</span>
              </label>
              <textarea
                value={specialRequests}
                onChange={e => setSpecialRequests(e.target.value)}
                placeholder="Allergies, celebrations, seating preferences..."
                rows={3}
                className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%] resize-none"
              />
            </div>
          </div>

          {/* Summary Card */}
          {selectedDate && selectedTime && (
            <div className="bg-white border border-border-gray rounded-2xl p-6 mb-6">
              <h3 className="text-sm font-semibold text-deep-charcoal mb-4">Reservation Summary</h3>
              <SummaryRow label="Restaurant" value={restaurant.name} />
              <SummaryRow
                label="Date"
                value={new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                })}
              />
              <SummaryRow label="Time" value={formatTime(selectedTime)} />
              <SummaryRow label="Party size" value={`${partySize} guest${partySize !== 1 ? 's' : ''}`} />
              {restaurant.average_dining_duration && (
                <>
                  <hr className="border-0 border-t border-dashed border-border-gray my-3" />
                  <SummaryRow
                    label="Estimated duration"
                    value={`~${Math.floor(restaurant.average_dining_duration / 60)}h ${restaurant.average_dining_duration % 60}min`}
                  />
                </>
              )}
            </div>
          )}

          {/* Submit Error */}
          {submitError && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-red-600">{submitError}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-4 rounded-xl text-[15px] font-semibold bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray disabled:text-muted-stone text-white transition-colors flex items-center justify-center gap-2"
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
          <p className="text-center text-xs text-muted-stone mt-3">
            {restaurant.cancellation_policy || 'Free cancellation up to 2 hours before your reservation.'}
          </p>
        </div>
      </div>

      {/* Powered by Seatable badge */}
      <div className="mt-8 pb-8 flex justify-center">
        <a
          href="/?ref=badge"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            import('../lib/analytics').then(({ trackCtaClicked }) =>
              trackCtaClicked({ cta: 'primary', location: 'booking_page_badge' })
            );
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-gray bg-warm-white hover:bg-soft-gray transition-colors text-xs text-muted-stone hover:text-warm-stone"
        >
          <span className="text-burgundy font-semibold">⚡</span>
          Powered by Seatable
        </a>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-soft-gray">
      <div className="w-8 h-8 rounded-lg bg-soft-gray flex items-center justify-center text-sm text-warm-stone flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-stone">{label}</div>
        <div className="text-sm font-medium text-deep-charcoal">{value}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 text-[13px]">
      <span className="text-warm-stone">{label}</span>
      <span className="font-medium text-deep-charcoal">{value}</span>
    </div>
  );
}
