import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CallFilter } from './callTrackingTypes';

interface Props {
  filter: CallFilter;
  onChange: (filter: CallFilter) => void;
}

export default function CallFilters({ filter, onChange }: Props) {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(filter.search || '');

  // Hold the latest filter in a ref so the debounced search merges into the
  // *freshest* filter. The previous version closed over `filter` from when the
  // effect ran — changing the period/outcome during the 300ms debounce window
  // would get silently reverted when the stale-closure timer fired.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (filterRef.current.search || '')) {
        onChange({ ...filterRef.current, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onChange]);

  const PERIOD_OPTIONS = [
    { value: '1d',  label: t('callTracking.twentyFourHours') },
    { value: '7d',  label: t('callTracking.sevenDays') },
    { value: '30d', label: t('callTracking.thirtyDays') },
    { value: '90d', label: t('callTracking.ninetyDays') },
  ] as const;

  return (
    <div className="border-b border-glass-border-dark">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-4">
        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('callTracking.searchPlaceholder', 'Search calls...')}
            aria-label={t('callTracking.searchPlaceholder', 'Search calls...')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal placeholder-muted-stone w-40 focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          />
        </div>

        {/* Period */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.period')}</span>
          <div className="flex gap-0">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange({ ...filter, period: opt.value })}
                className={`text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
                  filter.period === opt.value
                    ? 'text-deep-charcoal bg-soft-gray'
                    : 'text-muted-stone hover:text-stone-gray'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Outcome */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.outcome')}</span>
          <select
            aria-label={t('callTracking.outcome')}
            value={filter.outcome}
            onChange={(e) => onChange({ ...filter, outcome: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">{t('callTracking.outcomeAll')}</option>
            <option value="reservation_created">{t('callTracking.outcomeBooked')}</option>
            <option value="information_only">{t('callTracking.outcomeInfo')}</option>
            <option value="error">{t('callTracking.outcomeErrors')}</option>
            <option value="abandoned">{t('callTracking.outcomeAbandoned')}</option>
          </select>
        </div>

        {/* Sentiment */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.sentiment', 'Sentiment')}</span>
          <select
            aria-label={t('callTracking.sentiment', 'Sentiment')}
            value={filter.sentiment || 'all'}
            onChange={(e) => onChange({ ...filter, sentiment: e.target.value === 'all' ? undefined : e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">{t('callTracking.outcomeAll')}</option>
            <option value="positive">{t('callTracking.sentimentPositive', 'Positive')}</option>
            <option value="neutral">{t('callTracking.sentimentNeutral', 'Neutral')}</option>
            <option value="negative">{t('callTracking.sentimentNegative', 'Negative')}</option>
          </select>
        </div>

        {/* Language */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-stone">{t('callTracking.language')}</span>
          <select
            aria-label={t('callTracking.language')}
            value={filter.language}
            onChange={(e) => onChange({ ...filter, language: e.target.value })}
            className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          >
            <option value="all">{t('callTracking.outcomeAll')}</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
          </select>
        </div>
      </div>
    </div>
  );
}
