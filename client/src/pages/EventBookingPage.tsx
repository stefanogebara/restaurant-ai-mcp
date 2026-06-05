import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useEventCheckout, useEventBookingConfirm } from '../hooks/useEventCheckout';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

interface PublicEvent {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  duration_minutes: number;
  max_capacity: number;
  current_bookings: number;
  price: number;
  is_active: boolean;
  refund_policy: string | null;
  cover_image_url: string | null;
  menu_description: string | null;
}

interface RestaurantInfo {
  restaurant_name: string;
  booking_slug: string;
}

type BookingStep = 'details' | 'payment' | 'confirmed';

function formatDate(dateStr: string, lang: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const locale = lang === 'pt-BR' ? 'pt-BR' : lang === 'es' ? 'es' : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

function formatPrice(price: number): string {
  return `R$ ${Number(price).toFixed(2)}`;
}

/**
 * Stripe Payment Form (must be inside Elements provider)
 */
function PaymentForm({
  totalAmount,
  onSuccess,
  onCancel,
  bookingId,
  paymentIntentId,
}: {
  totalAmount: number;
  onSuccess: () => void;
  onCancel: () => void;
  bookingId: string;
  paymentIntentId: string;
}) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const confirmMutation = useEventBookingConfirm();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || t('eventBooking.paymentFailed', 'Payment failed'));
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Confirm on our backend
      try {
        await confirmMutation.mutateAsync({
          booking_id: bookingId,
          payment_intent_id: paymentIntentId,
        });
        onSuccess();
      } catch {
        setError(t('eventBooking.confirmFailed', 'Payment succeeded but confirmation failed. Please contact the restaurant.'));
        setIsProcessing(false);
      }
    } else {
      setError(t('eventBooking.unexpectedStatus', 'Unexpected payment status. Please try again.'));
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-[#1C1917]">
          {t('eventBooking.totalCharge', 'Total')}: {formatPrice(totalAmount)}
        </p>
        <p className="text-xs text-[#706A65] mt-1">
          {t('eventBooking.chargeNotice', 'Your card will be charged immediately.')}
        </p>
      </div>

      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3 border border-glass-border-dark bg-white/60 hover:bg-white/85 text-[#706A65] font-medium rounded-full text-sm hover:border-[#706A65] transition-colors disabled:opacity-50"
        >
          {t('eventBooking.back', 'Back')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!stripe || !elements || isProcessing}
          className="flex-1 py-3 bg-[#9F1239] hover:bg-[#881337] disabled:bg-[#E5E7EB] disabled:text-[#706A65] text-white font-semibold rounded-full text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              {t('eventBooking.processing', 'Processing...')}
            </>
          ) : (
            t('eventBooking.payNow', 'Pay {{amount}}', { amount: formatPrice(totalAmount) })
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Main Event Booking Page — public, no auth
 */
export default function EventBookingPage() {
  const { t, i18n } = useTranslation();
  const { slug, eventId } = useParams<{ slug: string; eventId: string }>();

  const [step, setStep] = useState<BookingStep>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState('1');
  const [specialRequests, setSpecialRequests] = useState('');
  const [formError, setFormError] = useState('');
  const [checkoutData, setCheckoutData] = useState<{
    client_secret: string;
    booking_id: string;
    payment_intent_id: string;
    total_amount: number;
  } | null>(null);

  const checkoutMutation = useEventCheckout();

  // Fetch event details (public — no auth)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-event', slug, eventId],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/event-public?slug=${slug}&event_id=${eventId}`);
      return res.data.data as { event: PublicEvent; restaurant: RestaurantInfo };
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const event = data?.event;
  const restaurant = data?.restaurant;

  const spotsLeft = event ? event.max_capacity - event.current_bookings : 0;
  const isPast = event ? new Date(`${event.event_date}T${event.event_time}`) < new Date() : false;
  const isSoldOut = spotsLeft <= 0;
  const isUnavailable = !event?.is_active || isPast || isSoldOut;

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError(t('eventBooking.errorName', 'Name is required'));
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError(t('eventBooking.errorEmail', 'Valid email is required'));
      return;
    }
    const parsedSize = parseInt(partySize, 10);
    if (isNaN(parsedSize) || parsedSize < 1) {
      setFormError(t('eventBooking.errorPartySize', 'Party size must be at least 1'));
      return;
    }
    if (parsedSize > spotsLeft) {
      setFormError(t('eventBooking.errorCapacity', 'Not enough spots available'));
      return;
    }

    try {
      const result = await checkoutMutation.mutateAsync({
        event_id: eventId!,
        customer_name: name.trim(),
        customer_phone: phone.trim() || undefined,
        customer_email: email.trim(),
        party_size: parsedSize,
        special_requests: specialRequests.trim() || undefined,
      });

      setCheckoutData(result);
      setStep('payment');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setFormError(axiosError?.response?.data?.error || t('eventBooking.errorCheckout', 'Failed to create checkout'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E5E7EB] border-t-[#9F1239]" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-[#1C1917] mb-2">
            {t('eventBooking.notFound', 'Event not found')}
          </h1>
          <p className="text-sm text-[#706A65]">
            {t('eventBooking.notFoundDesc', 'This event may have been removed or the link is incorrect.')}
          </p>
        </div>
      </div>
    );
  }

  // Confirmation screen
  if (step === 'confirmed') {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-modal p-6 text-center">
          <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#1C1917] mb-2">
            {t('eventBooking.confirmed', 'Booking Confirmed!')}
          </h2>
          <p className="text-sm text-[#706A65] mb-4">
            {t('eventBooking.confirmedDesc', 'A confirmation email has been sent to {{email}}.', { email })}
          </p>
          <div className="bg-[#FAFAF9] border border-[#E5E7EB] rounded-xl p-4 text-left text-sm space-y-1.5 mb-4">
            <p className="font-semibold text-[#1C1917]">{event.title}</p>
            <p className="text-[#706A65]">{restaurant?.restaurant_name}</p>
            <p className="text-[#706A65]">{formatDate(event.event_date, i18n.language)} - {formatTime(event.event_time)}</p>
            <p className="text-[#706A65]">{partySize} {t('eventBooking.guests', 'guest(s)')}</p>
            <p className="font-medium text-[#1C1917]">{formatPrice(checkoutData?.total_amount || 0)}</p>
          </div>
          {slug && (
            <Link
              to={`/book/${slug}`}
              className="text-sm text-[#9F1239] hover:text-[#881337] font-medium"
            >
              {t('eventBooking.backToRestaurant', 'Back to restaurant')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="font-serif text-lg text-[#1C1917]">
            seatable<span className="text-[#9F1239]">.</span>
          </div>
          {restaurant?.restaurant_name && (
            <span className="text-xs text-[#706A65]">{restaurant.restaurant_name}</span>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Cover image */}
        {event.cover_image_url && (
          <div className="rounded-xl overflow-hidden mb-5 border border-[#E5E7EB]">
            <img src={event.cover_image_url} alt={event.title} className="w-full h-48 object-cover" />
          </div>
        )}

        {/* Event details card */}
        <div className="glass-panel p-5 mb-5">
          <h1 className="text-xl font-bold text-[#1C1917] mb-2">{event.title}</h1>

          {event.description && (
            <p className="text-sm text-[#706A65] mb-4">{event.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-[#706A65]">{t('eventBooking.date', 'Date')}</span>
              <p className="font-medium text-[#1C1917]">{formatDate(event.event_date, i18n.language)}</p>
            </div>
            <div>
              <span className="text-[#706A65]">{t('eventBooking.time', 'Time')}</span>
              <p className="font-medium text-[#1C1917]">{formatTime(event.event_time)}</p>
            </div>
            <div>
              <span className="text-[#706A65]">{t('eventBooking.pricePerPerson', 'Price/person')}</span>
              <p className="font-medium text-[#1C1917]">{formatPrice(event.price)}</p>
            </div>
            <div>
              <span className="text-[#706A65]">{t('eventBooking.spots', 'Spots')}</span>
              <p className="font-medium text-[#1C1917]">
                {isSoldOut
                  ? t('eventBooking.soldOut', 'Sold out')
                  : `${spotsLeft} ${t('eventBooking.remaining', 'remaining')}`}
              </p>
            </div>
          </div>

          {event.menu_description && (
            <div className="border-t border-[#E5E7EB] pt-4">
              <h3 className="text-xs font-semibold text-[#706A65] uppercase tracking-wide mb-2">
                {t('eventBooking.menu', 'Menu')}
              </h3>
              <p className="text-sm text-[#1C1917] whitespace-pre-line">{event.menu_description}</p>
            </div>
          )}

          {event.refund_policy && event.refund_policy !== 'full' && (
            <div className="mt-3 text-xs text-[#706A65]">
              {event.refund_policy === 'none'
                ? t('eventBooking.noRefund', 'No refunds available')
                : t('eventBooking.partialRefund', '50% refund available upon cancellation')}
            </div>
          )}
        </div>

        {/* Booking form or payment */}
        {isUnavailable ? (
          <div className="glass-card p-5 text-center">
            <p className="text-sm font-medium text-[#1C1917]">
              {isPast
                ? t('eventBooking.eventPast', 'This event has already taken place')
                : isSoldOut
                  ? t('eventBooking.eventSoldOut', 'This event is sold out')
                  : t('eventBooking.eventInactive', 'This event is no longer available')}
            </p>
          </div>
        ) : step === 'details' ? (
          <form onSubmit={handleDetailsSubmit} className="glass-panel p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#1C1917]">
              {t('eventBooking.guestDetails', 'Guest Details')}
            </h2>

            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#706A65] mb-1">
                {t('eventBooking.name', 'Name')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#706A65] mb-1">
                {t('eventBooking.email', 'Email')} *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#706A65] mb-1">
                {t('eventBooking.phone', 'Phone')}
                <span className="text-[#706A65]/60 ml-1">({t('eventBooking.optional', 'optional')})</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#706A65] mb-1">
                {t('eventBooking.partySize', 'Number of guests')} *
              </label>
              <input
                type="number"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                min="1"
                max={spotsLeft}
                required
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
              />
              <p className="text-xs text-[#706A65] mt-1">
                {t('eventBooking.total', 'Total')}: {formatPrice(event.price * (parseInt(partySize, 10) || 0))}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#706A65] mb-1">
                {t('eventBooking.specialRequests', 'Special requests')}
                <span className="text-[#706A65]/60 ml-1">({t('eventBooking.optional', 'optional')})</span>
              </label>
              <textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={checkoutMutation.isPending}
              className="w-full py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkoutMutation.isPending ? (
                <>
                  <div aria-hidden="true" className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  {t('eventBooking.preparing', 'Preparing...')}
                </>
              ) : (
                t('eventBooking.proceedPayment', 'Proceed to Payment')
              )}
            </button>
          </form>
        ) : step === 'payment' && checkoutData ? (
          <div className="glass-panel p-5">
            <h2 className="text-sm font-bold text-[#1C1917] mb-4">
              {t('eventBooking.payment', 'Payment')}
            </h2>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: checkoutData.client_secret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#9F1239',
                    borderRadius: '10px',
                  },
                },
              }}
            >
              <PaymentForm
                totalAmount={checkoutData.total_amount}
                bookingId={checkoutData.booking_id}
                paymentIntentId={checkoutData.payment_intent_id}
                onSuccess={() => setStep('confirmed')}
                onCancel={() => setStep('details')}
              />
            </Elements>
          </div>
        ) : null}
      </div>
    </div>
  );
}
