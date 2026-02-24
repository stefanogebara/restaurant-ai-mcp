/**
 * Step 1: Welcome & Restaurant Info - Modern Elegant Design
 *
 * Collects basic restaurant information:
 * - Restaurant name
 * - Restaurant type
 * - Location (city, country) with smart location selector
 * - Auto-populated language based on country selection
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import { LocationSelector } from './LocationSelector';
import { getCountryByCode } from '../../data/countries';

const RESTAURANT_TYPES = [
  'Fine Dining',
  'Casual Dining',
  'Fast Casual',
  'Cafe',
  'Bar',
  'Bistro',
  'Pizzeria',
  'Steakhouse',
  'Seafood',
  'Other',
];

export default function Step1Welcome({ data, updateData, onNext }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.restaurant_name.trim()) {
      newErrors.restaurant_name = 'Restaurant name is required';
    }
    if (!data.restaurant_type) {
      newErrors.restaurant_type = 'Please select a restaurant type';
    }
    if (!data.country_code || !data.country.trim()) {
      newErrors.country = 'Country is required';
    }
    if (!data.city.trim()) {
      newErrors.city = 'City is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate() && onNext) {
      onNext();
    }
  };

  const handleCountryChange = (countryCode: string, languageCode: string) => {
    const country = getCountryByCode(countryCode);
    updateData({
      country_code: countryCode,
      country: country?.name || '',
      language: languageCode,
    });
  };

  const handleCityChange = (city: string) => {
    updateData({ city });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">What's your restaurant called?</h2>
        <p className="text-stone-gray text-sm">Tell us a bit about your restaurant to get started</p>
      </div>

      {/* Restaurant Name */}
      <div>
        <label htmlFor="restaurant_name" className="block text-sm font-semibold text-deep-charcoal mb-2">
          Restaurant Name *
        </label>
        <input
          id="restaurant_name"
          type="text"
          value={data.restaurant_name}
          onChange={(e) => updateData({ restaurant_name: e.target.value })}
          placeholder="e.g. La Bella Vista"
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
        {errors.restaurant_name && (
          <p className="mt-1 text-sm text-burgundy">{errors.restaurant_name}</p>
        )}
      </div>

      {/* Restaurant Type - Card Selection */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">
          What type of restaurant? *
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RESTAURANT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updateData({ restaurant_type: type })}
              className={`
                p-4 rounded-2xl border-2 transition-all duration-200 text-center font-semibold text-sm
                ${data.restaurant_type === type
                  ? 'border-burgundy bg-burgundy/10 text-burgundy'
                  : 'border-border-gray bg-white text-stone-gray hover:border-burgundy/50 hover:bg-warm-white'
                }
              `}
            >
              {type}
            </button>
          ))}
        </div>
        {errors.restaurant_type && (
          <p className="mt-2 text-sm text-burgundy">{errors.restaurant_type}</p>
        )}
      </div>

      {/* Location Selector */}
      <LocationSelector
        selectedCountryCode={data.country_code}
        selectedCity={data.city}
        onCountryChange={handleCountryChange}
        onCityChange={handleCityChange}
        error={{
          country: errors.country,
          city: errors.city,
        }}
      />

      {/* Auto-populated Language Info */}
      {data.language && (
        <div className="bg-burgundy/5 rounded-xl p-4 border border-burgundy/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-burgundy/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-charcoal">
                Language automatically set
              </p>
              <p className="text-xs text-stone-gray">
                Based on your country selection: <span className="text-burgundy font-medium">{data.language}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300"
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
