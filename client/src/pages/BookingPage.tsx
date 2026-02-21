import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import WhatsAppButton from '../components/booking/WhatsAppButton';

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
  whatsapp_enabled?: boolean;
  wa_me_link?: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
  available_seats: number;
}

export default function BookingPage() {
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
      if (!dayHours || dayHours.closed) continue;

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
        navigate(`/book/${slug}/confirmed`, {
          state: {
            reservation: data.reservation,
            restaurant_name: restaurant.name,
            wa_me_link: restaurant.wa_me_link ?? null
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

  const canSubmit = customerName.trim() !== '' && customerPhone.trim() !== '' && selectedDate && selectedTime;

  const getTodayHours = () => {
    if (!restaurant) return '';
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[new Date().getDay()];
    const hours = restaurant.business_hours[dayKey];
    if (!hours || hours.closed) return 'Closed today';
    return `${hours.open} \u2013 ${hours.close}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-[#1C1917] opacity-50">
          seatable<span className="text-[#9F1239]">.</span>
        </div>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E7E5E4] border-t-[#9F1239]" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-[#dc2626]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#dc2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1C1917] mb-2">Restaurant Not Found</h1>
          <p className="text-sm text-[#57534E]">
            {error || 'The restaurant you are looking for does not exist or is not accepting online reservations.'}
          </p>
        </div>
        <p className="mt-6 text-xs text-[#A8A29E]">
          Powered by <span className="font-serif">seatable<span className="text-[#9F1239]">.</span></span>
        </p>
      </div>
    );
  }

  const restaurantType = restaurant.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-[#E7E5E4] bg-white">
        <div className="font-serif text-lg font-semibold text-[#1C1917]">
          seatable<span className="text-[#9F1239]">.</span>
        </div>
        <span className="text-[13px] text-[#78716C]">Need help? Contact the restaurant</span>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row max-w-[1200px] mx-auto w-full px-6 sm:px-10 py-8 lg:py-12 gap-10 lg:gap-16">
        {/* Left: Restaurant Info */}
        <div className="lg:flex-shrink-0 lg:w-[340px]">
          {/* Restaurant Image */}
          <div className="w-full h-[220px] rounded-[20px] bg-gradient-to-br from-[#292524] to-[#44403C] mb-7 flex items-end p-6">
            <div>
              <h2 className="font-serif text-[28px] font-medium text-white tracking-tight mb-1">
                {restaurant.name}
              </h2>
              <p className="text-[13px] text-[#D6D3D1] font-light">
                {restaurantType} &middot; {restaurant.city}, {restaurant.country}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="mb-7">
            <DetailRow icon="\u2739" label="Cuisine" value={restaurantType} />
            <DetailRow icon="\u23F1" label="Hours today" value={getTodayHours()} />
            {restaurant.phone && (
              <DetailRow icon="\u260E" label="Phone" value={restaurant.phone} />
            )}
            {restaurant.email && (
              <DetailRow icon="\u2709" label="Email" value={restaurant.email} />
            )}
          </div>
        </div>

        {/* Right: Booking Form */}
        <div className="flex-1 max-w-[540px]">
          {/* Header */}
          <div className="mb-9">
            <h1 className="font-serif text-4xl font-medium text-[#1C1917] tracking-tight mb-2">
              Reserve a table
            </h1>
            <p className="text-[15px] text-[#78716C] font-light">
              Choose your date, time, and party size below.
            </p>
          </div>

          {/* Date Selection */}
          <div className="mb-8">
            <div className="text-xs font-semibold tracking-wider uppercase text-[#78716C] mb-3">
              Select Date
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {availableDates.slice(0, 21).map((d) => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDate(d.value)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-[10px] text-[13px] transition-colors ${
                    selectedDate === d.value
                      ? 'bg-[#1C1917] text-white font-semibold'
                      : d.isToday
                        ? 'text-[#1C1917] font-semibold hover:bg-[#F5F5F4]'
                        : 'text-[#57534E] hover:bg-[#F5F5F4]'
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
              <div className="text-xs font-semibold tracking-wider uppercase text-[#78716C] mb-3">
                Select Time
              </div>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#E7E5E4] border-t-[#9F1239]" />
                  <span className="text-sm text-[#57534E]">Checking availability...</span>
                </div>
              ) : timeSlots.length === 0 ? (
                <p className="text-sm text-[#78716C] py-4">No available times for this date.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.time}
                      onClick={() => slot.available && setSelectedTime(slot.time)}
                      disabled={!slot.available}
                      className={`py-3 rounded-[10px] text-sm font-medium border transition-colors ${
                        selectedTime === slot.time
                          ? 'border-[#9F1239] bg-[rgba(159,18,57,0.04)] text-[#9F1239] font-semibold'
                          : slot.available
                            ? 'border-[#E7E5E4] bg-white text-[#57534E] hover:border-[#D6D3D1] hover:bg-[#FAFAF9]'
                            : 'border-[#F5F5F4] bg-[#FAFAF9] text-[#D6D3D1] cursor-not-allowed'
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
            <div className="text-xs font-semibold tracking-wider uppercase text-[#78716C] mb-3">
              Party Size
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: Math.min(restaurant.max_party_size, 7) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPartySize(n)}
                  className={`w-12 h-12 rounded-xl border text-[15px] font-medium transition-colors ${
                    partySize === n
                      ? 'border-[#9F1239] bg-[rgba(159,18,57,0.04)] text-[#9F1239] font-bold'
                      : 'border-[#E7E5E4] bg-white text-[#57534E] hover:border-[#D6D3D1]'
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
                      ? 'border-[#9F1239] bg-[rgba(159,18,57,0.04)] text-[#9F1239] font-bold'
                      : 'border-[#E7E5E4] bg-white text-[#57534E] hover:border-[#D6D3D1]'
                  }`}
                >
                  {partySize > 7 ? partySize : '8+'}
                </button>
              )}
            </div>
          </div>

          {/* Guest Info */}
          <div className="mb-8">
            <div className="text-xs font-semibold tracking-wider uppercase text-[#78716C] mb-3">
              Your Details
            </div>
            <div className="grid grid-cols-2 gap-3.5 mb-3.5">
              <div>
                <label htmlFor="booking-name" className="block text-[13px] font-medium text-[#57534E] mb-1.5">Name</label>
                <input
                  id="booking-name"
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 border border-[#E7E5E4] rounded-[10px] text-sm bg-white text-[#1C1917] placeholder:text-[#D6D3D1] focus:outline-none focus:border-[#9F1239] focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)]"
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className="block text-[13px] font-medium text-[#57534E] mb-1.5">Phone</label>
                <input
                  id="booking-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+34 612 345 678"
                  className="w-full px-4 py-3 border border-[#E7E5E4] rounded-[10px] text-sm bg-white text-[#1C1917] placeholder:text-[#D6D3D1] focus:outline-none focus:border-[#9F1239] focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)]"
                />
              </div>
            </div>
            <div className="mb-3.5">
              <label htmlFor="booking-email" className="block text-[13px] font-medium text-[#57534E] mb-1.5">Email <span className="text-[#A8A29E] font-normal">(optional)</span></label>
              <input
                id="booking-email"
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-[#E7E5E4] rounded-[10px] text-sm bg-white text-[#1C1917] placeholder:text-[#D6D3D1] focus:outline-none focus:border-[#9F1239] focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)]"
              />
            </div>
            <div>
              <label htmlFor="booking-requests" className="block text-[13px] font-medium text-[#57534E] mb-1.5">
                Special requests <span className="text-[#A8A29E] font-normal">(optional)</span>
              </label>
              <textarea
                id="booking-requests"
                value={specialRequests}
                onChange={e => setSpecialRequests(e.target.value)}
                placeholder="Allergies, celebrations, seating preferences..."
                rows={3}
                className="w-full px-4 py-3 border border-[#E7E5E4] rounded-[10px] text-sm bg-white text-[#1C1917] placeholder:text-[#D6D3D1] focus:outline-none focus:border-[#9F1239] focus:ring-[3px] focus:ring-[rgba(159,18,57,0.06)] resize-none"
              />
            </div>
          </div>

          {/* Summary Card */}
          {selectedDate && selectedTime && (
            <div className="bg-white border border-[#E7E5E4] rounded-2xl p-6 mb-6">
              <h3 className="text-sm font-semibold text-[#1C1917] mb-4">Reservation Summary</h3>
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
                  <hr className="border-0 border-t border-dashed border-[#E7E5E4] my-3" />
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
            <div className="bg-[#dc2626]/10 border border-[#dc2626]/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-[#dc2626]">{submitError}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-4 rounded-xl text-[15px] font-semibold bg-[#9F1239] hover:bg-[#881337] disabled:bg-[#E7E5E4] disabled:text-[#A8A29E] text-white transition-colors flex items-center justify-center gap-2"
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
          <p className="text-center text-xs text-[#A8A29E] mt-3">
            Free cancellation up to 2 hours before your reservation.
          </p>
        </div>
      </div>

      {/* WhatsApp floating button */}
      {restaurant.whatsapp_enabled && restaurant.wa_me_link && (
        <WhatsAppButton waMeLink={restaurant.wa_me_link} restaurantName={restaurant.name} />
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#F5F5F4]">
      <div className="w-8 h-8 rounded-lg bg-[#F5F5F4] flex items-center justify-center text-sm text-[#78716C] flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-xs text-[#A8A29E]">{label}</div>
        <div className="text-sm font-medium text-[#1C1917]">{value}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 text-[13px]">
      <span className="text-[#78716C]">{label}</span>
      <span className="font-medium text-[#1C1917]">{value}</span>
    </div>
  );
}
