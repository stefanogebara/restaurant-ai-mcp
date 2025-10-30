/**
 * Step 1: Welcome & Restaurant Info
 *
 * Collects basic restaurant information:
 * - Restaurant name
 * - Restaurant type
 * - Location (city, country)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';

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
        <p className="text-purple-200 text-sm">Let's start with the basics</p>
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
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm"
        />
        {errors.restaurant_name && (
          <p className="mt-1 text-sm text-red-300">{errors.restaurant_name}</p>
        )}
      </div>

      {/* Restaurant Type */}
      <div>
        <label htmlFor="restaurant_type" className="block text-sm font-semibold text-white mb-2">
          What type of restaurant? *
        </label>
        <select
          id="restaurant_type"
          value={data.restaurant_type}
          onChange={(e) => updateData({ restaurant_type: e.target.value })}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm appearance-none cursor-pointer"
        >
          <option value="" className="bg-gray-900">Select a type...</option>
          {RESTAURANT_TYPES.map((type) => (
            <option key={type} value={type} className="bg-gray-900">
              {type}
            </option>
          ))}
        </select>
        {errors.restaurant_type && (
          <p className="mt-1 text-sm text-red-300">{errors.restaurant_type}</p>
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
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm"
          />
          {errors.city && (
            <p className="mt-1 text-sm text-red-300">{errors.city}</p>
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
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm"
          />
          {errors.country && (
            <p className="mt-1 text-sm text-red-300">{errors.country}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 text-gray-900 font-bold rounded-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
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
