import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../../utils/colors';
import ThiingsIcon from '../common/ThiingsIcon';
import {
  LANGUAGE_GROUPS,
  getCountryByCode,
  getCitiesByCountryCode,
  getLanguageByCountryCode,
  type Country,
  type City,
} from '../../data/countries';

interface LocationSelectorProps {
  selectedCountryCode?: string;
  selectedCity?: string;
  onCountryChange: (countryCode: string, languageCode: string) => void;
  onCityChange: (city: string) => void;
  error?: {
    country?: string;
    city?: string;
  };
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  selectedCountryCode,
  selectedCity,
  onCountryChange,
  onCityChange,
  error,
}) => {
  const { t, i18n } = useTranslation();
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isCityOpen, setIsCityOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  // Diacritic-insensitive lowercase (espana → matches España, brasil → matches Brasil).
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Localized country names via Intl.DisplayNames. The data file stores English
  // names ("Brazil", "Spain") but pt-BR/es users naturally type "Brasil"/"España".
  // Without this, search returns "no countries found" for the correct local name.
  const localizedCountryName = useMemo(() => {
    try {
      const display = new Intl.DisplayNames([i18n.language || 'en'], { type: 'region' });
      return (code: string) => display.of(code) || '';
    } catch {
      return () => '';
    }
  }, [i18n.language]);

  // Get selected country details
  const selectedCountry = useMemo(() => {
    return selectedCountryCode ? getCountryByCode(selectedCountryCode) : null;
  }, [selectedCountryCode]);

  // Get cities for selected country
  const availableCities = useMemo(() => {
    return selectedCountryCode ? getCitiesByCountryCode(selectedCountryCode) : [];
  }, [selectedCountryCode]);

  // Filter countries by search query — matches English name, language-group
  // display name, AND locale-translated name (so pt-BR users typing "Brasil"
  // and es users typing "España" / "Espana" both hit).
  const filteredLanguageGroups = useMemo(() => {
    if (!countrySearchQuery.trim()) return LANGUAGE_GROUPS;

    const query = normalize(countrySearchQuery);
    return LANGUAGE_GROUPS.map(group => ({
      ...group,
      countries: group.countries.filter(country =>
        normalize(country.name).includes(query) ||
        normalize(group.displayName).includes(query) ||
        normalize(localizedCountryName(country.code)).includes(query)
      ),
    })).filter(group => group.countries.length > 0);
  }, [countrySearchQuery, localizedCountryName]);

  // Filter cities by search query (diacritic-insensitive).
  const filteredCities = useMemo(() => {
    if (!citySearchQuery.trim()) return availableCities;

    const query = normalize(citySearchQuery);
    return availableCities.filter(city =>
      normalize(city.name).includes(query) ||
      (city.region && normalize(city.region).includes(query))
    );
  }, [citySearchQuery, availableCities]);

  // Handle country selection
  const handleCountrySelect = (country: Country) => {
    const languageCode = getLanguageByCountryCode(country.code);
    if (languageCode) {
      onCountryChange(country.code, languageCode);
    }
    // Clear city selection when country changes
    onCityChange('');
    setIsCountryOpen(false);
    setCountrySearchQuery('');
  };

  // Handle city selection
  const handleCitySelect = (city: City) => {
    onCityChange(city.name);
    setIsCityOpen(false);
    setCitySearchQuery('');
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.location-selector-dropdown')) {
        setIsCountryOpen(false);
        setIsCityOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-4">
      {/* Country Selector */}
      <div className="relative location-selector-dropdown">
        <label className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.country')} *
        </label>
        <button
          type="button"
          onClick={() => setIsCountryOpen(!isCountryOpen)}
          className={`w-full px-4 py-3 rounded-xl bg-soft-gray border ${
            error?.country
              ? 'border-burgundy focus:border-burgundy'
              : 'border-border-gray focus:border-burgundy'
          } text-left text-deep-charcoal flex items-center justify-between hover:bg-border-gray/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-burgundy`}
        >
          <div className="flex items-center gap-3">
            <ThiingsIcon name="globe" pxSize={20} />
            {selectedCountry ? (
              <span className="flex items-center gap-2">
                <span className="text-xl">{selectedCountry.flag}</span>
                <span>{selectedCountry.name}</span>
              </span>
            ) : (
              <span className="text-muted-stone">{t('onboarding.selectCountry')}</span>
            )}
          </div>
          <span className={`inline-flex transition-transform duration-200 ${isCountryOpen ? 'rotate-180' : ''}`}>
            <ThiingsIcon name="chevron-down" pxSize={20} />
          </span>
        </button>

        {error?.country && (
          <p className="mt-1 text-sm text-burgundy">{error.country}</p>
        )}

        {/* Country Dropdown */}
        {isCountryOpen && (
          <div className="absolute z-50 w-full mt-2 rounded-xl bg-white border border-border-gray shadow-xl max-h-96 overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-border-gray">
              <input
                type="text"
                placeholder={t('onboarding.searchCountries')}
                value={countrySearchQuery}
                onChange={(e) => setCountrySearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-soft-gray border border-border-gray text-deep-charcoal placeholder-muted-stone focus:outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy transition-colors"
                autoFocus
              />
            </div>

            {/* Countries List */}
            <div className="overflow-y-auto max-h-80 custom-scrollbar">
              {filteredLanguageGroups.length === 0 ? (
                <div className="p-4 text-center text-stone-gray">
                  {t('onboarding.noCountriesFound')}
                </div>
              ) : (
                filteredLanguageGroups.map((group) => (
                  <div key={group.language} className="border-b border-border-gray last:border-0">
                    {/* Language Group Header */}
                    <div className="px-4 py-2 bg-soft-gray">
                      <span className="text-xs font-semibold text-stone-gray uppercase tracking-wider flex items-center gap-2">
                        <span className="text-base">{group.flag}</span>
                        {group.displayName}
                      </span>
                    </div>

                    {/* Countries in Group */}
                    {group.countries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={`w-full px-4 py-3 text-left hover:bg-soft-gray transition-colors flex items-center gap-3 ${
                          selectedCountryCode === country.code
                            ? 'bg-burgundy/10 text-burgundy'
                            : 'text-deep-charcoal'
                        }`}
                      >
                        <span className="text-xl">{country.flag}</span>
                        <span>{country.name}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* City Selector */}
      <div className="relative location-selector-dropdown">
        <label className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.city')} *
        </label>
        <button
          type="button"
          onClick={() => {
            if (selectedCountryCode) {
              setIsCityOpen(!isCityOpen);
            }
          }}
          disabled={!selectedCountryCode}
          className={`w-full px-4 py-3 rounded-xl bg-soft-gray border ${
            !selectedCountryCode
              ? 'border-border-gray cursor-not-allowed opacity-50'
              : error?.city
              ? 'border-burgundy focus:border-burgundy'
              : 'border-border-gray focus:border-burgundy'
          } text-left text-deep-charcoal flex items-center justify-between hover:bg-border-gray/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-burgundy ${
            !selectedCountryCode ? 'hover:bg-soft-gray' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <ThiingsIcon name="map-pin" pxSize={20} />
            {selectedCity ? (
              <span>{selectedCity}</span>
            ) : (
              <span className="text-muted-stone">
                {selectedCountryCode ? t('onboarding.selectCity') : t('onboarding.selectCountryFirst')}
              </span>
            )}
          </div>
          <span className={`inline-flex transition-transform duration-200 ${isCityOpen ? 'rotate-180' : ''}`}>
            <ThiingsIcon name="chevron-down" pxSize={20} />
          </span>
        </button>

        {error?.city && (
          <p className="mt-1 text-sm text-burgundy">{error.city}</p>
        )}

        {/* City Dropdown */}
        {isCityOpen && selectedCountryCode && (
          <div className="absolute z-50 w-full mt-2 rounded-xl bg-white border border-border-gray shadow-xl max-h-96 overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-border-gray">
              <input
                type="text"
                placeholder={t('onboarding.searchCities')}
                value={citySearchQuery}
                onChange={(e) => setCitySearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-soft-gray border border-border-gray text-deep-charcoal placeholder-muted-stone focus:outline-none focus:border-burgundy focus:ring-2 focus:ring-burgundy transition-colors"
                autoFocus
              />
            </div>

            {/* Cities List */}
            <div className="overflow-y-auto max-h-80 custom-scrollbar">
              {filteredCities.length === 0 ? (
                <div className="p-4 text-center text-stone-gray">
                  {t('onboarding.noCitiesFound')}
                </div>
              ) : (
                filteredCities.map((city, index) => (
                  <button
                    key={`${city.name}-${index}`}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={`w-full px-4 py-3 text-left hover:bg-soft-gray transition-colors ${
                      selectedCity === city.name
                        ? 'bg-burgundy/10 text-burgundy'
                        : 'text-deep-charcoal'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{city.name}</span>
                      {city.region && (
                        <span className="text-xs text-stone-gray mt-0.5">
                          {city.region}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: ${colors.softGray};
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(159, 18, 57, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(159, 18, 57, 0.5);
        }
      `}</style>
    </div>
  );
};
