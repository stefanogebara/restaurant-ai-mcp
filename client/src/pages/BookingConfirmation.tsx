import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useReservationById, useRestaurantBySlug, type ReservationData } from '../hooks/useBooking';
import { localizeCancellationPolicy } from '../utils/cancellationPolicy';

export default function BookingConfirmation() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'pt-BR' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const [searchParams] = useSearchParams();

  const state = location.state as { reservation?: ReservationData; restaurant_name?: string; restaurant_id?: string } | null;
  const id = searchParams.get('id');
  const restaurantIdParam = searchParams.get('rid') || state?.restaurant_id;

  const { data: reservation, isLoading } = useReservationById(id, state?.reservation);
  // Fetch the restaurant alongside the reservation so the confirmation page
  // can actually answer Patricia's "where is it / can I cancel / will I get
  // a reminder" questions — previously it was a thin receipt with none of
  // that. The query is cached by useRestaurantBySlug so this is free when
  // arriving from the booking flow.
  const { data: restaurantInfo } = useRestaurantBySlug(slug);

  // Push notification opt-in — UX defer (see push prompt state below).
  //
  // The previous version fired `Notification.requestPermission()` immediately
  // on confirmation-page mount. On mobile that pops the system "Allow
  // notifications?" prompt the instant the customer lands on the page,
  // before they've read anything. Most users deny reflexively, permanently
  // losing the ability to receive reservation reminders (browsers don't
  // let you ask twice).
  //
  // Now we show a small opt-in card explaining the benefit. The actual
  // requestPermission() call only fires when the user clicks "Turn on
  // reminders" — converting fewer permissions but at a much higher
  // grant rate, and a far better first impression for the brand.
  type PushPromptState = 'unavailable' | 'denied' | 'granted' | 'idle' | 'requesting';
  const [pushPromptState, setPushPromptState] = useState<PushPromptState>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushPromptState('unavailable');
      return;
    }
    // Map browser permission state to our prompt state.
    const perm = Notification.permission;
    if (perm === 'denied') setPushPromptState('denied');
    else if (perm === 'granted') setPushPromptState('granted');
    else setPushPromptState('idle');
  }, []);

  const subscribeToPush = async () => {
    const restaurantId = restaurantIdParam;
    const reservationId = id;
    if (!restaurantId || !reservationId) return;
    setPushPromptState('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushPromptState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidPublicKey) {
        setPushPromptState('granted'); // permission OK but server-side push not configured
        return;
      }
      // Avoid duplicate subscriptions on re-click or page reload.
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        setPushPromptState('granted');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
      // DD.2 — check res.ok before flipping UI state. The old version
      // treated any HTTP response as success, so a 4xx from the server
      // (e.g. missing VAPID config) would land the user on a "granted"
      // UI while their subscription wasn't actually persisted.
      const res = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          reservation_id: reservationId,
          restaurant_id: restaurantId,
        }),
      });
      if (!res.ok) {
        console.error('[BookingConfirmation] push subscribe non-OK', res.status);
        setPushPromptState('idle');
        return;
      }
      setPushPromptState('granted');
    } catch (err) {
      // Non-critical — log so Sentry catches a population-wide push outage.
      console.error('[BookingConfirmation] push subscribe failed', err);
      setPushPromptState('idle');
    }
  };

  // Notify parent window (widget iframe) that booking was confirmed.
  // Security: targetOrigin must NOT be '*' — that broadcasts customer PII
  // (name, date, time, party_size) to any malicious site that iframes us
  // with a known reservation ID. Derive the parent origin from document.referrer
  // and only post when we have a concrete origin to address.
  useEffect(() => {
    if (!reservation || !window.parent || window.parent === window) return;
    let targetOrigin = '';
    try {
      if (document.referrer) targetOrigin = new URL(document.referrer).origin;
    } catch {
      // Malformed referrer — fall through; we won't post.
    }
    if (!targetOrigin) return;
    window.parent.postMessage({
      type: 'seatable-booking-confirmed',
      payload: {
        reservation_id: id,
        slug,
        guest_name: reservation.name,
        date: reservation.date,
        time: reservation.time,
        party_size: reservation.party_size,
      },
    }, targetOrigin);
  }, [reservation, id, slug]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div role="status" className="flex items-center gap-3">
          <div aria-hidden="true" className="animate-spin rounded-full h-5 w-5 border-2 border-border-gray border-t-burgundy" />
          <span className="text-sm text-warm-stone">{t('reservations.loadingReservation')}</span>
        </div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-glass-border-dark bg-glass-panel backdrop-blur-glass-nav">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
          <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
        </header>
        <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="max-w-[440px] w-full text-center">
            <div className="w-20 h-20 rounded-full bg-burgundy/[6%] flex items-center justify-center mx-auto mb-7">
              <ThiingsIcon name="calendar" pxSize={36} className="text-burgundy" />
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-deep-charcoal tracking-tight mb-3">
              {t('reservations.noReservationFoundTitle')}
            </h1>
            <p className="text-[15px] text-warm-stone font-light mb-8">
              {t('reservations.noReservationFoundDesc')}
            </p>
            {slug && (
              <button
                type="button"
                onClick={() => navigate(`/book/${slug}`)}
                className="px-7 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-full text-sm transition-colors"
              >
                {t('reservations.makeReservation')}
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
        <div className="font-serif text-lg font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
      </header>

      {/* Confirmation */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-[480px] w-full text-center">
          {/* Burgundy Checkmark */}
          <div className="w-20 h-20 rounded-full bg-burgundy/[8%] flex items-center justify-center mx-auto mb-7">
            <ThiingsIcon name="check" pxSize={36} className="text-burgundy" />
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-rose-600/[6%] rounded-full mb-5">
            <div className="w-2 h-2 rounded-full bg-rose-600" />
            <span className="text-[13px] font-semibold text-rose-600">{t('reservations.confirmed')}</span>
          </div>

          <h1 className="font-serif text-4xl font-medium text-deep-charcoal tracking-tight mb-2">{t('reservations.reservationConfirmed')}</h1>
          <p className="text-[15px] text-warm-stone font-light mb-10">
            {t('reservations.confirmationSent')}
          </p>

          {/* Details Card */}
          <div className="glass-panel p-8 text-left mb-6">
            {/* Restaurant Row */}
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-soft-gray">
              <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-burgundy/80 via-burgundy/50 to-stone-700 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight truncate">{reservation.restaurant_name}</h3>
                <p className="text-[13px] text-warm-stone font-light">{t('reservations.reservationDetails')}</p>
              </div>
            </div>

            {/* Detail Rows */}
            <div className="space-y-0">
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">{t('reservations.date')}</span>
                <span className="text-sm font-medium text-deep-charcoal">
                  {new Date(reservation.date + 'T12:00:00').toLocaleDateString(dateLocale, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">{t('reservations.time')}</span>
                <span className="text-sm font-medium text-deep-charcoal">{formatTime(reservation.time)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">{t('reservations.partySize')}</span>
                <span className="text-sm font-medium text-deep-charcoal">{t('reservations.guestCount', { count: reservation.party_size })}</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-[13px] text-warm-stone">{t('reservations.guest')}</span>
                <span className="text-sm font-medium text-deep-charcoal">{reservation.name}</span>
              </div>
            </div>

            <hr className="border-0 border-t border-dashed border-border-gray my-3" />

            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-warm-stone">{t('reservations.confirmationId')}</span>
              <span className="text-[13px] font-mono font-medium text-burgundy bg-burgundy/[6%] px-2.5 py-0.5 rounded-lg truncate max-w-[180px] sm:max-w-none">{reservation.id}</span>
            </div>
          </div>

          {/* Push opt-in — only shows when notifications are available and
              not already granted/denied. Renders BEFORE the system prompt
              fires so the customer sees the value proposition first. */}
          {pushPromptState === 'idle' && (
            <div className="bg-burgundy/[0.04] border border-burgundy/15 rounded-2xl p-4 text-left mb-6 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-burgundy/[8%] flex items-center justify-center flex-shrink-0 text-base" aria-hidden="true">🔔</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-deep-charcoal">
                    {t('reservations.confirmation.pushTeaserTitle', 'Get a reminder on the day')}
                  </p>
                  <p className="text-[12px] text-warm-stone mt-0.5">
                    {t('reservations.confirmation.pushTeaserBody', "We'll ping your browser an hour before your reservation. No email spam.")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={subscribeToPush}
                className="px-4 py-2 text-[13px] font-semibold bg-burgundy hover:bg-burgundy-dark text-white rounded-lg transition-colors flex-shrink-0"
              >
                {t('reservations.confirmation.pushTeaserCta', 'Turn on reminders')}
              </button>
            </div>
          )}
          {pushPromptState === 'requesting' && (
            <div className="bg-burgundy/[0.04] border border-burgundy/15 rounded-2xl p-4 text-left mb-6 flex items-center gap-3">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-burgundy border-t-transparent" aria-hidden="true" />
              <p className="text-[13px] text-warm-stone">
                {t('reservations.confirmation.pushRequesting', 'Setting up reminders…')}
              </p>
            </div>
          )}
          {pushPromptState === 'granted' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left mb-6 flex items-center gap-3">
              <span className="text-base" aria-hidden="true">✅</span>
              <p className="text-[13px] text-green-800">
                {t('reservations.confirmation.pushGranted', "Reminders are on. We'll ping you an hour before.")}
              </p>
            </div>
          )}

          {/* What's next — answers the questions Patricia closed the tab
              wondering: where is it, what reminders will I get, how do I
              cancel? Previously this page was a receipt only. */}
          <div className="glass-card p-6 text-left mb-6 space-y-3">
            <h2 className="text-sm font-semibold text-deep-charcoal mb-2">
              {t('reservations.confirmation.whatsNext', "What's next?")}
            </h2>
            <ul className="space-y-2.5 text-sm text-deep-charcoal">
              {/* Only promise the WhatsApp reminder when the restaurant has it
                  actually enabled — otherwise the line is a lie that erodes
                  trust the moment the customer notices no reminder arrives
                  (audit BUG #25). When WhatsApp is off we still show a useful
                  "save this confirmation" prompt instead of nothing. */}
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center flex-shrink-0 text-base" aria-hidden="true">💬</span>
                <span className="leading-snug">
                  {restaurantInfo?.whatsapp_enabled
                    ? t('reservations.confirmation.reminder', "We'll send you a WhatsApp reminder 24 hours before your reservation.")
                    : t('reservations.confirmation.saveConfirmation', "Save this confirmation — the restaurant has your phone number if anything changes.")}
                </span>
              </li>
              {restaurantInfo?.phone && (
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-soft-gray text-deep-charcoal flex items-center justify-center flex-shrink-0 text-base" aria-hidden="true">📞</span>
                  <span className="leading-snug">
                    {t('reservations.confirmation.callRestaurant', 'Need to talk to the restaurant?')}{' '}
                    <a
                      href={`tel:${restaurantInfo.phone}`}
                      className="font-medium text-burgundy hover:text-burgundy-dark"
                    >
                      {restaurantInfo.phone}
                    </a>
                  </span>
                </li>
              )}
              {(restaurantInfo?.city || restaurantInfo?.country) && (
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-soft-gray text-deep-charcoal flex items-center justify-center flex-shrink-0 text-base" aria-hidden="true">📍</span>
                  <span className="leading-snug">
                    {[restaurantInfo.city, restaurantInfo.country].filter(Boolean).join(', ')}{' '}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([reservation.restaurant_name, restaurantInfo.city, restaurantInfo.country].filter(Boolean).join(' '))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-burgundy hover:text-burgundy-dark underline underline-offset-2"
                    >
                      {t('reservations.confirmation.openMaps', 'Open in Maps')}
                    </a>
                  </span>
                </li>
              )}
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-soft-gray text-deep-charcoal flex items-center justify-center flex-shrink-0 text-base" aria-hidden="true">↩️</span>
                <span className="leading-snug">
                  {t('reservations.confirmation.howToCancel', 'Need to cancel or change?')}{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/customer')}
                    className="font-medium text-burgundy hover:text-burgundy-dark underline underline-offset-2"
                  >
                    {t('reservations.confirmation.manageHere', 'Manage your reservation')}
                  </button>
                </span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/customer')}
              className="flex-1 py-3.5 border border-glass-border-dark bg-white/60 hover:bg-white/85 text-stone-gray font-medium rounded-full text-sm hover:border-muted-stone transition-colors"
            >
              {t('reservations.manageReservation')}
            </button>
            {slug && (
              <button
                type="button"
                onClick={() => navigate(`/book/${slug}`)}
                className="flex-1 py-3.5 bg-burgundy text-white font-semibold rounded-full text-sm hover:bg-burgundy-dark transition-colors"
              >
                {t('reservations.newReservation')}
              </button>
            )}
          </div>

          <p className="text-xs text-muted-stone mt-5">
            {/* Honor the restaurant's chosen preset (e.g. cancelFree24h) but
                always render it in the customer's locale, never the owner's. */}
            {localizeCancellationPolicy(restaurantInfo?.cancellation_policy, t)}
          </p>
        </div>
      </main>

      {/* Powered by Seatable badge — opens same-tab now. The previous
          `target="_blank"` yanked the customer to a B2B marketing page
          and broke their confirmation context. */}
      <div className="mt-8 pb-8 flex justify-center">
        <a
          href="/?ref=badge"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-glass-border-dark bg-white/50 backdrop-blur-glass-chip hover:bg-white/80 transition-colors text-xs text-muted-stone hover:text-warm-stone"
        >
          <span className="text-burgundy font-semibold">{'\u26A1'}</span>
          {t('common.poweredBy')} Seatable
        </a>
      </div>
    </div>
  );
}
