import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import type { ScrapedRestaurant } from '../../lib/applyScrapedData';

interface Step0SearchProps {
  onPrefill: (scraped: ScrapedRestaurant) => void;
  onSkip: () => void;
}

interface ScrapeResult extends ScrapedRestaurant {
  address?: string | null;
  rating?: number | null;
  review_count?: number;
  photo_ref?: string | null;
  google_maps_url?: string | null;
}

/**
 * Onboarding Step 0 — auto-prefill via Google Places.
 *
 * Two paths:
 *   1. Google match → top hit card → user confirms or tries again
 *   2. No match    → "got a website?" URL input → /api/enrich-restaurant
 *      (best-effort extraction — runWebsiteEnrich abaixo TAMBÉM aplica
 *      contato/horários quando o site os expõe, além de primar a memória)
 *
 * Always offers a "Skip — I'll fill manually" link so a brand-new restaurant
 * with no Google presence and no website can proceed.
 *
 * On any prefill the parent gets a Partial<ScrapedRestaurant> via onPrefill,
 * which it converts to OnboardingData via lib/applyScrapedData.ts.
 */
export default function Step0Search({ onPrefill, onSkip }: Step0SearchProps) {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<ScrapeResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Website-fallback state — shown when Google search returns 0 hits OR
  // when the user clicks "None of these — got a website?" under the 3-card
  // picker.
  const [website, setWebsite] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [showWebsiteFallback, setShowWebsiteFallback] = useState(false);

  const canSearch = name.trim().length > 0 && city.trim().length > 0 && !searching;

  async function runGoogleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch) return;
    setSearching(true);
    setSearchError(null);
    setHits(null);
    try {
      const res = await fetch('/api/scrape-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name.trim(), city: city.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSearchError(body.error || t('onboarding.step0.searchFailed', 'Search failed. Try again or skip below.'));
        return;
      }
      setHits(Array.isArray(body.results) ? body.results : []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'network_error');
    } finally {
      setSearching(false);
    }
  }

  async function runWebsiteEnrich(e: React.FormEvent) {
    e.preventDefault();
    const url = website.trim();
    if (!url) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch('/api/enrich-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: url, restaurant_name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnrichError(body.error || t('onboarding.step0.enrichFailed', 'Could not read that website.'));
        return;
      }
      // Pull contact + business_hours out of the enrich response — both may
      // be null if the site didn't surface them with confidence, but when
      // they exist they shave a chunk of typing off Step 2.
      const menu = body?.menu ?? null;
      const contact = menu?.contact && typeof menu.contact === 'object' ? menu.contact : null;
      const business_hours = menu?.business_hours && typeof menu.business_hours === 'object' ? menu.business_hours : null;
      onPrefill({
        name: name.trim(),
        // Cidade digitada na busca — era coletada e descartada, e o Passo 1
        // perguntava de novo (auditoria 24/ago).
        city: city.trim(),
        website: url,
        phone: contact?.phone ?? null,
        address: contact?.address ?? null,
        business_hours,
      });
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'network_error');
    } finally {
      setEnriching(false);
    }
  }

  const showNoMatch = hits !== null && hits.length === 0;
  // Top 3 results so a user whose name is shared across cities (Cantina Bella
  // exists in São Paulo, Rio, AND Lisbon) doesn't get force-matched to the
  // wrong one by Google's relevance heuristic.
  const candidates = hits ? hits.slice(0, 3) : [];
  const showWebsiteForm = showNoMatch || showWebsiteFallback;

  return (
    <div className="space-y-6" data-testid="step0-search">
      <div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-deep-charcoal mb-2">
          {t('onboarding.step0.title', 'Find your restaurant')}
        </h2>
        <p className="text-sm text-muted-stone">
          {t(
            'onboarding.step0.subtitle',
            "Type your restaurant name + city — we'll pull the basics from Google Maps so you don't have to retype them.",
          )}
        </p>
      </div>

      <form onSubmit={runGoogleSearch} className="space-y-4">
        <div>
          <label htmlFor="step0-name" className="block text-sm font-medium text-deep-charcoal mb-1">
            {t('onboarding.step0.nameLabel', 'Restaurant name')}
          </label>
          <input
            id="step0-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.step0.namePlaceholder', 'e.g. Cantina Bella')}
            className="w-full px-4 py-2.5 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy"
          />
        </div>
        <div>
          <label htmlFor="step0-city" className="block text-sm font-medium text-deep-charcoal mb-1">
            {t('onboarding.step0.cityLabel', 'City')}
          </label>
          <input
            id="step0-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('onboarding.step0.cityPlaceholder', 'e.g. São Paulo')}
            className="w-full px-4 py-2.5 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy"
          />
        </div>
        <button
          type="submit"
          disabled={!canSearch}
          className="px-4 py-2 bg-burgundy text-white rounded-[100px] text-sm font-semibold hover:bg-burgundy-dark transition-colors disabled:opacity-50"
        >
          {searching
            ? t('onboarding.step0.searching', 'Searching…')
            : t('onboarding.step0.searchCta', 'Search Google Maps')}
        </button>
      </form>

      {searchError && (
        <p className="text-sm text-red-700" data-testid="step0-search-error">{searchError}</p>
      )}

      {/* CANDIDATES — up to 3 cards, user picks the right one */}
      {candidates.length > 0 && (
        <div className="space-y-3" data-testid="step0-candidates">
          <p className="text-sm font-medium text-deep-charcoal">
            {candidates.length === 1
              ? t('onboarding.step0.singleResultLabel', 'Found one match:')
              : t('onboarding.step0.multiResultLabel', 'Which one is yours?')}
          </p>
          {candidates.map((hit, i) => (
            <div
              key={(hit.name || '') + '-' + i}
              className="border border-glass-border-dark rounded-xl p-4 space-y-3"
              data-testid={`step0-candidate-${i}`}
            >
              <div>
                <p className="text-sm font-semibold text-deep-charcoal">{hit.name || name}</p>
                {hit.address && <p className="text-xs text-muted-stone mt-0.5">{hit.address}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-stone">
                  {hit.cuisine_type && <span>{hit.cuisine_type}</span>}
                  {hit.rating && (
                  <span className="inline-flex items-center gap-1">
                    <ThiingsIcon name="star" pxSize={12} className="text-amber-600" />
                    {hit.rating} ({hit.review_count || 0})
                  </span>
                )}
                  {hit.phone && <span>{hit.phone}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPrefill({ ...hit, city: hit.city || city.trim() })}
                className="px-4 py-2 bg-burgundy text-white rounded-[100px] text-sm font-semibold hover:bg-burgundy-dark transition-colors"
                data-testid={`step0-pick-${i}`}
              >
                {t('onboarding.step0.pickThisCta', 'Use this one')}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setHits(null); setSearchError(null); setShowWebsiteFallback(false); }}
              className="px-4 py-2 border border-glass-border-dark rounded-lg text-sm font-medium text-deep-charcoal hover:bg-soft-gray transition-colors"
            >
              {t('onboarding.step0.searchAgainCta', 'Search again')}
            </button>
            {!showWebsiteFallback && (
              <button
                type="button"
                onClick={() => setShowWebsiteFallback(true)}
                className="px-4 py-2 text-sm text-muted-stone underline underline-offset-2 hover:text-deep-charcoal transition-colors"
                data-testid="step0-none-of-these"
              >
                {t('onboarding.step0.noneOfTheseCta', 'None of these — got a website?')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* NO-MATCH HINT + website fallback. Visible when Google returned 0
          hits OR when the user clicked "None of these — got a website?" under
          a populated candidates list. */}
      {showWebsiteForm && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3" data-testid="step0-no-match">
          <p className="text-sm text-amber-800">
            {showNoMatch ? (
              <>
                <span className="font-semibold">
                  {t('onboarding.step0.noMatchTitle', "We couldn't find your restaurant on Google Maps.")}
                </span>
                {' '}
                {t('onboarding.step0.noMatchPrompt', 'Got a website? We can read the basics from there.')}
              </>
            ) : (
              <span className="font-semibold">
                {t('onboarding.step0.websiteFallbackPrompt', 'Drop your website and we can read the basics from there.')}
              </span>
            )}
          </p>
          <form onSubmit={runWebsiteEnrich} className="space-y-2">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://your-restaurant.com"
              className="w-full px-4 py-2.5 border border-glass-border-input rounded-lg text-sm focus:outline-none focus:border-burgundy"
            />
            <button
              type="submit"
              disabled={enriching || !website.trim()}
              className="px-4 py-2 bg-burgundy text-white rounded-[100px] text-sm font-semibold hover:bg-burgundy-dark transition-colors disabled:opacity-50"
              data-testid="step0-enrich-cta"
            >
              {enriching
                ? t('onboarding.step0.enriching', 'Reading website…')
                : t('onboarding.step0.enrichCta', 'Read website')}
            </button>
          </form>
          {enrichError && (
            <p className="text-sm text-red-700" data-testid="step0-enrich-error">{enrichError}</p>
          )}
        </div>
      )}

      {/* SKIP — always available */}
      <div className="pt-2 border-t border-glass-border-dark">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-stone underline underline-offset-2 hover:text-deep-charcoal transition-colors"
          data-testid="step0-skip"
        >
          {t('onboarding.step0.skipCta', "Skip — I'll fill it in manually")}
        </button>
      </div>
    </div>
  );
}
