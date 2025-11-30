/**
 * Step 2: Contact & Business Hours
 *
 * Collects contact information and operating hours:
 * - Phone number
 * - Email
 * - Website (optional)
 * - Service type selection (breakfast, lunch, dinner)
 * - Business hours with multi-period support
 * - Average dining duration
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import '../../landing/styles/glass-morphism.css';

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
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('lunch_dinner');
  const [useMultiplePeriods, setUseMultiplePeriods] = useState(false);

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
    if (validate() && onNext) {
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

  const updateDayHours = (index: number, field: string, value: any) => {
    const updatedHours = [...data.business_hours];
    updatedHours[index] = { ...updatedHours[index], [field]: value };
    updateData({ business_hours: updatedHours });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">How can customers reach you?</h2>
        <p className="text-gray-300 text-sm">Contact information and operating hours</p>
      </div>

      {/* Phone Number */}
      <div>
        <label htmlFor="phone_number" className="block text-sm font-semibold text-gray-100 mb-2">
          Restaurant Phone Number *
        </label>
        <input
          id="phone_number"
          type="tel"
          value={data.phone_number}
          onChange={(e) => updateData({ phone_number: e.target.value })}
          placeholder="+34 639 67 29 63"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        />
        <p className="mt-1 text-xs text-gray-400">This will be your AI assistant's number</p>
        {errors.phone_number && (
          <p className="mt-1 text-sm text-red-400">{errors.phone_number}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-gray-100 mb-2">
          Business Email *
        </label>
        <input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          placeholder="contact@restaurant.com"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-400">{errors.email}</p>
        )}
      </div>

      {/* Website (Optional) */}
      <div>
        <label htmlFor="website" className="block text-sm font-semibold text-gray-100 mb-2">
          Website (Optional)
        </label>
        <input
          id="website"
          type="url"
          value={data.website || ''}
          onChange={(e) => updateData({ website: e.target.value })}
          placeholder="https://yourrestaurant.com"
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Service Type Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-100 mb-3">
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
                  p-3 rounded-lg border-2 text-left transition-all
                  ${isSelected
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{preset.icon}</span>
                  <span className="text-sm font-semibold text-gray-100">{preset.label}</span>
                </div>
                <p className="text-xs text-gray-400">{preset.description}</p>
              </button>
            );
          })}
        </div>

        {/* Multi-period info banner */}
        {useMultiplePeriods && (
          <div className="mb-4 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-violet-400">ℹ️</span>
              <div>
                <p className="text-sm text-violet-300 font-medium">Split Service Hours</p>
                <p className="text-xs text-gray-400 mt-1">
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
          <label className="block text-sm font-semibold text-gray-100">Business Hours *</label>
          <button
            type="button"
            onClick={copyHoursToAll}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md transition-colors"
          >
            Copy Monday to all days
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {data.business_hours.map((day, index) => (
            <div key={day.day} className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
              <div className="w-24">
                <span className="text-gray-100 font-medium text-sm">{day.day}</span>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={day.is_open}
                  onChange={(e) => updateDayHours(index, 'is_open', e.target.checked)}
                  className="w-4 h-4 text-violet-500 bg-gray-800 border-gray-600 rounded focus:ring-2 focus:ring-violet-400"
                />
                <span className="ml-2 text-gray-100 text-sm">Open</span>
              </label>
              {day.is_open && (
                <>
                  <input
                    type="time"
                    value={day.open_time}
                    onChange={(e) => updateDayHours(index, 'open_time', e.target.value)}
                    className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <span className="text-gray-100 text-sm">to</span>
                  <input
                    type="time"
                    value={day.close_time}
                    onChange={(e) => updateDayHours(index, 'close_time', e.target.value)}
                    className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </>
              )}
            </div>
          ))}
        </div>

        {/* Service periods summary */}
        {selectedServiceType === 'lunch_dinner' && (
          <div className="mt-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Service Periods (based on first open day):</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                Lunch: 12:00 - 15:30
              </span>
              <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                Break: 15:30 - 19:00
              </span>
              <span className="px-2 py-1 text-xs bg-violet-500/20 text-violet-400 rounded">
                Dinner: 19:00 - 23:00
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Average Dining Duration */}
      <div>
        <label htmlFor="average_dining_duration" className="block text-sm font-semibold text-gray-100 mb-2">
          Average Dining Duration (minutes)
        </label>
        <select
          id="average_dining_duration"
          value={data.average_dining_duration}
          onChange={(e) => updateData({ average_dining_duration: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        >
          <option value={60} className="bg-gray-900">60 minutes (Fast dining)</option>
          <option value={90} className="bg-gray-900">90 minutes (Standard)</option>
          <option value={120} className="bg-gray-900">120 minutes (Fine dining)</option>
          <option value={150} className="bg-gray-900">150 minutes (Extended dining)</option>
        </select>
        <p className="mt-1 text-xs text-gray-400">Used to estimate table turnover</p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-gray-100 font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
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
