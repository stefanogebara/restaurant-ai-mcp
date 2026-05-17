/**
 * Phone Input with Country Code Selector - Modern Elegant Design
 *
 * Features:
 * - Country code dropdown with flag emojis
 * - Auto-formats phone number based on country
 * - Validates phone number format per country
 * - Stores full international format (+XX XXXXXXXXX)
 */

import { useState, useEffect, useRef } from 'react';
import ThiingsIcon from './ThiingsIcon';

// Country data with dial codes and validation patterns
export const COUNTRIES = [
  // Europe
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸', pattern: /^[67]\d{8}$/, placeholder: '639 67 29 63', format: 'XXX XX XX XX' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷', pattern: /^[67]\d{8}$/, placeholder: '6 12 34 56 78', format: 'X XX XX XX XX' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪', pattern: /^1[567]\d{8,9}$/, placeholder: '151 12345678', format: 'XXX XXXXXXXX' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹', pattern: /^3\d{8,9}$/, placeholder: '312 345 6789', format: 'XXX XXX XXXX' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹', pattern: /^9[1236]\d{7}$/, placeholder: '912 345 678', format: 'XXX XXX XXX' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', pattern: /^7\d{9}$/, placeholder: '7911 123456', format: 'XXXX XXXXXX' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱', pattern: /^6\d{8}$/, placeholder: '612 345 678', format: 'X XX XXX XXX' },
  { code: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪', pattern: /^4\d{8}$/, placeholder: '470 12 34 56', format: 'XXX XX XX XX' },
  { code: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭', pattern: /^7[5-9]\d{7}$/, placeholder: '76 123 45 67', format: 'XX XXX XX XX' },
  { code: 'AT', name: 'Austria', dial: '+43', flag: '🇦🇹', pattern: /^6\d{8,11}$/, placeholder: '664 1234567', format: 'XXX XXXXXXX' },

  // Americas
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', pattern: /^[2-9]\d{9}$/, placeholder: '(555) 123-4567', format: '(XXX) XXX-XXXX' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦', pattern: /^[2-9]\d{9}$/, placeholder: '(555) 123-4567', format: '(XXX) XXX-XXXX' },
  { code: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽', pattern: /^[1-9]\d{9}$/, placeholder: '55 1234 5678', format: 'XX XXXX XXXX' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷', pattern: /^[1-9]\d{10}$/, placeholder: '11 91234-5678', format: 'XX XXXXX-XXXX' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷', pattern: /^9?\d{10}$/, placeholder: '11 1234-5678', format: 'XX XXXX-XXXX' },
  { code: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴', pattern: /^3\d{9}$/, placeholder: '301 234 5678', format: 'XXX XXX XXXX' },
  { code: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱', pattern: /^9\d{8}$/, placeholder: '9 1234 5678', format: 'X XXXX XXXX' },
  { code: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪', pattern: /^9\d{8}$/, placeholder: '912 345 678', format: 'XXX XXX XXX' },

  // Asia & Oceania
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵', pattern: /^[789]0\d{8}$/, placeholder: '90-1234-5678', format: 'XX-XXXX-XXXX' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳', pattern: /^1[3-9]\d{9}$/, placeholder: '138 1234 5678', format: 'XXX XXXX XXXX' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳', pattern: /^[6-9]\d{9}$/, placeholder: '98765 43210', format: 'XXXXX XXXXX' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺', pattern: /^4\d{8}$/, placeholder: '412 345 678', format: 'XXX XXX XXX' },
  { code: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿', pattern: /^2\d{7,9}$/, placeholder: '21 123 4567', format: 'XX XXX XXXX' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷', pattern: /^1[0-9]\d{7,8}$/, placeholder: '10-1234-5678', format: 'XX-XXXX-XXXX' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬', pattern: /^[89]\d{7}$/, placeholder: '8123 4567', format: 'XXXX XXXX' },
  { code: 'AE', name: 'UAE', dial: '+971', flag: '🇦🇪', pattern: /^5[0-9]\d{7}$/, placeholder: '50 123 4567', format: 'XX XXX XXXX' },

  // Africa
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦', pattern: /^[6-8]\d{8}$/, placeholder: '71 123 4567', format: 'XX XXX XXXX' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬', pattern: /^[789]\d{9}$/, placeholder: '801 234 5678', format: 'XXX XXX XXXX' },
  { code: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬', pattern: /^1[0-2]\d{8}$/, placeholder: '10 1234 5678', format: 'XX XXXX XXXX' },
  { code: 'MA', name: 'Morocco', dial: '+212', flag: '🇲🇦', pattern: /^[67]\d{8}$/, placeholder: '612 345 678', format: 'XXX XXX XXX' },
] as const;

export type CountryCode = typeof COUNTRIES[number]['code'];

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string, isValid: boolean) => void;
  defaultCountry?: CountryCode;
  error?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

export default function PhoneInput({
  value,
  onChange,
  defaultCountry = 'BR',
  error,
  label = 'Phone Number',
  required = false,
  className = '',
}: PhoneInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(
    COUNTRIES.find(c => c.code === defaultCountry) || COUNTRIES[0]
  );
  const [localNumber, setLocalNumber] = useState('');
  const [isValid, setIsValid] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse initial value if provided
  useEffect(() => {
    if (value) {
      // Try to extract country code from value
      const matchedCountry = COUNTRIES.find(c => value.startsWith(c.dial));
      if (matchedCountry) {
        setSelectedCountry(matchedCountry);
        setLocalNumber(value.slice(matchedCountry.dial.length).replace(/\s/g, '').trim());
      } else {
        // No country code, just use the number
        setLocalNumber(value.replace(/[^\d]/g, ''));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Validate and emit changes.
  // The per-country `pattern` regex is mobile-only by design (`^[1-9]\d{10}$`
  // for BR, `^3\d{8,9}$` for IT, etc.) — every restaurant with a landline
  // could not pass onboarding. Real-world audit: Mocotó's actual Google-Maps
  // number `+55 11 2951-3056` (São Paulo landline) was rejected.
  //
  // Accept any national-significant number with 7–15 digits (E.164 range).
  // Keep the strict regex only as a "preferred format" signal — the format
  // hint + placeholder still nudge users toward a mobile, but landlines now
  // proceed.
  useEffect(() => {
    const cleanNumber = localNumber.replace(/[^\d]/g, '');
    const validLength = cleanNumber.length >= 7 && cleanNumber.length <= 15;
    const valid = validLength;
    setIsValid(valid);

    // Emit full international number
    const fullNumber = cleanNumber ? `${selectedCountry.dial} ${cleanNumber}` : '';
    onChange(fullNumber, valid);
  }, [localNumber, selectedCountry, onChange]);

  const handleCountrySelect = (country: typeof COUNTRIES[number]) => {
    setSelectedCountry(country);
    setIsOpen(false);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const cleaned = e.target.value.replace(/[^\d]/g, '');
    setLocalNumber(cleaned);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-semibold text-deep-charcoal mb-2">
          {label} {required && <span className="text-burgundy">*</span>}
        </label>
      )}

      <div className="flex gap-2">
        {/* Country Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={`Country code: ${selectedCountry.name} ${selectedCountry.dial}`}
            className="flex items-center gap-2 px-3 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal hover:bg-border-gray/50 focus:outline-none focus:ring-2 focus:ring-burgundy transition-all min-w-[120px]"
          >
            <span className="text-xl">{selectedCountry.flag}</span>
            <span className="text-sm font-medium">{selectedCountry.dial}</span>
            <ThiingsIcon name="chevron-down" pxSize={16} className={`text-stone-gray transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 mt-1 w-64 max-h-64 overflow-y-auto bg-white border border-border-gray rounded-2xl shadow-xl">
              {COUNTRIES.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-soft-gray transition-colors ${
                    selectedCountry.code === country.code ? 'bg-burgundy/10' : ''
                  }`}
                >
                  <span className="text-xl">{country.flag}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-deep-charcoal truncate">{country.name}</span>
                  </div>
                  <span className="text-sm text-stone-gray">{country.dial}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phone Number Input */}
        <div className="flex-1 relative">
          <input
            type="tel"
            value={localNumber}
            onChange={handleNumberChange}
            placeholder={selectedCountry.placeholder}
            className={`w-full px-4 py-3 bg-soft-gray border rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all ${
              error ? 'border-burgundy' : localNumber && !isValid ? 'border-amber-600' : 'border-border-gray'
            }`}
          />
          {/* Validation indicator */}
          {localNumber && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValid ? (
                <ThiingsIcon name="check" pxSize={20} className="text-rose-600" />
              ) : (
                <ThiingsIcon name="alert-triangle" pxSize={20} className="text-amber-600" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Helper text */}
      <p className="mt-1 text-xs text-stone-gray">
        Format: {selectedCountry.dial} {selectedCountry.format}
      </p>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-burgundy">{error}</p>
      )}
      {localNumber && !isValid && !error && (
        <p className="mt-1 text-sm text-amber-600">
          {localNumber.replace(/[^\d]/g, '').length < 7
            ? 'Phone number too short — add the area code'
            : 'Phone number too long'}
        </p>
      )}
    </div>
  );
}
