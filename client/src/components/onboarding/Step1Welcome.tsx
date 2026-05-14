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
import { useTranslation } from 'react-i18next';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import { LocationSelector } from './LocationSelector';
import { getCountryByCode } from '../../data/countries';
import ThiingsIcon from '../common/ThiingsIcon';

const RESTAURANT_TYPES = [
  { value: 'fine-dining', label: 'Fine Dining' },
  { value: 'casual-dining', label: 'Casual Dining' },
  { value: 'fast-casual', label: 'Fast Casual' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'bar', label: 'Bar' },
  { value: 'bistro', label: 'Bistro' },
  { value: 'pizzeria', label: 'Pizzeria' },
  { value: 'steakhouse', label: 'Steakhouse' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'other', label: 'Other' },
];

/**
 * Human-readable name for a BCP-47 language code, localized to the active UI
 * language. Falls back to the raw code if Intl.DisplayNames can't resolve it.
 */
function languageDisplayName(code: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

export default function Step1Welcome({ data, updateData, onNext, isDemoLoading }: OnboardingStepProps & { isDemoLoading?: boolean }) {
  const { t, i18n } = useTranslation();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.restaurant_name.trim()) {
      newErrors.restaurant_name = t('onboarding.restaurantNameRequired');
    }
    if (!data.restaurant_type) {
      newErrors.restaurant_type = t('onboarding.restaurantTypeRequired');
    }
    if (!data.country_code || !data.country.trim()) {
      newErrors.country = t('onboarding.countryRequired');
    }
    if (!data.city.trim()) {
      newErrors.city = t('onboarding.cityRequired');
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
    if (errors.country) setErrors((prev) => ({ ...prev, country: '' }));
  };

  const handleCityChange = (city: string) => {
    updateData({ city });
    if (errors.city) setErrors((prev) => ({ ...prev, city: '' }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">{t('onboarding.step1Heading')}</h2>
        <p className="text-stone-gray text-sm">{t('onboarding.step1Subtitle')}</p>
        {isDemoLoading && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-stone">
            <div className="w-3 h-3 border border-muted-stone border-t-transparent rounded-full animate-spin" />
            {t('onboarding.loadingDemoData')}
          </div>
        )}
      </div>

      {/* Restaurant Name */}
      <div>
        <label htmlFor="restaurant_name" className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.restaurantNameLabel')}
        </label>
        <input
          id="restaurant_name"
          type="text"
          value={data.restaurant_name}
          onChange={(e) => updateData({ restaurant_name: e.target.value })}
          onFocus={() => setErrors((prev) => ({ ...prev, restaurant_name: '' }))}
          onBlur={(e) => { if (!e.target.value.trim()) setErrors((prev) => ({ ...prev, restaurant_name: t('onboarding.restaurantNameRequired') })); }}
          placeholder={t('onboarding.restaurantNamePlaceholder')}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
        {errors.restaurant_name && (
          <p className="mt-1 text-sm text-burgundy">{errors.restaurant_name}</p>
        )}
      </div>

      {/* Restaurant Type - Card Selection */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">
          {t('onboarding.restaurantTypeLabel')}
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RESTAURANT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => updateData({ restaurant_type: value })}
              className={`
                p-4 rounded-2xl border-2 transition-all duration-200 text-center font-semibold text-sm
                ${data.restaurant_type === value
                  ? 'border-burgundy bg-burgundy/10 text-burgundy'
                  : 'border-border-gray bg-white text-stone-gray hover:border-burgundy/50 hover:bg-warm-white'
                }
              `}
            >
              {t(`onboarding.restaurantTypes.${value}`, label)}
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
              <ThiingsIcon name="check" pxSize={20} className="text-burgundy" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-charcoal">
                {t('onboarding.languageAutoSet')}
              </p>
              <p className="text-xs text-stone-gray">
                {t('onboarding.languageBasedOnCountry')} <span className="text-burgundy font-medium">{languageDisplayName(data.language, i18n.language)}</span>
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
          {t('onboarding.continue')}
          <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
