import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../utils/colors';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';

interface ReservationData {
  id: string;
  name: string;
  party_size: number;
  date: string;
  time: string;
  status: string;
  restaurant_name: string;
}

export default function BookingConfirmation() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const state = location.state as { reservation?: ReservationData; restaurant_name?: string } | null;

  const [reservation, setReservation] = useState<ReservationData | null>(state?.reservation ?? null);
  const [loading, setLoading] = useState(!state?.reservation);
  const [notFound, setNotFound] = useState(false);

  // If no state (e.g. page refresh), fetch reservation from API using URL ?id=
  useEffect(() => {
    if (reservation) return;
    const id = searchParams.get('id');
    if (!id) { setLoading(false); setNotFound(true); return; }

    const base = import.meta.env.VITE_API_BASE_URL || '';
    fetch(`${base}/api/portal?action=reservation&id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.reservation) {
          setReservation(data.reservation);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, []);

  // Format time for display (24h -> 12h)
  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-border-gray border-t-burgundy" />
          <span className="text-sm text-warm-stone">{t('reservations.loadingReservation')}</span>
        </div>
      </div>
    );
  }

  if (notFound || !reservation) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center shadow-sm">
          <h1 className="text-xl font-bold text-deep-charcoal mb-2">{t('reservations.title')}</h1>
          <p className="text-sm text-stone-gray mb-6">{t('reservations.noReservationFound')}</p>
          {slug && (
            <button
              onClick={() => navigate(`/book/${slug}`)}
              className="px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-full transition-colors"
            >
              {t('reservations.makeReservation')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[rgba(22,163,74,0.06)] rounded-full mb-5">
            <div className="w-2 h-2 rounded-full bg-green-600" />
            <span className="text-[13px] font-semibold text-green-600">{t('reservations.confirmed')}</span>
          </div>

          <h1 className="font-serif text-4xl font-medium text-deep-charcoal tracking-tight mb-2">{t('reservations.reservationConfirmed')}</h1>
          <p className="text-[15px] text-warm-stone font-light mb-10">
            {t('reservations.confirmationSent')}
          </p>

          {/* Details Card */}
          <div className="bg-white border border-border-gray rounded-2xl p-8 text-left mb-6">
            {/* Restaurant Row */}
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-soft-gray">
              <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-charcoal-dark to-stone-700 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight">{reservation.restaurant_name}</h3>
                <p className="text-[13px] text-warm-stone font-light">{t('reservations.reservationDetails')}</p>
              </div>
            </div>

            {/* Detail Rows */}
            <div className="space-y-0">
              <div className="flex justify-between items-center py-2.5 border-b border-soft-gray">
                <span className="text-[13px] text-warm-stone">{t('reservations.date')}</span>
                <span className="text-sm font-medium text-deep-charcoal">
                  {new Date(reservation.date + 'T12:00:00').toLocaleDateString('en-US', {
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
                <span className="text-sm font-medium text-deep-charcoal">{reservation.party_size} guest{reservation.party_size !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-[13px] text-warm-stone">{t('reservations.guest')}</span>
                <span className="text-sm font-medium text-deep-charcoal">{reservation.name}</span>
              </div>
            </div>

            <hr className="border-0 border-t border-dashed border-border-gray my-3" />

            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-warm-stone">{t('reservations.confirmationId')}</span>
              <span className="text-[13px] font-mono font-medium text-burgundy bg-burgundy/[6%] px-2.5 py-0.5 rounded-lg">{reservation.id}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/customer')}
              className="flex-1 py-3.5 border border-stone-300 bg-white text-stone-gray font-medium rounded-full text-sm hover:border-muted-stone transition-colors"
            >
              {t('reservations.manageReservation')}
            </button>
            {slug && (
              <button
                onClick={() => navigate(`/book/${slug}`)}
                className="flex-1 py-3.5 bg-burgundy text-white font-semibold rounded-full text-sm hover:bg-burgundy-dark transition-colors"
              >
                {t('reservations.newReservation')}
              </button>
            )}
          </div>

          <p className="text-xs text-muted-stone mt-5">
            {t('reservations.cancellationPolicy')}
          </p>
        </div>
      </main>
    </div>
  );
}
