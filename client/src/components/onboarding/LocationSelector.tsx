import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, MapPin, Globe } from 'lucide-react';
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
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [isCityOpen, setIsCityOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  // Get selected country details
  const selectedCountry = useMemo(() => {
    return selectedCountryCode ? getCountryByCode(selectedCountryCode) : null;
  }, [selectedCountryCode]);

  // Get cities for selected country
  const availableCities = useMemo(() => {
    return selectedCountryCode ? getCitiesByCountryCode(selectedCountryCode) : [];
  }, [selectedCountryCode]);

  // Filter countries by search query
  const filteredLanguageGroups = useMemo(() => {
    if (!countrySearchQuery.trim()) return LANGUAGE_GROUPS;

    const query = countrySearchQuery.toLowerCase();
    return LANGUAGE_GROUPS.map(group => ({
      ...group,
      countries: group.countries.filter(country =>
        country.name.toLowerCase().includes(query) ||
        group.displayName.toLowerCase().includes(query)
      ),
    })).filter(group => group.countries.length > 0);
  }, [countrySearchQuery]);

  // Filter cities by search query
  const filteredCities = useMemo(() => {
    if (!citySearchQuery.trim()) return availableCities;

    const query = citySearchQuery.toLowerCase();
    return availableCities.filter(city =>
      city.name.toLowerCase().includes(query) ||
      (city.region && city.region.toLowerCase().includes(query))
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
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Country *
        </label>
        <button
          type="button"
          onClick={() => setIsCountryOpen(!isCountryOpen)}
          className={`w-full px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border ${
            error?.country
              ? 'border-red-500/50 focus:border-red-500'
              : 'border-white/10 focus:border-[#8b5cf6]'
          } text-left text-white flex items-center justify-between hover:bg-white/10 transition-all duration-200`}
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-gray-400" />
            {selectedCountry ? (
              <span className="flex items-center gap-2">
                <span className="text-xl">{selectedCountry.flag}</span>
                <span>{selectedCountry.name}</span>
              </span>
            ) : (
              <span className="text-gray-400">Select your country</span>
            )}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
              isCountryOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {error?.country && (
          <p className="mt-1 text-sm text-red-400">{error.country}</p>
        )}

        {/* Country Dropdown */}
        {isCountryOpen && (
          <div className="absolute z-50 w-full mt-2 rounded-xl bg-[#1a1625]/95 backdrop-blur-xl border border-white/10 shadow-2xl max-h-96 overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-white/10">
              <input
                type="text"
                placeholder="Search countries..."
                value={countrySearchQuery}
                onChange={(e) => setCountrySearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                autoFocus
              />
            </div>

            {/* Countries List */}
            <div className="overflow-y-auto max-h-80 custom-scrollbar">
              {filteredLanguageGroups.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  No countries found
                </div>
              ) : (
                filteredLanguageGroups.map((group) => (
                  <div key={group.language} className="border-b border-white/5 last:border-0">
                    {/* Language Group Header */}
                    <div className="px-4 py-2 bg-white/5">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
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
                        className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-3 ${
                          selectedCountryCode === country.code
                            ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]'
                            : 'text-white'
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
        <label className="block text-sm font-medium text-gray-300 mb-2">
          City *
        </label>
        <button
          type="button"
          onClick={() => {
            if (selectedCountryCode) {
              setIsCityOpen(!isCityOpen);
            }
          }}
          disabled={!selectedCountryCode}
          className={`w-full px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border ${
            !selectedCountryCode
              ? 'border-white/5 cursor-not-allowed opacity-50'
              : error?.city
              ? 'border-red-500/50 focus:border-red-500'
              : 'border-white/10 focus:border-[#8b5cf6]'
          } text-left text-white flex items-center justify-between hover:bg-white/10 transition-all duration-200 ${
            !selectedCountryCode ? 'hover:bg-white/5' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            {selectedCity ? (
              <span>{selectedCity}</span>
            ) : (
              <span className="text-gray-400">
                {selectedCountryCode ? 'Select your city' : 'Select country first'}
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
              isCityOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {error?.city && (
          <p className="mt-1 text-sm text-red-400">{error.city}</p>
        )}

        {/* City Dropdown */}
        {isCityOpen && selectedCountryCode && (
          <div className="absolute z-50 w-full mt-2 rounded-xl bg-[#1a1625]/95 backdrop-blur-xl border border-white/10 shadow-2xl max-h-96 overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-white/10">
              <input
                type="text"
                placeholder="Search cities..."
                value={citySearchQuery}
                onChange={(e) => setCitySearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:border-[#8b5cf6] transition-colors"
                autoFocus
              />
            </div>

            {/* Cities List */}
            <div className="overflow-y-auto max-h-80 custom-scrollbar">
              {filteredCities.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  No cities found
                </div>
              ) : (
                filteredCities.map((city, index) => (
                  <button
                    key={`${city.name}-${index}`}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors ${
                      selectedCity === city.name
                        ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]'
                        : 'text-white'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{city.name}</span>
                      {city.region && (
                        <span className="text-xs text-gray-400 mt-0.5">
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
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
};
