/**
 * Step 1: Welcome & Restaurant Info
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
import '../../landing/styles/glass-morphism.css';

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
        <h2 className="text-2xl font-bold text-white mb-2">What's your restaurant called?</h2>
        <p className="text-gray-300 text-sm">Let's start with the basics</p>
      </div>

      {/* Restaurant Name */}
      <div>
        <label htmlFor="restaurant_name" className="block text-sm font-semibold text-gray-100 mb-2">
          Restaurant Name *
        </label>
        <input
          id="restaurant_name"
          type="text"
          value={data.restaurant_name}
          onChange={(e) => updateData({ restaurant_name: e.target.value })}
          placeholder="La Bella Vista"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        />
        {errors.restaurant_name && (
          <p className="mt-1 text-sm text-red-400">{errors.restaurant_name}</p>
        )}
      </div>

      {/* Restaurant Type - Card Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-100 mb-3">
          What type of restaurant? *
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RESTAURANT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updateData({ restaurant_type: type })}
              className={`
                p-4 rounded-lg border-2 transition-all duration-200 text-center font-semibold text-sm
                ${data.restaurant_type === type
                  ? 'border-violet-500 bg-violet-500/20 text-gray-100 shadow-lg shadow-violet-500/20 scale-105'
                  : 'border-gray-700 bg-gray-800/30 text-gray-300 hover:border-gray-600 hover:bg-gray-800/50 hover:text-gray-100'
                }
              `}
            >
              {type}
            </button>
          ))}
        </div>
        {errors.restaurant_type && (
          <p className="mt-2 text-sm text-red-400">{errors.restaurant_type}</p>
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
        <div className="bg-violet-500/10 backdrop-blur-md rounded-xl p-4 border border-violet-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">
                Language automatically set
              </p>
              <p className="text-xs text-gray-400">
                Based on your country selection: <span className="text-violet-400 font-medium">{data.language}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-purple-500/30 transition-all duration-300 hover:scale-105 active:scale-95"
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
