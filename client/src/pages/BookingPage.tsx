import { useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import BookingForm from '../components/booking/BookingForm';
import { useRestaurantBySlug } from '../hooks/useBooking';
import { preloadAndSwitchLanguage } from '../i18n/config';

// Map restaurant country → i18n language code
const COUNTRY_LANG: Record<string, string> = {
  brazil: 'pt-BR', brasil: 'pt-BR',
  spain: 'es', españa: 'es', mexico: 'es', méxico: 'es',
  argentina: 'es', colombia: 'es', chile: 'es', peru: 'es', perú: 'es',
};

// Translate country names for PT-BR locale (DB stores English names)
const COUNTRY_NAMES_PT: Record<string, string> = {
  brazil: 'Brasil', 'united states': 'Estados Unidos', spain: 'Espanha',
  mexico: 'México', argentina: 'Argentina', colombia: 'Colômbia',
  chile: 'Chile', peru: 'Peru', portugal: 'Portugal', italy: 'Itália',
  france: 'França', japan: 'Japão', germany: 'Alemanha',
};

const COUNTRY_NAMES_ES: Record<string, string> = {
  brazil: 'Brasil', 'united states': 'Estados Unidos', spain: 'España',
  mexico: 'México', argentina: 'Argentina', colombia: 'Colombia',
  chile: 'Chile', peru: 'Perú', portugal: 'Portugal', italy: 'Italia',
  france: 'Francia', japan: 'Japón', germany: 'Alemania',
};

export default function BookingPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  const { data: restaurant, isLoading, isError } = useRestaurantBySlug(slug);

  // Auto-detect language from restaurant country (PT-BR for Brazil, ES for Spain/LATAM)
  useEffect(() => {
    if (!restaurant?.country) return;
    const lang = COUNTRY_LANG[restaurant.country.toLowerCase()];
    if (lang && i18n.language !== lang) {
      preloadAndSwitchLanguage(lang);
    }
  }, [restaurant?.country, i18n]);

  // Translate country name based on current locale (used for SEO meta + display)
  const countryLower = restaurant?.country?.toLowerCase() ?? '';
  const translatedCountry = i18n.language === 'pt-BR'
    ? (COUNTRY_NAMES_PT[countryLower] || restaurant?.country || '')
    : i18n.language.startsWith('es')
      ? (COUNTRY_NAMES_ES[countryLower] || restaurant?.country || '')
      : (restaurant?.country || '');

  // SEO: inject dynamic title, meta tags, and JSON-LD when restaurant loads
  useEffect(() => {
    if (!restaurant) return;

    const DEFAULT_TITLE = 'seatable - AI Restaurant Management';
    const title = t('pageTitles.bookingPage', { name: restaurant.name });
    const description = t('pageTitles.bookingDescription', { name: restaurant.name, city: restaurant.city, country: translatedCountry });
    const canonicalUrl = `${window.location.origin}/book/${restaurant.slug}`;

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

    // Update canonical link to point to the booking page, not the homepage
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

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
    // Escape </script> sequences to prevent script block breakout (XSS-VULN-03).
    // JSON.stringify does not escape these per ECMA-262, so we do it manually.
    script.text = JSON.stringify(jsonLd).replace(/<\/script>/gi, '<\\/script>');

    return () => {
      document.title = DEFAULT_TITLE;
      document.getElementById('booking-page-jsonld')?.remove();
      // Restore canonical to homepage
      const canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (canonicalEl) canonicalEl.setAttribute('href', 'https://seatable.one/');
    };
  }, [restaurant, t, translatedCountry]);

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
          <p className="text-sm text-stone-gray mb-4">
            {t('reservations.restaurantNotFoundDesc')}
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {t('common.goBack', 'Go back')}
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-stone">
          {t('common.poweredBy')} <span className="font-serif">seatable<span className="text-burgundy">.</span></span>
        </p>
      </div>
    );
  }

  // Normalize restaurant type key: DB may store underscores (fine_dining) or hyphens (fine-dining).
  // i18n keys use hyphens, so convert underscores to hyphens before lookup.
  const typeKey = restaurant.type.replace(/_/g, '-');
  const restaurantType = t(`onboarding.restaurantTypes.${typeKey}`, restaurant.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Top Bar */}
      {!isEmbed && (
        <header className="flex justify-between items-center px-6 sm:px-10 py-4 border-b border-border-gray bg-white">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
          {restaurant?.phone && restaurant.phone !== 'N/A' ? (
            <a href={`tel:${restaurant.phone.replace(/[\s()-]/g, '')}`} className="text-[13px] text-warm-stone hover:text-burgundy transition-colors">
              {t('reservations.needHelp')}
            </a>
          ) : (
            <span className="text-[13px] text-warm-stone">{t('reservations.needHelp')}</span>
          )}
        </header>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row max-w-[1200px] mx-auto w-full px-4 sm:px-10 py-8 md:py-12 gap-8 md:gap-16">
        {/* Left: Restaurant Info */}
        <div className="md:flex-shrink-0 md:w-[340px]">
          <div className="w-full h-[220px] rounded-2xl bg-gradient-to-br from-burgundy/80 via-burgundy/50 to-stone-700 mb-7 flex items-end p-6 relative overflow-hidden">
            {/* Restaurant initial as a subtle background accent */}
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[140px] font-bold text-white/[0.07] leading-none select-none pointer-events-none"
            >
              {restaurant.name.charAt(0).toUpperCase()}
            </span>
            <div className="relative z-10">
              <h2 className="font-serif text-[28px] font-medium text-white tracking-tight mb-1">
                {restaurant.name}
              </h2>
              <p className="text-[13px] text-stone-300 font-light">
                {restaurantType} &middot; {t('booking.locationFormat', { city: restaurant.city, country: translatedCountry, defaultValue: '{{city}}, {{country}}' })}
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
          {t('common.poweredBy')} Seatable
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
