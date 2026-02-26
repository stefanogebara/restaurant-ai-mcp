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

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import PhoneInput from '../common/PhoneInput';
import ThiingsIcon from '../common/ThiingsIcon';

// Service type presets with recommended hours
const SERVICE_PRESETS = {
  breakfast_lunch: {
    label: 'Breakfast & Lunch',
    icon: '🌅',
    description: 'Opens early, closes afternoon',
    defaultHours: { open: '07:00', close: '15:00' },
    periods: [{ open: '07:00', close: '15:00' }]
  },
  lunch_only: {
    label: 'Lunch Only',
    icon: '☀️',
    description: 'Lunch service only',
    defaultHours: { open: '11:30', close: '15:30' },
    periods: [{ open: '11:30', close: '15:30' }]
  },
  lunch_dinner: {
    label: 'Lunch & Dinner',
    icon: '🍽️',
    description: 'Classic two-service restaurant',
    defaultHours: { open: '12:00', close: '23:00' },
    periods: [
      { open: '12:00', close: '15:30' },
      { open: '19:00', close: '23:00' }
    ]
  },
  dinner_only: {
    label: 'Dinner Only',
    icon: '🌙',
    description: 'Evening service only',
    defaultHours: { open: '18:00', close: '23:00' },
    periods: [{ open: '18:00', close: '23:00' }]
  },
  all_day: {
    label: 'All Day',
    icon: '🕐',
    description: 'Continuous service all day',
    defaultHours: { open: '08:00', close: '23:00' },
    periods: [{ open: '08:00', close: '23:00' }]
  },
  custom: {
    label: 'Custom Hours',
    icon: '⚙️',
    description: 'Set your own schedule',
    defaultHours: { open: '12:00', close: '22:00' },
    periods: [{ open: '12:00', close: '22:00' }]
  }
};

type ServiceType = keyof typeof SERVICE_PRESETS;

export default function Step2Contact({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hoursErrors, setHoursErrors] = useState<Record<string, string>>({});
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('lunch_dinner');
  const [useMultiplePeriods, setUseMultiplePeriods] = useState(false);
  const phoneValidityRef = useRef(false);

  const handlePhoneChange = useCallback((fullNumber: string, isValid: boolean) => {
    updateData({ phone_number: fullNumber });
    phoneValidityRef.current = isValid;
  }, [updateData]);

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
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.phone_number.trim()) {
      newErrors.phone_number = 'Phone number is required';
    } else if (!phoneValidityRef.current) {
      newErrors.phone_number = 'Please enter a valid phone number';
    }
    if (!data.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = 'Invalid email format';
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
        setHoursErrors(prev => ({ ...prev, [updatedDay.day]: 'Closing time must be after opening time' }));
      } else {
        setHoursErrors(prev => { const next = { ...prev }; delete next[updatedDay.day]; return next; });
      }
    }
    if (field === 'open_time' && typeof value === 'string') {
      if (updatedDay.close_time <= value) {
        setHoursErrors(prev => ({ ...prev, [updatedDay.day]: 'Closing time must be after opening time' }));
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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">How can customers reach you?</h2>
        <p className="text-stone-gray text-sm">Set up your contact details and when your restaurant is open for service</p>
      </div>

      {/* Phone Number with Country Code */}
      <PhoneInput
        value={data.phone_number}
        onChange={handlePhoneChange}
        defaultCountry="ES"
        label="Restaurant Phone Number"
        required
        error={errors.phone_number}
      />

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-deep-charcoal mb-2">
          Business Email *
        </label>
        <input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
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
          Website (Optional)
        </label>
        <input
          id="website"
          type="url"
          value={data.website || ''}
          onChange={(e) => updateData({ website: e.target.value })}
          placeholder="https://yourrestaurant.com"
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
      </div>

      {/* Service Type Selection */}
      <div>
        <label className="block text-sm font-semibold text-deep-charcoal mb-3">
          What type of service does your restaurant offer?
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
                  <span className="text-sm font-semibold text-deep-charcoal">{preset.label}</span>
                </div>
                <p className="text-xs text-stone-gray">{preset.description}</p>
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
                <p className="text-sm text-burgundy font-medium">Split Service Hours</p>
                <p className="text-xs text-stone-gray mt-1">
                  Your restaurant has a break between lunch and dinner service.
                  The AI will know not to accept reservations during closed periods.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Business Hours */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-deep-charcoal">Business Hours *</label>
          <button
            type="button"
            onClick={copyHoursToAll}
            className="px-3 py-1 text-xs bg-soft-gray hover:bg-border-gray text-stone-gray rounded-xl transition-colors"
          >
            Copy Monday to all days
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {data.business_hours.map((day, index) => (
            <div key={day.day}>
              <div className="flex items-center gap-3 p-3 bg-soft-gray rounded-xl border border-border-gray">
                <div className="w-24">
                  <span className="text-deep-charcoal font-medium text-sm">{day.day}</span>
                </div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(e) => updateDayHours(index, 'is_open', e.target.checked)}
                    className="w-4 h-4 text-burgundy bg-white border-border-gray rounded focus:ring-2 focus:ring-burgundy"
                  />
                  <span className="ml-2 text-deep-charcoal text-sm">Open</span>
                </label>
                {day.is_open && (
                  <>
                    <input
                      type="time"
                      value={day.open_time}
                      onChange={(e) => updateDayHours(index, 'open_time', e.target.value)}
                      className="px-3 py-1.5 bg-white border border-border-gray rounded-xl text-deep-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-burgundy"
                    />
                    <span className="text-stone-gray text-sm">to</span>
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
            <p className="text-xs text-stone-gray mb-2">Service Periods (based on first open day):</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 text-xs bg-burgundy/10 text-burgundy border border-burgundy/20 rounded-lg font-medium">
                Lunch: 12:00 - 15:30
              </span>
              <span className="px-2 py-1 text-xs bg-soft-gray text-muted-stone border border-border-gray rounded-xl">
                Break: 15:30 - 19:00
              </span>
              <span className="px-2 py-1 text-xs bg-burgundy/10 text-burgundy border border-burgundy/20 rounded-lg font-medium">
                Dinner: 19:00 - 23:00
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Average Dining Duration */}
      <div>
        <label htmlFor="average_dining_duration" className="block text-sm font-semibold text-deep-charcoal mb-2">
          Average Dining Duration (minutes)
        </label>
        <select
          id="average_dining_duration"
          value={data.average_dining_duration}
          onChange={(e) => updateData({ average_dining_duration: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        >
          <option value={60}>60 minutes (Fast dining)</option>
          <option value={90}>90 minutes (Standard)</option>
          <option value={120}>120 minutes (Fine dining)</option>
          <option value={150}>150 minutes (Extended dining)</option>
        </select>
        <p className="mt-1 text-xs text-stone-gray">Helps the AI estimate table availability and turnover times</p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300"
        >
          Continue
          <ThiingsIcon name="chevron-right" pxSize={20} />
        </button>
      </div>
    </motion.div>
  );
}
