/**
 * Voice filter bar with gender toggle pills, language dropdown, and search input.
 */

import { useState, useEffect, useRef } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import { SUPPORTED_LANGUAGES } from './voiceConstants';
import type { VoiceFiltersState } from './voiceTypes';

interface VoiceFiltersProps {
  filters: VoiceFiltersState;
  onChange: (filters: VoiceFiltersState) => void;
  defaultLanguage?: string;
  hideSearch?: boolean;
}

const GENDER_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'male' as const, label: 'Male' },
  { value: 'female' as const, label: 'Female' },
];

export default function VoiceFilters({ filters, onChange, defaultLanguage = 'en', hideSearch = false }: VoiceFiltersProps) {
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
  }, [searchInput]);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
      {/* Gender Toggle Pills */}
      <div className="flex rounded-lg border border-[#E7E5E4] overflow-hidden">
        {GENDER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ ...filters, gender: opt.value })}
            className={`
              px-4 py-2 text-sm font-medium transition-colors
              ${filters.gender === opt.value
                ? 'bg-[#9F1239] text-white'
                : 'bg-white text-[#57534E] hover:bg-[#F5F5F4]'
              }
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Language Dropdown */}
      <select
        value={filters.language || defaultLanguage}
        onChange={(e) => onChange({ ...filters, language: e.target.value })}
        className="px-3 py-2 text-sm border border-[#E7E5E4] rounded-lg bg-white text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/50"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>

      {/* Search Input (hidden when using own_voices fallback since search doesn't work with that API) */}
      {!hideSearch && (
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]">
            <ThiingsIcon name="search" pxSize={16} />
          </span>
          <input
            type="text"
            placeholder="Search voices..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E7E5E4] rounded-lg bg-white text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/50"
          />
        </div>
      )}
    </div>
  );
}
