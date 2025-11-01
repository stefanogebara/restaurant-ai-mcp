/**
 * Step 2: Contact & Business Hours
 *
 * Collects contact information and operating hours:
 * - Phone number
 * - Email
 * - Website (optional)
 * - Business hours (7 days)
 * - Average dining duration
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import '../../landing/styles/glass-morphism.css';

export default function Step2Contact({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        <label htmlFor="phone_number" className="block text-sm font-semibold text-white mb-2">
          Restaurant Phone Number *
        </label>
        <input
          id="phone_number"
          type="tel"
          value={data.phone_number}
          onChange={(e) => updateData({ phone_number: e.target.value })}
          placeholder="+34 639 67 29 63"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
        />
        <p className="mt-1 text-xs text-gray-400">This will be your AI assistant's number</p>
        {errors.phone_number && (
          <p className="mt-1 text-sm text-red-400">{errors.phone_number}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-white mb-2">
          Business Email *
        </label>
        <input
          id="email"
          type="email"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          placeholder="contact@restaurant.com"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-400">{errors.email}</p>
        )}
      </div>

      {/* Website (Optional) */}
      <div>
        <label htmlFor="website" className="block text-sm font-semibold text-white mb-2">
          Website (Optional)
        </label>
        <input
          id="website"
          type="url"
          value={data.website || ''}
          onChange={(e) => updateData({ website: e.target.value })}
          placeholder="https://yourrestaurant.com"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400"
        />
      </div>

      {/* Business Hours */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-white">Business Hours *</label>
          <button
            type="button"
            onClick={copyHoursToAll}
            className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
          >
            Copy Monday to all days
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {data.business_hours.map((day, index) => (
            <div key={day.day} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="w-24">
                <span className="text-white font-medium text-sm">{day.day}</span>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={day.is_open}
                  onChange={(e) => updateDayHours(index, 'is_open', e.target.checked)}
                  className="w-4 h-4 text-indigo-500 bg-white/10 border-white/20 rounded focus:ring-2 focus:ring-indigo-400"
                />
                <span className="ml-2 text-white text-sm">Open</span>
              </label>
              {day.is_open && (
                <>
                  <input
                    type="time"
                    value={day.open_time}
                    onChange={(e) => updateDayHours(index, 'open_time', e.target.value)}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <span className="text-white text-sm">to</span>
                  <input
                    type="time"
                    value={day.close_time}
                    onChange={(e) => updateDayHours(index, 'close_time', e.target.value)}
                    className="px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Average Dining Duration */}
      <div>
        <label htmlFor="average_dining_duration" className="block text-sm font-semibold text-white mb-2">
          Average Dining Duration (minutes)
        </label>
        <select
          id="average_dining_duration"
          value={data.average_dining_duration}
          onChange={(e) => updateData({ average_dining_duration: parseInt(e.target.value) })}
          className="glass-input w-full px-4 py-3 text-white appearance-none cursor-pointer"
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
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
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
