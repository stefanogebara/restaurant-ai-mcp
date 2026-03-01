import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import BookingForm from '../components/booking/BookingForm';
import { useRestaurantBySlug } from '../hooks/useBooking';

export default function BookingPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  const { data: restaurant, isLoading, isError, error } = useRestaurantBySlug(slug);

  // SEO: inject dynamic title, meta tags, and JSON-LD when restaurant loads
  useEffect(() => {
    if (!restaurant) return;

    const DEFAULT_TITLE = 'seatable - AI Restaurant Management';
    const title = `${restaurant.name} — Reserve a Table | Seatable`;
    const description = `Book a table at ${restaurant.name} in ${restaurant.city}, ${restaurant.country}. Check availability and reserve online — quick and easy.`;
    const canonicalUrl = `https://restaurant-ai-mcp.vercel.app/book/${restaurant.slug}`;

    document.title = title;

    const setMeta = (attr: string, name: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: restaurant.name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: restaurant.city,
        addressCountry: restaurant.country,
      },
      servesCuisine: restaurant.type.replace(/_/g, ' '),
      ...(restaurant.phone && { telephone: restaurant.phone }),
      ...(restaurant.website && { url: restaurant.website }),
      potentialAction: {
        '@type': 'ReservationAction',
        target: canonicalUrl,
      },
    };

    let script = document.getElementById('booking-page-jsonld') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'booking-page-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(jsonLd);

    return () => {
      document.title = DEFAULT_TITLE;
      document.getElementById('booking-page-jsonld')?.remove();
    };
  }, [restaurant]);

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

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading" className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div aria-hidden="true" className="font-serif text-2xl text-deep-charcoal opacity-50">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-border-gray border-t-burgundy" />
      </div>
    );
  }

  if (isError || !restaurant) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center p-6">
        <div className="bg-white border border-border-gray rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ThiingsIcon name="close" pxSize={32} className="text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-deep-charcoal mb-2">{t('reservations.restaurantNotFound')}</h1>
          <p className="text-sm text-stone-gray">
            {error instanceof Error ? error.message : 'The restaurant you are looking for does not exist or is not accepting online reservations.'}
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
      {!isEmbed && (
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
          <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
        </header>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row max-w-[1200px] mx-auto w-full px-6 sm:px-10 py-8 lg:py-12 gap-10 lg:gap-16">
        {/* Left: Restaurant Info */}
        <div className="lg:flex-shrink-0 lg:w-[340px]">
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

          <div className="mb-7">
            <DetailRow icon="✹" label={t('reservations.cuisine')} value={restaurantType} />
            <DetailRow icon="⏱" label={t('reservations.hoursToday')} value={getTodayHours()} />
          </div>
        </div>

        {/* Right: Booking Form */}
        <BookingForm restaurant={restaurant} />
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
