import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTimeSlots, useCreateReservation } from '../../hooks/useBooking';
import DepositPaymentStep from './DepositPaymentStep';

export interface RestaurantInfo {
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
  deposit_config?: {
    enabled: boolean;
    type?: 'flat' | 'per_person';
    amount?: number;
  };
}

export interface TimeSlot {
  time: string;
  available: boolean;
  available_seats: number;
}

interface BookingFormProps {
  restaurant: RestaurantInfo;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 text-[13px]">
      <span className="text-warm-stone">{label}</span>
      <span className="font-medium text-deep-charcoal">{value}</span>
    </div>
  );
}

export default function BookingForm({ restaurant }: BookingFormProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // ─── UI state ───────────────────────────────────────────────────────────────
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [depositStep, setDepositStep] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [depositAmount, setDepositAmount] = useState(0);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [depositError, setDepositError] = useState<string | null>(null);

  // Reset time when date or party size changes
  useEffect(() => { setSelectedTime(''); }, [selectedDate, partySize]);

  // ─── Server state ────────────────────────────────────────────────────────────
  const { data: timeSlots = [], isLoading: loadingSlots } = useTimeSlots(
    restaurant.id, selectedDate, partySize
  );
  const reserve = useCreateReservation();

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const availableDates = useMemo(() => {
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

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  const handleSubmit = async () => {
    // If deposit required and not yet paid, create intent first
    if (depositRequired && !paymentIntentId) {
      setDepositError(null);
      try {
        const res = await fetch('/api/create-deposit-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            party_size: partySize,
            customer_email: customerEmail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create deposit');

        setClientSecret(data.client_secret);
        setDepositAmount(data.deposit_amount);
        setDepositStep(true);
        return; // Show payment step
      } catch (err) {
        console.error('Deposit intent error:', err);
        setDepositError('Payment setup failed. Please try again.');
        return;
      }
    }

    // Create the reservation (with or without deposit)
    reserve.mutate({
      restaurant_id: restaurant.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim() || undefined,
      party_size: partySize,
      date: selectedDate,
      time: selectedTime,
      special_requests: specialRequests.trim() || undefined,
      ...(paymentIntentId ? {
        deposit_payment_intent_id: paymentIntentId,
        deposit_amount: depositAmount,
      } : {}),
    }, {
      onSuccess: ({ reservation }) => {
        navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
          state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
        });
      },
    });
  };

  const handleDepositSuccess = (piId: string) => {
    setPaymentIntentId(piId);
    setDepositStep(false);
    // Auto-submit the reservation now that deposit is confirmed
    reserve.mutate({
      restaurant_id: restaurant.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim() || undefined,
      party_size: partySize,
      date: selectedDate,
      time: selectedTime,
      special_requests: specialRequests.trim() || undefined,
      deposit_payment_intent_id: piId,
      deposit_amount: depositAmount,
    }, {
      onSuccess: ({ reservation }) => {
        navigate(`/book/${slug}/confirmed?id=${reservation.id}`, {
          state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
        });
      },
    });
  };

  const depositRequired = restaurant.deposit_config?.enabled === true;
  const canSubmit = customerName.trim() !== '' && customerPhone.trim() !== '' && selectedDate && selectedTime;

  return (
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
              type="button"
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
            <div role="status" className="flex items-center justify-center py-8 gap-3">
              <div aria-hidden="true" className="animate-spin rounded-full h-6 w-6 border-2 border-border-gray border-t-burgundy" />
              <span className="text-sm text-stone-gray">Checking availability...</span>
            </div>
          ) : timeSlots.length === 0 ? (
            <p className="text-sm text-warm-stone py-4">No available times for this date.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map(slot => (
                <button
                  type="button"
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
              type="button"
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
              type="button"
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
          <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
            Email <span className="text-muted-stone font-normal">(optional)</span>
          </label>
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
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
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

      {/* Deposit Payment Step */}
      {depositStep && clientSecret && (
        <div className="mb-6">
          <DepositPaymentStep
            clientSecret={clientSecret}
            depositAmount={depositAmount}
            onSuccess={handleDepositSuccess}
            onCancel={() => setDepositStep(false)}
          />
        </div>
      )}

      {/* Deposit Setup Error */}
      {depositError && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{depositError}</p>
        </div>
      )}

      {/* Submit Error */}
      {reserve.isError && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-600">{reserve.error.message}</p>
        </div>
      )}

      {/* Submit Button */}
      {!depositStep && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || reserve.isPending}
          className="w-full py-4 rounded-xl text-[15px] font-semibold bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray disabled:text-muted-stone text-white transition-colors flex items-center justify-center gap-2"
        >
          {reserve.isPending ? (
            <>
              <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              Confirming...
            </>
          ) : depositRequired && !paymentIntentId ? (
            'Continue to Payment'
          ) : (
            'Confirm Reservation'
          )}
        </button>
      )}
      <p className="text-center text-xs text-muted-stone mt-3">
        {restaurant.cancellation_policy || 'Free cancellation up to 2 hours before your reservation.'}
      </p>
    </div>
  );
}
