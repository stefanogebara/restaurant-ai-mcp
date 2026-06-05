import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { trackDemoStarted } from '../../lib/analytics';

interface ScrapedData {
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number;
  cuisine_type: string;
  website: string | null;
  google_maps_url: string | null;
  editorial_summary: string | null;
  business_hours: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }> | null;
  hours_text: string[] | null;
  top_reviews: Array<{ text: string; rating: number; author: string }>;
}

interface DemoSetupFormProps {
  onSubmit: (data: {
    restaurant_name: string;
    city: string;
    contact_email: string;
    scraped_data: ScrapedData | null;
  }) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const inputBase = 'w-full px-4 py-3.5 border border-glass-border-input rounded-xl text-sm text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" fill={i < full ? 'currentColor' : (i === full && hasHalf ? 'url(#half)' : 'none')} stroke="currentColor" strokeWidth="1">
          <defs><linearGradient id="half"><stop offset="50%" stopColor="currentColor" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function DemoSetupForm({ onSubmit, isSubmitting, submitError }: DemoSetupFormProps) {
  const { t } = useTranslation();

  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ScrapedData[] | null>(null);
  const [selectedResult, setSelectedResult] = useState<ScrapedData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const canSearch = restaurantName.trim().length >= 2 && city.trim().length >= 2;

  async function handleSearch() {
    if (!canSearch) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);
    setSelectedResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/scrape-restaurant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: restaurantName.trim(), city: city.trim() }),
      });
      const data = await res.json().catch(() => null);
      // A 200 + { success:false } from the scrape API was previously rendered
      // as "no exact match" — silent search failure on a conversion-critical
      // form. Treat both !res.ok and explicit {success:false} as failures.
      if (!res.ok || data?.success === false) {
        setSearchError(data?.error || t('landing.demoSetup.form.searchFailed', 'Search failed'));
        return;
      }
      setSearchResults(data?.results || []);
      // Auto-select first result
      if (data?.results?.length === 1) {
        setSelectedResult(data.results[0]);
      }
    } catch (err) {
      // Surface network errors to Sentry — the previous empty catch hid
      // population-wide scrape outages from ops.
      console.error('[DemoSetupForm] search failed', err);
      setSearchError(t('landing.demoSetup.form.networkError', 'Network error. Please try again.'));
    } finally {
      setIsSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Gate on isSearching (not !searchResults) so the user can hit Enter to
    // re-search after a zero-result attempt. The previous version locked
    // keyboard-search after any first search, even an empty one.
    if (e.key === 'Enter' && canSearch && !isSearching) {
      e.preventDefault();
      handleSearch();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    trackDemoStarted({ source: 'setup_form' });
    onSubmit({
      restaurant_name: selectedResult?.name || restaurantName.trim(),
      city: city.trim(),
      contact_email: email.trim(),
      scraped_data: selectedResult,
    });
  }

  function handleSkipSearch() {
    setSearchResults([]);
    setSelectedResult(null);
    setSearchError(null);
  }

  const showResults = searchResults !== null;
  const showEmailStep = showResults;

  return (
    <form onSubmit={handleSubmit} className="bg-warm-white border border-border-gray rounded-[2rem] p-8 sm:p-10 space-y-6">
      {/* Step 1: Find your restaurant */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-muted-stone mb-4">
          {t('landing.demoSetup.form.findYourRestaurant', 'Find your restaurant')}
        </p>
        <div className="space-y-3">
          <div>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => { setRestaurantName(e.target.value); setSearchResults(null); setSelectedResult(null); }}
              onKeyDown={handleKeyDown}
              placeholder={t('landing.demoSetup.form.restaurantNameSearch', 'Restaurant name')}
              className={inputBase}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-[1fr,auto] gap-3">
            <input
              type="text"
              value={city}
              onChange={(e) => { setCity(e.target.value); setSearchResults(null); setSelectedResult(null); }}
              onKeyDown={handleKeyDown}
              placeholder={t('landing.demoSetup.form.city', 'City')}
              className={inputBase}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch || isSearching}
              className="px-6 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSearching ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {t('landing.demoSetup.form.searching', 'Searching...')}
                </span>
              ) : (
                t('landing.demoSetup.form.findIt', 'Find it')
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Search error */}
      {searchError && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          {searchError}
          <button type="button" onClick={handleSkipSearch} className="ml-2 underline text-amber-900 font-medium">
            {t('landing.demoSetup.form.continueWithout', 'Continue without search')}
          </button>
        </motion.div>
      )}

      {/* Search results */}
      <AnimatePresence>
        {searchResults && searchResults.length > 0 && !selectedResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <p className="text-xs text-muted-stone">{t('landing.demoSetup.form.selectYourRestaurant', 'Select your restaurant:')}</p>
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedResult(result)}
                className="w-full text-left p-4 border border-border-gray rounded-xl hover:border-burgundy hover:bg-burgundy/[3%] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-deep-charcoal truncate">{result.name}</p>
                    {result.address && <p className="text-xs text-stone-gray mt-0.5 truncate">{result.address}</p>}
                    {result.cuisine_type && <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wider text-burgundy bg-burgundy/[6%] px-2 py-0.5 rounded-full">{result.cuisine_type}</span>}
                  </div>
                  {result.rating && (
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        <StarRating rating={result.rating} />
                        <span className="text-sm font-semibold text-deep-charcoal">{result.rating}</span>
                      </div>
                      {result.review_count > 0 && (
                        <p className="text-[10px] text-muted-stone mt-0.5">{result.review_count.toLocaleString()} {t('landing.demoSetup.form.reviews', 'reviews')}</p>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
            <button type="button" onClick={handleSkipSearch} className="text-xs text-muted-stone hover:text-stone-gray transition-colors underline">
              {t('landing.demoSetup.form.notListed', 'Not listed? Continue manually')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected restaurant preview */}
      <AnimatePresence>
        {selectedResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-rose-200 bg-rose-50/50 rounded-xl p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-deep-charcoal">{selectedResult.name}</p>
                {selectedResult.address && <p className="text-xs text-stone-gray mt-0.5">{selectedResult.address}</p>}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedResult(null); setSearchResults(null); }}
                className="text-xs text-muted-stone hover:text-stone-gray underline flex-shrink-0"
              >
                {t('landing.demoSetup.form.change', 'Change')}
              </button>
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {selectedResult.rating && (
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-border-gray">
                  <StarRating rating={selectedResult.rating} />
                  <span className="font-semibold">{selectedResult.rating}</span>
                  {selectedResult.review_count > 0 && <span className="text-muted-stone">({selectedResult.review_count.toLocaleString()})</span>}
                </div>
              )}
              {selectedResult.cuisine_type && (
                <div className="bg-white px-3 py-1.5 rounded-lg border border-border-gray font-medium text-burgundy">
                  {selectedResult.cuisine_type}
                </div>
              )}
              {selectedResult.phone && (
                <div className="bg-white px-3 py-1.5 rounded-lg border border-border-gray text-stone-gray">
                  {selectedResult.phone}
                </div>
              )}
            </div>

            {selectedResult.hours_text && selectedResult.hours_text.length > 0 && (
              <details className="mt-3">
                <summary className="text-[11px] font-medium text-stone-gray cursor-pointer hover:text-deep-charcoal transition-colors">
                  {t('landing.demoSetup.form.businessHours', 'Business hours')}
                </summary>
                <ul className="mt-1.5 text-[11px] text-stone-gray space-y-0.5 pl-1">
                  {selectedResult.hours_text.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            )}

            {selectedResult.editorial_summary && (
              <p className="mt-3 text-xs text-stone-gray italic leading-relaxed">
                "{selectedResult.editorial_summary}"
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No results message */}
      {searchResults && searchResults.length === 0 && !selectedResult && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4">
          <p className="text-sm text-stone-gray">{t('landing.demoSetup.form.noExactMatch', "No exact match found — we'll set up your demo with the details you provided.")}</p>
        </motion.div>
      )}

      {/* Step 2: Email (shown after search) */}
      <AnimatePresence>
        {showEmailStep && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="h-px bg-border-gray mb-6" />
            <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-muted-stone mb-3">
              {t('landing.demoSetup.form.almostThere', 'Almost there')}
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('landing.demoSetup.form.emailPlaceholder', 'Your work email')}
              className={inputBase}
            />
            <p className="text-[10px] text-muted-stone mt-1.5 ml-1">{t('landing.demoSetup.form.emailHint', "We'll send your demo link here")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit error */}
      {submitError && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm">
          {submitError}
        </motion.div>
      )}

      {/* Submit button */}
      {showEmailStep && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button
            type="submit"
            disabled={isSubmitting || !email.trim()}
            className={`w-full flex items-center justify-center gap-3 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-[16px] font-semibold rounded-full transition-all duration-200 ${isSubmitting || !email.trim() ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" aria-hidden="true" />
                <span>{t('landing.demoSetup.form.creatingDemo', 'Creating your demo...')}</span>
              </>
            ) : (
              <span>{t('landing.demoSetup.form.launchDemo', 'Launch my demo')}</span>
            )}
          </button>
          <p className="text-center text-xs text-muted-stone font-light mt-3">{t('landing.demoSetup.form.noCreditCard')}</p>
        </motion.div>
      )}
    </form>
  );
}
