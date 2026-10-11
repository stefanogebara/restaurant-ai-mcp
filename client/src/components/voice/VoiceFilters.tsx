/**
 * Voice filter bar with gender toggle pills, language dropdown, and search input.
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { SUPPORTED_LANGUAGES } from './voiceConstants';
import type { VoiceFiltersState } from './voiceTypes';

interface VoiceFiltersProps {
  filters: VoiceFiltersState;
  onChange: (filters: VoiceFiltersState) => void;
  defaultLanguage?: string;
  hideSearch?: boolean;
}

export default function VoiceFilters({ filters, onChange, defaultLanguage = 'en', hideSearch = false }: VoiceFiltersProps) {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 font-brand sm:flex sm:flex-row sm:items-center">
      <select
        value={filters.gender}
        onChange={(e) => onChange({ ...filters, gender: e.target.value as VoiceFiltersState['gender'] })}
        aria-label={t('voice.filters.gender', 'Filter by gender')}
        className="min-h-11 min-w-0 w-full rounded-lg border border-brand-line bg-transparent px-3 text-sm text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
      >
        <option value="all">{t('voice.filters.all', 'All voices')}</option>
        <option value="male">{t('voice.filters.male', 'Male')}</option>
        <option value="female">{t('voice.filters.female', 'Female')}</option>
      </select>
      <select
        value={filters.language || defaultLanguage}
        onChange={(e) => onChange({ ...filters, language: e.target.value })}
        aria-label={t('voice.filters.language', 'Filter by language')}
        className="min-h-11 min-w-0 w-full rounded-lg border border-brand-line bg-transparent px-3 text-sm text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>

      {/* Search Input (hidden when using own_voices fallback since search doesn't work with that API) */}
      {!hideSearch && (
        <div className="relative col-span-2 min-w-0 flex-1 sm:col-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted">
            <ThiingsIcon name="search" pxSize={16} />
          </span>
          <input
            type="text"
            placeholder={t('voice.searchVoices', 'Search voices...')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-brand-line bg-transparent py-2 pl-9 pr-3 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
          />
        </div>
      )}
    </div>
  );
}
