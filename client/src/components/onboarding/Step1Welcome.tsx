/**
 * Step 1: Welcome & Restaurant Info
 *
 * Collects basic restaurant information:
 * - Restaurant name
 * - Restaurant type
 * - Location (city, country)
 * - Preferred language
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import LanguageSelector from '../common/LanguageSelector';
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
    if (!data.city.trim()) {
      newErrors.city = 'City is required';
    }
    if (!data.country.trim()) {
      newErrors.country = 'Country is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate() && onNext) {
      onNext();
    }
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
        <label htmlFor="restaurant_name" className="block text-sm font-semibold text-white mb-2">
          Restaurant Name *
        </label>
        <input
          id="restaurant_name"
          type="text"
          value={data.restaurant_name}
          onChange={(e) => updateData({ restaurant_name: e.target.value })}
          placeholder="La Bella Vista"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
        />
        {errors.restaurant_name && (
          <p className="mt-1 text-sm text-red-400">{errors.restaurant_name}</p>
        )}
      </div>

      {/* Restaurant Type - Card Selection */}
      <div>
        <label className="block text-sm font-semibold text-white mb-3">
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
                  ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/20 scale-105'
                  : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40 hover:bg-white/10 hover:text-white'
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

      {/* Location */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="city" className="block text-sm font-semibold text-white mb-2">
            City *
          </label>
          <input
            id="city"
            type="text"
            value={data.city}
            onChange={(e) => updateData({ city: e.target.value })}
            placeholder="Madrid"
            className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
          />
          {errors.city && (
            <p className="mt-1 text-sm text-red-400">{errors.city}</p>
          )}
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-semibold text-white mb-2">
            Country *
          </label>
          <input
            id="country"
            type="text"
            value={data.country}
            onChange={(e) => updateData({ country: e.target.value })}
            placeholder="Spain"
            className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
          />
          {errors.country && (
            <p className="mt-1 text-sm text-red-400">{errors.country}</p>
          )}
        </div>
      </div>

      {/* Language Selection */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-1">
            Choose Your Language
          </h3>
          <p className="text-sm text-gray-300">
            Select the language for your dashboard and customer communications
          </p>
        </div>
        <div className="language-selector-onboarding">
          <LanguageSelector
            variant="buttons"
            size="md"
            showLabel={false}
            onLanguageChange={(lang) => {
              updateData({ language: lang });
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="glass-button-primary px-8 py-3 text-white font-bold rounded-lg flex items-center gap-2"
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
