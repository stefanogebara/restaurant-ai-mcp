/**
 * Step 2: Contact & Business Hours - Modern Elegant Design
 *
 * Collects contact information and operating hours:
 * - Phone number
 * - Email
 * - Website (optional)
 * - Service type selection (breakfast, lunch, dinner)
 * - Business hours with multi-period support
 * - Average dining duration
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import PhoneInput, { type CountryCode } from '../common/PhoneInput';
import ThiingsIcon from '../common/ThiingsIcon';

// Service type presets with recommended hours
// Labels/descriptions are i18n keys resolved at render time
const SERVICE_PRESETS = {
  breakfast_lunch: {
    labelKey: 'onboarding.serviceBreakfastLunch',
    icon: '🌅',
    descKey: 'onboarding.serviceBreakfastLunchDesc',
    defaultHours: { open: '07:00', close: '15:00' },
    periods: [{ open: '07:00', close: '15:00' }]
  },
  lunch_only: {
    labelKey: 'onboarding.serviceLunchOnly',
    icon: '☀️',
    descKey: 'onboarding.serviceLunchOnlyDesc',
    defaultHours: { open: '11:30', close: '15:30' },
    periods: [{ open: '11:30', close: '15:30' }]
  },
  lunch_dinner: {
    labelKey: 'onboarding.serviceLunchDinner',
    icon: '🍽️',
    descKey: 'onboarding.serviceLunchDinnerDesc',
    defaultHours: { open: '12:00', close: '23:00' },
    periods: [
      { open: '12:00', close: '15:30' },
      { open: '19:00', close: '23:00' }
    ]
  },
  dinner_only: {
    labelKey: 'onboarding.serviceDinnerOnly',
    icon: '🌙',
    descKey: 'onboarding.serviceDinnerOnlyDesc',
    defaultHours: { open: '18:00', close: '23:00' },
    periods: [{ open: '18:00', close: '23:00' }]
  },
  all_day: {
    labelKey: 'onboarding.serviceAllDay',
    icon: '🕐',
    descKey: 'onboarding.serviceAllDayDesc',
    defaultHours: { open: '08:00', close: '23:00' },
    periods: [{ open: '08:00', close: '23:00' }]
  },
  custom: {
    labelKey: 'onboarding.serviceCustom',
    icon: '⚙️',
    descKey: 'onboarding.serviceCustomDesc',
    defaultHours: { open: '12:00', close: '22:00' },
    periods: [{ open: '12:00', close: '22:00' }]
  }
};

type ServiceType = keyof typeof SERVICE_PRESETS;

const DAY_KEYS: Record<string, string> = {
  Monday: 'onboarding.dayMonday',
  Tuesday: 'onboarding.dayTuesday',
  Wednesday: 'onboarding.dayWednesday',
  Thursday: 'onboarding.dayThursday',
  Friday: 'onboarding.dayFriday',
  Saturday: 'onboarding.daySaturday',
  Sunday: 'onboarding.daySunday',
};

export default function Step2Contact({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hoursErrors, setHoursErrors] = useState<Record<string, string>>({});
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('lunch_dinner');
  const [useMultiplePeriods, setUseMultiplePeriods] = useState(false);

  const handlePhoneChange = useCallback((fullNumber: string, isValid: boolean) => {
    updateData({ phone_number: fullNumber });
    if (!isValid && fullNumber.length > 4) {
      setErrors((prev) => ({ ...prev, phone_number: t('onboarding.phoneInvalid') }));
    } else {
      setErrors((prev) => ({ ...prev, phone_number: '' }));
    }
  }, [updateData, t]);

  // Apply service preset when selected
  const applyServicePreset = (serviceType: ServiceType) => {
    setSelectedServiceType(serviceType);
    const preset = SERVICE_PRESETS[serviceType];

    // Determine if this preset uses multiple periods
    const hasMultiplePeriods = preset.periods.length > 1;
    setUseMultiplePeriods(hasMultiplePeriods);

    // Update all days with the preset hours
    const updatedHours = data.business_hours.map((day) => ({
      ...day,
      open_time: preset.defaultHours.open,
      close_time: preset.defaultHours.close,
      periods: preset.periods, // Store periods for multi-service restaurants
    }));
    updateData({ business_hours: updatedHours });
  };

  // Initialize with lunch_dinner preset on first render
  useEffect(() => {
    if (data.business_hours[0]?.open_time === '09:00') {
      applyServicePreset('lunch_dinner');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.phone_number.trim()) {
      newErrors.phone_number = t('onboarding.phoneRequired');
    } else if (!/^\+\d{7,14}$/.test(data.phone_number.replace(/\s/g, ''))) {
      newErrors.phone_number = t('onboarding.phoneInvalidFormat', 'Phone must start with + followed by 7-14 digits (E.164 format)');
    } else if (errors.phone_number) {
      newErrors.phone_number = errors.phone_number;
    }
    if (!data.email.trim()) {
      newErrors.email = t('onboarding.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(data.email)) {
      newErrors.email = t('onboarding.emailInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate() && Object.keys(hoursErrors).length === 0 && onNext) {
      onNext();
    }
  };

  const copyHoursToAll = () => {
    const firstDay = data.business_hours[0];
    const updatedHours = data.business_hours.map((day) => ({
      ...day,
      is_open: firstDay.is_open,
      open_time: firstDay.open_time,
      close_time: firstDay.close_time,
    }));
    updateData({ business_hours: updatedHours });
  };

  const updateDayHours = (index: number, field: string, value: string | boolean) => {
    const updatedHours = [...data.business_hours];
    const updatedDay = { ...updatedHours[index], [field]: value };
    updatedHours[index] = updatedDay;
    updateData({ business_hours: updatedHours });

    if (field === 'close_time' && typeof value === 'string') {
      if (value <= updatedDay.open_time) {
        setHoursErrors(prev => ({ ...prev, [updatedDay.day]: t('onboarding.closingAfterOpening') }));
      } else {
        setHoursErrors(prev => { const next = { ...prev }; delete next[updatedDay.day]; return next; });
      }
    }
    if (field === 'open_time' && typeof value === 'string') {
      if (updatedDay.close_time <= value) {
        setHoursErrors(prev => ({ ...prev, [updatedDay.day]: t('onboarding.closingAfterOpening') }));
      } else {
        setHoursErrors(prev => { const next = { ...prev }; delete next[updatedDay.day]; return next; });
      }
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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">{t('onboarding.step2Heading')}</h2>
        <p className="text-stone-gray text-sm">{t('onboarding.step2Subtitle')}</p>
      </div>

      {/* Phone Number with Country Code */}
      <PhoneInput
        value={data.phone_number}
        onChange={handlePhoneChange}
        defaultCountry={(data.country_code?.toUpperCase() || 'ES') as CountryCode}
        label={t('onboarding.restaurantPhoneLabel')}
        required
        error={errors.phone_number}
      />

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.businessEmailLabel')}
        </label>
        <input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          onFocus={() => setErrors((prev) => ({ ...prev, email: '' }))}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (!val) {
              setErrors((prev) => ({ ...prev, email: t('onboarding.emailRequired') }));
            } else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(val)) {
              setErrors((prev) => ({ ...prev, email: t('onboarding.emailInvalid') }));
            }
          }}
          placeholder="contact@restaurant.com"
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-burgundy">{errors.email}</p>
        )}
      </div>

      {/* Website (Optional) */}
      <div>
        <label htmlFor="website" className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.websiteLabel')}
        </label>
        <input
          id="website"
          type="url"
          value={data.website || ''}
          onChange={(e) => updateData({ website: e.target.value })}
          placeholder={t('onboarding.websitePlaceholder')}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
      </div>

      {/* Service Type Selection */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">
          {t('onboarding.serviceTypeLabel')}
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {(Object.keys(SERVICE_PRESETS) as ServiceType[]).map((type) => {
            const preset = SERVICE_PRESETS[type];
            const isSelected = selectedServiceType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => applyServicePreset(type)}
                className={`
                  p-3 rounded-2xl border-2 text-left transition-all
                  ${isSelected
                    ? 'border-burgundy bg-burgundy/5'
                    : 'border-border-gray bg-white hover:border-burgundy/50'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{preset.icon}</span>
                  <span className="text-sm font-semibold text-deep-charcoal">{t(preset.labelKey)}</span>
                </div>
                <p className="text-xs text-stone-gray">{t(preset.descKey)}</p>
              </button>
            );
          })}
        </div>

        {/* Multi-period info banner */}
        {useMultiplePeriods && (
          <div className="mb-4 p-3 bg-burgundy/5 border border-burgundy/20 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-burgundy">ℹ️</span>
              <div>
                <p className="text-sm text-burgundy font-medium">{t('onboarding.splitServiceTitle')}</p>
                <p className="text-xs text-stone-gray mt-1">
                  {t('onboarding.splitServiceDesc')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Business Hours */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-deep-charcoal">{t('onboarding.businessHoursLabel')}</label>
          <button
            type="button"
            onClick={copyHoursToAll}
            className="text-xs text-burgundy hover:underline font-medium"
          >
            {t('onboarding.copyMondayToAll')}
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {data.business_hours.map((day, index) => (
            <div key={day.day}>
              <div className="flex flex-wrap items-center gap-3 p-3 bg-soft-gray rounded-xl border border-border-gray">
                <div className="w-20 sm:w-24">
                  <span className="text-deep-charcoal font-medium text-sm">{t(DAY_KEYS[day.day] || day.day)}</span>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(e) => updateDayHours(index, 'is_open', e.target.checked)}
                    className="w-4 h-4 text-burgundy bg-white border-border-gray rounded focus:ring-2 focus:ring-burgundy"
                  />
                  <span className="ml-2 text-deep-charcoal text-sm">{t('onboarding.open')}</span>
                </label>
                {day.is_open && (
                  <>
                    <input
                      type="time"
                      value={day.open_time}
                      onChange={(e) => updateDayHours(index, 'open_time', e.target.value)}
                      className="px-3 py-1.5 bg-white border border-border-gray rounded-xl text-deep-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-burgundy"
                    />
                    <span className="text-stone-gray text-sm">{t('onboarding.to')}</span>
                    <input
                      type="time"
                      value={day.close_time}
                      onChange={(e) => updateDayHours(index, 'close_time', e.target.value)}
                      className="px-3 py-1.5 bg-white border border-border-gray rounded-xl text-deep-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-burgundy"
                    />
                  </>
                )}
              </div>
              {hoursErrors[day.day] && (
                <p className="text-xs text-red-600 mt-1">{hoursErrors[day.day]}</p>
              )}
            </div>
          ))}
        </div>

        {/* Service periods summary */}
        {selectedServiceType === 'lunch_dinner' && (
          <div className="mt-3 p-3 bg-soft-gray rounded-xl border border-border-gray">
            <p className="text-xs text-stone-gray mb-2">{t('onboarding.servicePeriodsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 text-xs bg-burgundy/10 text-burgundy border border-burgundy/20 rounded-lg font-medium">
                {t('onboarding.lunch')}: 12:00 - 15:30
              </span>
              <span className="px-2 py-1 text-xs bg-soft-gray text-muted-stone border border-border-gray rounded-xl">
                {t('onboarding.break')}: 15:30 - 19:00
              </span>
              <span className="px-2 py-1 text-xs bg-burgundy/10 text-burgundy border border-burgundy/20 rounded-lg font-medium">
                {t('onboarding.dinner')}: 19:00 - 23:00
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Average Dining Duration */}
      <div>
        <label htmlFor="average_dining_duration" className="block text-sm font-semibold text-deep-charcoal mb-2">
          {t('onboarding.avgDiningDuration')}
        </label>
        <select
          id="average_dining_duration"
          value={data.average_dining_duration}
          onChange={(e) => updateData({ average_dining_duration: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        >
          <option value={60}>{t('onboarding.duration60')}</option>
          <option value={90}>{t('onboarding.duration90')}</option>
          <option value={120}>{t('onboarding.duration120')}</option>
          <option value={150}>{t('onboarding.duration150')}</option>
        </select>
        <p className="mt-1 text-xs text-stone-gray">{t('onboarding.durationHint')}</p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          {t('onboarding.back')}
        </button>
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
