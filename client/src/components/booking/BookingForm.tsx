import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTimeSlots, useCreateReservation } from '../../hooks/useBooking';
import { formatLocalDate } from '../../utils/timeFormatting';
import DepositPaymentStep from './DepositPaymentStep';
import GuestDetailsForm from './GuestDetailsForm';

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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
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
  const [showPartySizeInput, setShowPartySizeInput] = useState(false);
  const [customPartySizeValue, setCustomPartySizeValue] = useState('8');
  const [timeResetHint, setTimeResetHint] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Reset time when date or party size changes
  useEffect(() => {
    setSelectedTime(prev => {
      if (prev) setTimeResetHint(true);
      return '';
    });
  }, [selectedDate, partySize]);

  // Auto-select the first available open date so the slot grid renders immediately.
  // (Prior behaviour: blank slot area until user clicked a date — looked broken.)

  // Auto-dismiss the hint after 4 seconds
  useEffect(() => {
    if (!timeResetHint) return;
    const timer = setTimeout(() => setTimeResetHint(false), 4000);
    return () => clearTimeout(timer);
  }, [timeResetHint]);

  // Clear hint when user selects a new time
  useEffect(() => {
    if (selectedTime) setTimeResetHint(false);
  }, [selectedTime]);

  // ─── Server state ────────────────────────────────────────────────────────────
  const { data: rawTimeSlots = [], isLoading: loadingSlots } = useTimeSlots(
    restaurant.id, selectedDate, partySize
  );
  const reserve = useCreateReservation();

  // Auto-select first available open date once the date list is computed.
  // Without this the slot grid stays blank on first load — looked broken to testers.
  // We compute availableDates below; this effect runs after each render that produces a list.

  // Filter out past time slots when the selected date is today
  const timeSlots = useMemo(() => {
    const todayStr = formatLocalDate(new Date());
    if (selectedDate !== todayStr) return rawTimeSlots;
    const now = new Date();
    const bufferMs = 30 * 60 * 1000; // 30-minute buffer
    return rawTimeSlots.filter(slot => {
      const [h, m] = slot.time.split(':').map(Number);
      const slotDate = new Date();
      slotDate.setHours(h, m, 0, 0);
      return slotDate.getTime() > now.getTime() + bufferMs;
    });
  }, [rawTimeSlots, selectedDate]);

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const availableDates = useMemo(() => {
    const days: { value: string; label: string; dayKey: string; dayNum: number; monthShort: string; weekdayShort: string; isToday: boolean; isFirstOfMonth: boolean }[] = [];
    const limit = restaurant.advance_booking_days || 30;
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayStr = formatLocalDate(new Date());
    let prevMonth = -1;

    for (let i = 0; i < limit; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const value = formatLocalDate(d);
      const dayKey = dayNames[d.getDay()];
      const dayHours = restaurant.business_hours[dayKey];
      if (!dayHours || dayHours.is_open === false || dayHours.closed) continue;
      const label = d.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });
      const monthShort = d.toLocaleDateString(dateLocale, { month: 'short' });
      const weekdayShort = d.toLocaleDateString(dateLocale, { weekday: 'short' });
      const isFirstOfMonth = d.getMonth() !== prevMonth;
      prevMonth = d.getMonth();
      days.push({ value, label, dayKey, dayNum: d.getDate(), monthShort, weekdayShort, isToday: value === todayStr, isFirstOfMonth });
    }
    return days;
  }, [restaurant, dateLocale]);

  // Default to the first available open date once the list is ready.
  useEffect(() => {
    if (selectedDate || availableDates.length === 0) return;
    setSelectedDate(availableDates[0].value);
  }, [availableDates, selectedDate]);

  // M1: paginate the date strip — earlier behaviour showed only the first 21
  // days with no way to scroll forward. Now we show 14 days at a time with
  // < / > buttons so the customer can book up to advance_booking_days out.
  const DATE_PAGE_SIZE = 14;
  const [datePageStart, setDatePageStart] = useState(0);
  const visibleDates = useMemo(
    () => availableDates.slice(datePageStart, datePageStart + DATE_PAGE_SIZE),
    [availableDates, datePageStart]
  );
  const canPageBack = datePageStart > 0;
  const canPageForward = datePageStart + DATE_PAGE_SIZE < availableDates.length;
  const currentMonthLabel = useMemo(() => {
    if (visibleDates.length === 0) return '';
    const first = visibleDates[0];
    const last = visibleDates[visibleDates.length - 1];
    if (first.monthShort === last.monthShort) return first.monthShort;
    return `${first.monthShort} – ${last.monthShort}`;
  }, [visibleDates]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    // PT-BR and ES use 24-hour format; EN uses 12-hour AM/PM
    if (i18n.language === 'pt-BR' || i18n.language.startsWith('es')) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  const handleSubmit = async () => {
    // If deposit required and not yet paid, create intent first
    if (depositRequired && !paymentIntentId) {
      setDepositError(null);
      try {
        // Fetch a short-lived booking token before creating the PaymentIntent
        const tokenRes = await fetch('/api/booking-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurant_id: restaurant.id }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.token) throw new Error('Failed to authorise payment setup');

        const res = await fetch('/api/create-deposit-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            party_size: partySize,
            customer_email: customerEmail.trim() || undefined,
            booking_token: tokenData.token,
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
        setDepositError(t('booking.depositError', 'Payment setup failed. Please try again.'));
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
        navigate(`/book/${slug}/confirmed?id=${reservation.id}&rid=${restaurant.id}`, {
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
        navigate(`/book/${slug}/confirmed?id=${reservation.id}&rid=${restaurant.id}`, {
          state: { reservation, restaurant_name: restaurant.name, restaurant_id: restaurant.id },
        });
      },
    });
  };

  const depositRequired = restaurant.deposit_config?.enabled === true;

  /** Phone is valid if it contains at least 10 digits (ignoring formatting chars). */
  const isPhoneValid = (phone: string) => phone.replace(/\D/g, '').length >= 10;

  const canSubmit = customerName.trim() !== '' && customerPhone.trim() !== '' && isPhoneValid(customerPhone) && selectedDate && selectedTime;

  return (
    <div className="flex-1 max-w-[540px]">
      {/* Header */}
      <div className="mb-9">
        <h1 className="font-serif text-4xl font-medium text-deep-charcoal tracking-tight mb-2">
          {t('booking.reserveTable')}
        </h1>
        <p className="text-[15px] text-warm-stone font-light">
          {t('booking.chooseDetails')}
        </p>
      </div>

      {/* Date Selection — paginated with month nav (M1) */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone">
            {t('booking.selectDate')} <span className="ml-1.5 text-deep-charcoal normal-case">{currentMonthLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDatePageStart(Math.max(0, datePageStart - DATE_PAGE_SIZE))}
              disabled={!canPageBack}
              aria-label={t('booking.previousDates', 'Previous dates')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-gray text-stone-gray hover:text-deep-charcoal hover:border-stone-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setDatePageStart(Math.min(availableDates.length - DATE_PAGE_SIZE, datePageStart + DATE_PAGE_SIZE))}
              disabled={!canPageForward}
              aria-label={t('booking.nextDates', 'Next dates')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border-gray text-stone-gray hover:text-deep-charcoal hover:border-stone-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {visibleDates.map((d) => (
            <button
              type="button"
              key={d.value}
              onClick={() => setSelectedDate(d.value)}
              title={d.label}
              className={`aspect-square flex flex-col items-center justify-center rounded-[10px] text-[13px] transition-colors ${
                selectedDate === d.value
                  ? 'bg-deep-charcoal text-white font-semibold'
                  : d.isToday
                    ? 'text-deep-charcoal font-semibold hover:bg-soft-gray'
                    : 'text-stone-gray hover:bg-soft-gray'
              }`}
            >
              <span className={`text-[10px] leading-tight ${selectedDate === d.value ? 'text-white/70' : 'text-muted-stone'}`}>
                {d.isFirstOfMonth || d.isToday ? d.monthShort : d.weekdayShort}
              </span>
              <span>{d.dayNum}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Time Selection */}
      {!selectedDate && (
        <div className="mb-8">
          <p className="text-sm text-warm-stone">
            {t('booking.selectDateToSeeSlots', 'Selecione a data e o número de pessoas para ver os horários disponíveis')}
          </p>
        </div>
      )}
      {selectedDate && (
        <div className="mb-8">
          <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
            {t('booking.selectTime')}
          </div>
          {loadingSlots ? (
            <div role="status" className="flex items-center justify-center py-8 gap-3">
              <div aria-hidden="true" className="animate-spin rounded-full h-6 w-6 border-2 border-border-gray border-t-burgundy" />
              <span className="text-sm text-stone-gray">{t('booking.checkingAvailability')}</span>
            </div>
          ) : timeSlots.length === 0 ? (
            <p className="text-sm text-warm-stone py-4">{t('booking.noAvailableTimes')}</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
          {timeResetHint && (
            <p className="text-xs text-amber-600 mt-2">
              {t('booking.timeResetHint')}
            </p>
          )}
        </div>
      )}

      {/* Party Size */}
      <div className="mb-8">
        <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
          {t('booking.partySize')}
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
          {restaurant.max_party_size > 7 && !showPartySizeInput && (
            <button
              type="button"
              onClick={() => setShowPartySizeInput(true)}
              className={`w-12 h-12 rounded-xl border text-[15px] font-medium transition-colors ${
                partySize > 7
                  ? 'border-burgundy bg-burgundy/[4%] text-burgundy font-bold'
                  : 'border-border-gray bg-white text-stone-gray hover:border-stone-300'
              }`}
            >
              {partySize > 7 ? partySize : '8+'}
            </button>
          )}
          {showPartySizeInput && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={8}
                max={restaurant.max_party_size}
                value={customPartySizeValue}
                onChange={e => setCustomPartySizeValue(e.target.value)}
                className="w-20 h-12 rounded-xl border border-burgundy bg-burgundy/[4%] text-burgundy text-center text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const n = parseInt(customPartySizeValue, 10);
                    if (n > 0 && n <= restaurant.max_party_size) {
                      setPartySize(n);
                      setShowPartySizeInput(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowPartySizeInput(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const n = parseInt(customPartySizeValue, 10);
                  if (n > 0 && n <= restaurant.max_party_size) {
                    setPartySize(n);
                    setShowPartySizeInput(false);
                  }
                }}
                className="h-12 px-3 rounded-xl bg-burgundy text-white text-sm font-semibold hover:bg-burgundy-dark transition-colors"
              >
                {t('common.ok', 'OK')}
              </button>
              <button
                type="button"
                onClick={() => setShowPartySizeInput(false)}
                className="h-12 px-3 rounded-xl border border-border-gray text-stone-gray text-sm font-medium hover:bg-soft-gray transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Guest Info */}
      <GuestDetailsForm
        customerName={customerName}
        customerPhone={customerPhone}
        customerEmail={customerEmail}
        specialRequests={specialRequests}
        phoneError={phoneError}
        onNameChange={setCustomerName}
        onPhoneChange={(v) => { setCustomerPhone(v); if (phoneError) setPhoneError(''); }}
        onPhoneBlur={() => {
          if (customerPhone.trim() && !isPhoneValid(customerPhone)) {
            setPhoneError(t('booking.phoneInvalid'));
          }
        }}
        onEmailChange={setCustomerEmail}
        onSpecialRequestsChange={setSpecialRequests}
      />

      {/* Summary Card */}
      {selectedDate && selectedTime && (
        <div className="bg-white border border-border-gray rounded-2xl p-6 mb-6">
          <h3 className="text-sm font-semibold text-deep-charcoal mb-4">{t('booking.reservationSummary')}</h3>
          <SummaryRow label={t('booking.restaurant')} value={restaurant.name} />
          <SummaryRow
            label={t('reservations.date')}
            value={new Date(selectedDate + 'T12:00:00').toLocaleDateString(dateLocale, {
              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            })}
          />
          <SummaryRow label={t('reservations.time')} value={formatTime(selectedTime)} />
          <SummaryRow label={t('booking.partySize')} value={`${partySize} ${t('booking.guests', { count: partySize })}`} />
          {restaurant.average_dining_duration && (
            <>
              <hr className="border-0 border-t border-dashed border-border-gray my-3" />
              <SummaryRow
                label={t('booking.estimatedDuration')}
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
              {t('booking.confirming')}
            </>
          ) : depositRequired && !paymentIntentId ? (
            t('booking.continueToPayment')
          ) : (
            t('booking.confirmReservation')
          )}
        </button>
      )}
      {/* M2: cancellation policy moved out of the buried "tiny gray text"
          state into a proper info card. Same content, but the surrounding
          card + icon makes it actually readable instead of a footnote. */}
      <div className="mt-4 px-4 py-3 bg-soft-gray/60 border border-border-gray rounded-xl flex items-start gap-2.5">
        <svg className="w-4 h-4 text-burgundy flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7v10l10 5 10-5V7l-10-5z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <p className="text-[12.5px] text-stone-gray leading-relaxed">
          {restaurant.cancellation_policy?.trim() || t('reservations.cancellationPolicy')}
        </p>
      </div>
    </div>
  );
}
