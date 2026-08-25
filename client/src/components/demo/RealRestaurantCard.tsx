/**
 * RealRestaurantCard
 *
 * The "wow moment" on the demo dashboard — surfaces all the rich Google
 * Places data we already scraped at /demo/setup but were silently throwing
 * away. The user types "Famiglia Mancini, São Paulo" and 30 seconds later
 * lands on a dashboard showing their actual rating, address, editorial
 * summary, top reviews, and map link.
 *
 * Survives refreshes and deep-links: scraped_data is persisted as JSONB at
 * demo creation and returned by the session API, so DemoDashboard merges
 * router state with the DB copy and this card renders from either source.
 * It only hides when neither has scrape data.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';

/**
 * Restaurant hero photo — proxied through /api/places-photo so we can attach
 * our Google Places key server-side. Hides itself on load failure (broken
 * photoUri from a stale ref or a 502 from Google) so the card never shows
 * an empty image frame. The endpoint itself returns a 302 to Google's CDN,
 * so the bandwidth doesn't pass through Vercel.
 */
function RestaurantHeroPhoto({ photoRef, alt }: { photoRef: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // Encode the ref defensively — Google's photo resource names contain only
  // [A-Za-z0-9_-]+, but encoding is cheap insurance against a future ref
  // format that introduces reserved chars.
  const src = `/api/places-photo?ref=${encodeURIComponent(photoRef)}&maxWidth=1200`;
  return (
    <div className="relative -mx-6 -mt-2 aspect-[21/9] overflow-hidden bg-soft-gray">
      {/* Skeleton enquanto a foto carrega (proxy → redirect → Google): sem
          ele, conexões lentas viam um bloco branco gigante de altura
          reservada no meio do card. */}
      <div className="absolute inset-0 animate-pulse bg-glass-border-dark/40" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
        className="relative w-full h-full object-cover"
      />
      {/* Subtle bottom fade so the rating/editorial text beneath the photo
          stays comfortably readable when a bright photo butts up against
          the white card background. */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-white/60 pointer-events-none" />
    </div>
  );
}

export interface ScrapedRestaurantData {
  /** Demo manual ("restaurante novo", F4): não há dados do Google — o painel
   *  troca este card pelo "configurada por você". */
  manual?: boolean;
  vibe_tags?: string[];
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
  // Phase K enrichment: populated by /api/enrich-restaurant during demo
  // creation. Either field may be absent when the LLM pass didn't run or
  // didn't find anything. AIKnowsCard handles all empties gracefully.
  menu?: {
    menu_items?: Array<{ name?: string; price?: string | null; description?: string | null; category?: string | null }>;
    popular_dishes?: string[];
    social_handles?: { instagram?: string | null; facebook?: string | null };
    hours_text?: string | null;
    source_url?: string;
  } | null;
  insights?: {
    popular_dishes?: string[];
    praise_themes?: string[];
    complaint_themes?: string[];
    vibe_tags?: string[];
    ai_voice_notes?: string[];
  } | null;
  enriched_at?: string;
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

/**
 * Faixa de preço em símbolos ($ a $$$$), como o próprio Google Maps mostra.
 *
 * Antes o enum cru do Places ia direto pra tela: o dono via "moderate faixa
 * de preço" — palavra em inglês no meio do cartão em português (walkthrough
 * de 28/jul em produção). Símbolo é neutro de idioma e universalmente lido.
 * Aceita o enum v2 (PRICE_LEVEL_MODERATE) e o legado numérico (0–4);
 * desconhecido/FREE não renderiza — lixo de enum não vai pra tela.
 */
function simboloDePreco(nivel: string | number | null | undefined): string | null {
  if (nivel == null) return null;
  const porEnum: Record<string, number> = {
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const n = typeof nivel === 'number' ? nivel : porEnum[nivel] ?? 0;
  return n >= 1 && n <= 4 ? '$'.repeat(n) : null;
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
    name,
    rating,
    review_count = 0,
    address,
    editorial_summary,
    top_reviews = [],
    google_maps_url,
    website,
    price_level,
    photo_ref,
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
      <section className="glass-card p-4 sm:p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
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
              <ThiingsIcon name="map-pin" size="xs" className="shrink-0 text-warm-stone" />
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
    <section className="glass-card p-6 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full mb-3">
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

      {/* Hero photo — only renders when the scrape captured a photo_ref.
          Bleeds to card edges (-mx-6) for a magazine-style proof shot
          right under the "Pulled from Google in real time" badge. */}
      {photo_ref && <RestaurantHeroPhoto photoRef={photo_ref} alt={name || ''} />}

      {/* Stats row */}
      <div className="flex items-center gap-6 flex-wrap pt-1">
        {ratingDisplay && (
          <div className="flex items-center gap-2">
            <StarRow rating={rating!} />
            <span className="text-lg font-bold text-deep-charcoal leading-none">{ratingDisplay}</span>
            <span className="text-xs text-warm-stone">· {formatReviewCount(review_count, t)}</span>
          </div>
        )}
        {simboloDePreco(price_level) && (
          <div className="text-xs text-warm-stone">
            <span className="font-medium text-deep-charcoal">{simboloDePreco(price_level)}</span>
            {' '}{t('demo.realCard.priceRange', 'price range')}
          </div>
        )}
      </div>

      {editorial_summary && (
        <p className="text-sm text-stone-700 italic leading-relaxed border-l-2 border-glass-border-dark pl-3">
          "{editorial_summary}"
        </p>
      )}

      {/* Address + maps */}
      {address && (
        <div className="text-sm text-warm-stone flex items-start gap-2">
          <ThiingsIcon name="map-pin" size="xs" className="shrink-0 mt-0.5 text-warm-stone" />
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
        <div className="pt-4 border-t border-glass-border-dark space-y-3">
          <p className="text-xs font-semibold text-warm-stone">
            {t('demo.realCard.recentReviews', 'Recent reviews on Google')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Melhores primeiro: a ordem crua do Google abria o card de
                VENDAS com uma review de 1 estrela (Mocotó, 24/ago). As
                críticas continuam alimentando o AIKnowsCard, que as trata
                como "tratar com antecedência" — o lugar certo. */}
            {[...top_reviews]
              .sort((a, b) => (b?.rating ?? 0) - (a?.rating ?? 0))
              .slice(0, 3)
              .map((review, i) => {
              if (!review?.text) return null;
              const snippet = review.text.length > 160 ? `${review.text.slice(0, 160).trim()}…` : review.text;
              return (
                <div
                  key={i}
                  className="bg-soft-gray border border-glass-border-dark rounded-xl p-3 text-xs text-stone-700 space-y-2"
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
        <div className="pt-3 border-t border-glass-border-dark flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
            <ThiingsIcon name="arrow-right" size="xs" />
          </Link>
        </div>
      )}

      <div className="pt-2 text-[11px] text-muted-stone leading-relaxed">
        {t('demo.realCard.scrapeNote', "We pulled this from Google Places in real time — the same way your AI receptionist will when guests ask about your menu, hours, or address.")}
      </div>
    </section>
  );
}
