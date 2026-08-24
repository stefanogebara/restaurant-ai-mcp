import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { GlassPanel } from '../common/glass/Glass';
import { trackDemoStarted, trackDemoFunnel } from '../../lib/analytics';

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

/** Respostas do caminho "restaurante novo" (F4) — sem Google, a recepcionista
 *  nasce do que o dono configurar aqui. */
export interface ManualSetupData {
  cuisine_type: string | null;
  open_time: string;
  close_time: string;
  vibe_tags: string[];
}

interface DemoSetupFormProps {
  onSubmit: (data: {
    restaurant_name: string;
    city: string;
    scraped_data: ScrapedData | null;
    manual?: ManualSetupData;
  }) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const inputBase = 'w-full px-4 py-3.5 border border-glass-border-input rounded-xl text-sm text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';

/**
 * Idioma da interface → idioma que o Google Places aceita.
 * i18next devolve coisas como 'pt', 'pt-BR', 'en-US'; a API quer a etiqueta
 * exata. Qualquer coisa desconhecida cai em português, que é o mercado.
 */
function idiomaDoPlaces(idiomaDaUI: string | undefined): string {
  const l = String(idiomaDaUI || '').toLowerCase();
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('es')) return 'es';
  return 'pt-BR';
}

/**
 * Tipo de cozinha vem do Google como enum em inglês ('Brazilian', 'Italian') e
 * é gravado assim — o valor guardado é normalizado contra um enum do banco, e
 * traduzir na origem quebraria isso. Então a tradução é só de exibição.
 */
const COZINHA_PT: Record<string, string> = {
  Brazilian: 'Brasileira', Italian: 'Italiana', Japanese: 'Japonesa',
  Mexican: 'Mexicana', Steakhouse: 'Churrascaria', Chinese: 'Chinesa',
  Indian: 'Indiana', Thai: 'Tailandesa', French: 'Francesa',
  Spanish: 'Espanhola', Korean: 'Coreana', Vietnamese: 'Vietnamita',
  Greek: 'Grega', Mediterranean: 'Mediterrânea', Seafood: 'Frutos do mar',
  Pizza: 'Pizzaria', Bakery: 'Padaria', Cafe: 'Cafeteria', Bar: 'Bar',
};

function rotuloDeCozinha(cozinha: string, idiomaDaUI: string | undefined): string {
  if (!String(idiomaDaUI || '').toLowerCase().startsWith('pt')) return cozinha;
  return COZINHA_PT[cozinha] || cozinha;
}

/** Valores em EN — o backend normaliza contra o enum do banco (mesma regra do
 *  scraper); a tradução é só de exibição, via rotuloDeCozinha. */
const CUISINE_CHIPS = ['Brazilian', 'Italian', 'Japanese', 'Pizza', 'Steakhouse', 'Seafood', 'Bar', 'Cafe'];

/** Tags que o vibe-to-persona-preset do servidor sabe pontuar. */
const VIBE_CHIPS: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: 'romantic', labelKey: 'landing.demoSetup.form.vibes.romantic', fallback: 'Romântico' },
  { value: 'family-friendly', labelKey: 'landing.demoSetup.form.vibes.family', fallback: 'Familiar' },
  { value: 'casual', labelKey: 'landing.demoSetup.form.vibes.casual', fallback: 'Descontraído' },
  { value: 'upscale', labelKey: 'landing.demoSetup.form.vibes.upscale', fallback: 'Sofisticado' },
  { value: 'lively', labelKey: 'landing.demoSetup.form.vibes.lively', fallback: 'Animado' },
];

const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => `${String((i + 7) % 24).padStart(2, '0')}:00`);

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
  const { t, i18n } = useTranslation();

  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ScrapedData[] | null>(null);
  const [selectedResult, setSelectedResult] = useState<ScrapedData | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Caminho "restaurante novo" (F4) — tudo opcional, com defaults sensatos:
  // o dono pode só apertar o botão e ajustar depois, dentro do demo.
  const [manualCuisine, setManualCuisine] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState('12:00');
  const [manualClose, setManualClose] = useState('23:00');
  const [manualVibes, setManualVibes] = useState<string[]>([]);

  const toggleVibe = (v: string) =>
    setManualVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

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
        // O idioma da interface manda no idioma dos dados do Google. Sem isto o
        // backend usava inglês fixo e o dono brasileiro via os horários do
        // próprio restaurante como "Monday: 12:00 – 10:00 PM" numa página que
        // acabou de prometer os "dados reais" dele.
        body: JSON.stringify({
          query: restaurantName.trim(),
          city: city.trim(),
          lang: idiomaDoPlaces(i18n.language),
        }),
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
      // NEVER auto-select — not even a single result. Google's Text Search
      // fuzzy-matches aggressively: "Cantinho da Vó Zilda, Pres. Prudente"
      // (nonexistent) returned "Empório Quintal da Vovó" (a real, different
      // restaurant) as its one result, and auto-selecting presented someone
      // else's business as the owner's. Selection is always an explicit tap.
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

  // Two exits, no email gate: confirming a Google match, or going manual
  // ("meu restaurante é novo / não está no Google"). Contact capture happens
  // AFTER the aha, inside the demo, via /api/demo/attach-contact.
  function submitDemo(scrape: ScrapedData | null) {
    if (isSubmitting) return;
    trackDemoStarted({ source: 'setup_form' });
    trackDemoFunnel({ step: scrape ? 'match_confirmed' : 'new_restaurant_path' });
    onSubmit({
      restaurant_name: scrape?.name || restaurantName.trim(),
      city: city.trim(),
      scraped_data: scrape,
      manual: scrape
        ? undefined
        : {
            cuisine_type: manualCuisine,
            open_time: manualOpen,
            close_time: manualClose,
            vibe_tags: manualVibes,
          },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The form's only submit control lives inside the confirmation card, so
    // Enter/submit without a selected result is a no-op by design.
    if (selectedResult) submitDemo(selectedResult);
  }

  function handleSkipSearch() {
    setSearchResults([]);
    setSelectedResult(null);
    setSearchError(null);
  }

  return (
    <GlassPanel as="form" onSubmit={handleSubmit} className="p-7 sm:p-9 space-y-6">
      {/* Step 1: Find your restaurant */}
      <div>
        <p className="text-[13px] font-medium text-muted-stone mb-3">
          {t('landing.demoSetup.form.findYourRestaurant', 'Ache o seu restaurante')}
        </p>
        <div className="space-y-3">
          <div>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => { setRestaurantName(e.target.value); setSearchResults(null); setSelectedResult(null); }}
              onKeyDown={handleKeyDown}
              placeholder={t('landing.demoSetup.form.restaurantNameSearch', 'Nome do restaurante')}
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
              placeholder={t('landing.demoSetup.form.city', 'Cidade')}
              className={inputBase}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch || isSearching}
              className="px-6 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSearching ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {t('landing.demoSetup.form.searching', 'Buscando…')}
                </span>
              ) : (
                t('landing.demoSetup.form.findIt', 'Buscar')
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
            <p className="text-xs text-muted-stone">{t('landing.demoSetup.form.selectYourRestaurant', 'Escolha o seu:')}</p>
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedResult(result)}
                className="w-full text-left p-4 border border-glass-border-dark rounded-xl hover:border-burgundy hover:bg-burgundy/[3%] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-deep-charcoal truncate">{result.name}</p>
                    {result.address && <p className="text-xs text-stone-gray mt-0.5 truncate">{result.address}</p>}
                    {result.cuisine_type && <span className="inline-block mt-1 text-[11px] font-medium text-burgundy bg-burgundy/[6%] px-2 py-0.5 rounded-[46px]">{rotuloDeCozinha(result.cuisine_type, i18n.language)}</span>}
                  </div>
                  {result.rating && (
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        <StarRating rating={result.rating} />
                        <span className="text-sm font-semibold text-deep-charcoal">{result.rating}</span>
                      </div>
                      {result.review_count > 0 && (
                        <p className="text-[10px] text-muted-stone mt-0.5 tabular-nums">{result.review_count.toLocaleString('pt-BR')} {t('landing.demoSetup.form.reviews', 'avaliações')}</p>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
            <button type="button" onClick={handleSkipSearch} className="text-xs text-muted-stone hover:text-stone-gray transition-colors underline">
              {t('landing.demoSetup.form.notListed', 'Não achou? Continuar manualmente')}
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
            className="glass-card p-5"
          >
            <p className="text-[13px] font-semibold text-burgundy mb-2.5">
              {t('landing.demoSetup.form.isThisYours', 'É este o seu restaurante?')}
            </p>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-deep-charcoal">{selectedResult.name}</p>
                {selectedResult.address && <p className="text-xs text-stone-gray mt-0.5">{selectedResult.address}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  trackDemoFunnel({ step: 'match_rejected' });
                  setSelectedResult(null);
                  setSearchResults(null);
                }}
                className="text-xs text-muted-stone hover:text-stone-gray underline flex-shrink-0"
              >
                {t('landing.demoSetup.form.notMine', 'Não, trocar')}
              </button>
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {selectedResult.rating && (
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-glass-border-dark">
                  <StarRating rating={selectedResult.rating} />
                  <span className="font-semibold">{selectedResult.rating}</span>
                  {selectedResult.review_count > 0 && <span className="text-muted-stone">({selectedResult.review_count.toLocaleString()})</span>}
                </div>
              )}
              {selectedResult.cuisine_type && (
                <div className="bg-white px-3 py-1.5 rounded-lg border border-glass-border-dark font-medium text-burgundy">
                  {rotuloDeCozinha(selectedResult.cuisine_type, i18n.language)}
                </div>
              )}
              {selectedResult.phone && (
                <div className="bg-white px-3 py-1.5 rounded-lg border border-glass-border-dark text-stone-gray">
                  {selectedResult.phone}
                </div>
              )}
            </div>

            {selectedResult.hours_text && selectedResult.hours_text.length > 0 && (
              <details className="mt-3">
                <summary className="text-[11px] font-medium text-stone-gray cursor-pointer hover:text-deep-charcoal transition-colors">
                  {t('landing.demoSetup.form.businessHours', 'Horário de funcionamento')}
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

            {/* Confirmation — the only way in. No email, no extra step. */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`mt-4 w-full flex items-center justify-center gap-3 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-[16px] font-semibold rounded-full transition-colors duration-200 ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" aria-hidden="true" />
                  <span>{t('landing.demoSetup.form.creatingDemo', 'Montando seu painel…')}</span>
                </>
              ) : (
                <span>{t('landing.demoSetup.form.confirmMine', 'Sim, é esse — criar meu demo')}</span>
              )}
            </button>
            <p className="text-center text-xs text-muted-stone mt-3">{t('landing.demoSetup.form.noCreditCard', 'Sem cartão de crédito.')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Caminho "restaurante novo" (F4): sem Google, sem match — três toques
          opcionais e a recepcionista nasce configurada pelo dono. */}
      {searchResults && searchResults.length === 0 && !selectedResult && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-2 space-y-5">
          <div className="text-center">
            <p className="text-[15px] font-semibold text-deep-charcoal">
              {t('landing.demoSetup.form.manualHeading', 'Restaurante novo? Melhor ainda.')}
            </p>
            <p className="text-sm text-stone-gray mt-1">
              {t('landing.demoSetup.form.manualSub', 'Sua recepcionista pode existir antes do seu Google. Três toques e ela está pronta — tudo opcional:')}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-stone mb-2">{t('landing.demoSetup.form.qCuisine', 'Cozinha')}</p>
            <div className="flex flex-wrap gap-2">
              {CUISINE_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setManualCuisine(manualCuisine === c ? null : c)}
                  aria-pressed={manualCuisine === c}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${manualCuisine === c ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-stone-gray border-glass-border-dark hover:border-burgundy'}`}
                >
                  {rotuloDeCozinha(c, i18n.language)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-stone mb-2">{t('landing.demoSetup.form.qHours', 'Horário')}</p>
            <div className="flex items-center gap-2">
              <select
                value={manualOpen}
                onChange={(e) => setManualOpen(e.target.value)}
                aria-label={t('landing.demoSetup.form.qHoursOpen', 'Abre às')}
                className="px-3 py-2 border border-glass-border-input rounded-xl text-sm bg-white"
              >
                {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-sm text-muted-stone">{t('landing.demoSetup.form.hoursTo', 'às')}</span>
              <select
                value={manualClose}
                onChange={(e) => setManualClose(e.target.value)}
                aria-label={t('landing.demoSetup.form.qHoursClose', 'Fecha às')}
                className="px-3 py-2 border border-glass-border-input rounded-xl text-sm bg-white"
              >
                {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-stone mb-2">{t('landing.demoSetup.form.qVibe', 'Clima')}</p>
            <div className="flex flex-wrap gap-2">
              {VIBE_CHIPS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => toggleVibe(v.value)}
                  aria-pressed={manualVibes.includes(v.value)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${manualVibes.includes(v.value) ? 'bg-burgundy text-white border-burgundy' : 'bg-white text-stone-gray border-glass-border-dark hover:border-burgundy'}`}
                >
                  {t(v.labelKey, v.fallback)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => submitDemo(null)}
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-3 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-[16px] font-semibold rounded-full transition-colors duration-200 ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" aria-hidden="true" />
                <span>{t('landing.demoSetup.form.creatingDemo', 'Montando seu painel…')}</span>
              </>
            ) : (
              <span>{t('landing.demoSetup.form.launchManual', 'Criar minha recepcionista')}</span>
            )}
          </button>
          <p className="text-center text-xs text-muted-stone">{t('landing.demoSetup.form.noCreditCard', 'Sem cartão de crédito.')}</p>
        </motion.div>
      )}

      {/* Submit error */}
      {submitError && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm">
          {submitError}
        </motion.div>
      )}
    </GlassPanel>
  );
}
