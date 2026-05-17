/**
 * RealRestaurantCard
 *
 * The "wow moment" on the demo dashboard — surfaces all the rich Google
 * Places data we already scraped at /demo/setup but were silently throwing
 * away. The user types "Famiglia Mancini, São Paulo" and 30 seconds later
 * lands on a dashboard showing their actual rating, address, editorial
 * summary, top reviews, and map link.
 *
 * Renders ONLY when scraped_data was passed via location.state. On a refresh
 * (no state) the card hides and the dashboard falls back to its existing
 * generic layout — no broken empty card.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';

export interface ScrapedRestaurantData {
  name?: string;
  address?: string | null;
  phone?: string | null;
  rating?: number | null;
  review_count?: number;
  cuisine_type?: string;
  website?: string | null;
  google_maps_url?: string | null;
  editorial_summary?: string | null;
  hours_text?: string[] | null;
  top_reviews?: Array<{ text?: string; rating?: number; author?: string; time?: string }>;
  photo_ref?: string | null;
  price_level?: string | number | null;
}

interface RealRestaurantCardProps {
  data: ScrapedRestaurantData | null | undefined;
  /** Render compact summary only — for the dashboard top bar */
  compact?: boolean;
  /**
   * Path the inline "Take over this restaurant" CTA points at. Default
   * /login. Hide entirely by passing `null` (e.g. on /demo?preset=italian
   * where we don't want a conversion CTA in the wow card itself).
   */
  conversionHref?: string | null;
  /** Optional analytics callback fired when the inline CTA is clicked */
  onConversionClick?: () => void;
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className="w-3.5 h-3.5"
          viewBox="0 0 20 20"
          fill={i < full ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function formatReviewCount(count: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (count >= 1000) {
    const k = (count / 1000).toFixed(count >= 10000 ? 0 : 1);
    return t('demo.realCard.reviewsCountK', '{{k}}k reviews', { k });
  }
  return t('demo.realCard.reviewsCount', '{{count}} reviews', { count });
}

export default function RealRestaurantCard({
  data,
  compact = false,
  conversionHref = '/login',
  onConversionClick,
}: RealRestaurantCardProps) {
  const { t, i18n } = useTranslation();
  if (!data) return null;

  const {
    rating,
    review_count = 0,
    address,
    editorial_summary,
    top_reviews = [],
    google_maps_url,
    website,
    price_level,
  } = data;

  // Don't render the card at all if we have nothing interesting to show
  const hasSomethingToShow =
    rating || address || editorial_summary || (top_reviews && top_reviews.length > 0);
  if (!hasSomethingToShow) return null;

  const ratingDisplay = typeof rating === 'number'
    ? rating.toLocaleString(i18n.language || 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null;

  if (compact) {
    // Slim banner — fits at top of dashboard. No reviews block.
    return (
      <section className="bg-white border border-border-gray rounded-2xl p-4 sm:p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t('demo.realCard.liveBadge', 'Pulled from Google in real time')}
            </span>
          </div>
          {ratingDisplay && (
            <div className="flex items-center gap-1.5">
              <StarRow rating={rating!} />
              <span className="text-sm font-semibold text-deep-charcoal">{ratingDisplay}</span>
              <span className="text-xs text-warm-stone">· {formatReviewCount(review_count, t)}</span>
            </div>
          )}
          {address && (
            <div className="flex items-center gap-1.5 text-xs text-warm-stone min-w-0">
              <span aria-hidden="true">📍</span>
              <span className="truncate">{address}</span>
              {google_maps_url && (
                <a
                  href={google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-burgundy hover:text-burgundy-dark underline underline-offset-2 flex-shrink-0"
                >
                  {t('demo.realCard.openMaps', 'Maps')}
                </a>
              )}
            </div>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-burgundy hover:text-burgundy-dark underline underline-offset-2"
            >
              {t('demo.realCard.website', 'Website')}
            </a>
          )}
        </div>
      </section>
    );
  }

  // Full card with reviews + editorial summary
  return (
    <section className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('demo.realCard.liveBadge', 'Pulled from Google in real time')}
          </span>
          <h2 className="text-base font-semibold text-deep-charcoal">
            {t('demo.realCard.heading', "Here's your restaurant — already in our system")}
          </h2>
          <p className="text-xs text-warm-stone mt-1">
            {t('demo.realCard.subtitle', "Your AI receptionist is configured with all of this. Take a look around — when you're ready, click Get Started Free to take over.")}
          </p>
        </div>
      </header>

      {/* Stats row */}
      <div className="flex items-center gap-6 flex-wrap pt-1">
        {ratingDisplay && (
          <div className="flex items-center gap-2">
            <StarRow rating={rating!} />
            <span className="text-lg font-bold text-deep-charcoal leading-none">{ratingDisplay}</span>
            <span className="text-xs text-warm-stone">· {formatReviewCount(review_count, t)}</span>
          </div>
        )}
        {price_level && (
          <div className="text-xs text-warm-stone">
            <span className="font-medium text-deep-charcoal">{String(price_level).replace('PRICE_LEVEL_', '').toLowerCase()}</span>
            {' '}{t('demo.realCard.priceRange', 'price range')}
          </div>
        )}
      </div>

      {editorial_summary && (
        <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-burgundy/40 pl-3">
          "{editorial_summary}"
        </p>
      )}

      {/* Address + maps */}
      {address && (
        <div className="text-sm text-warm-stone flex items-start gap-2">
          <span aria-hidden="true" className="text-base flex-shrink-0">📍</span>
          <span className="flex-1">
            {address}
            {google_maps_url && (
              <>
                {' · '}
                <a
                  href={google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-burgundy hover:text-burgundy-dark underline underline-offset-2"
                >
                  {t('demo.realCard.openMaps', 'Open in Maps')}
                </a>
              </>
            )}
          </span>
        </div>
      )}

      {/* Top reviews — proof we know the restaurant */}
      {top_reviews && top_reviews.length > 0 && (
        <div className="pt-2 border-t border-border-gray space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-warm-stone">
            {t('demo.realCard.recentReviews', 'Recent reviews on Google')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {top_reviews.slice(0, 3).map((review, i) => {
              if (!review?.text) return null;
              const snippet = review.text.length > 160 ? `${review.text.slice(0, 160).trim()}…` : review.text;
              return (
                <div
                  key={i}
                  className="bg-soft-gray rounded-xl p-3 text-xs text-stone-700 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    {typeof review.rating === 'number' && <StarRow rating={review.rating} />}
                    {review.time && <span className="text-[10px] text-muted-stone">{review.time}</span>}
                  </div>
                  <p className="leading-relaxed line-clamp-4">{snippet}</p>
                  {review.author && (
                    <p className="text-[10px] text-muted-stone">— {review.author}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline conversion CTA — the wow moment and the ask happen in the
          same card so the user doesn't have to scroll 1500px to find "Get
          Started Free" after seeing their real restaurant materialize. */}
      {conversionHref && (
        <div className="pt-3 border-t border-border-gray flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-deep-charcoal">
              {t('demo.realCard.ctaHeading', 'Ready to take over this restaurant?')}
            </p>
            <p className="text-xs text-warm-stone mt-0.5">
              {t('demo.realCard.ctaSubtitle', "14-day free trial, no credit card. Your data carries over.")}
            </p>
          </div>
          <Link
            to={conversionHref}
            onClick={onConversionClick}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors whitespace-nowrap flex-shrink-0"
          >
            {t('demo.realCard.ctaButton', 'Take it over')}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}

      <div className="pt-2 text-[11px] text-muted-stone leading-relaxed">
        {t('demo.realCard.scrapeNote', "We pulled this from Google Places in real time — the same way your AI receptionist will when guests ask about your menu, hours, or address.")}
      </div>
    </section>
  );
}
