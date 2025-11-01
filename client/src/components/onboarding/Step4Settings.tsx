/**
 * Step 4: Reservation Settings
 *
 * Collects reservation preferences:
 * - Advance booking window (how far ahead can customers book)
 * - Buffer time between reservations
 * - Cancellation policy
 * - Special notes
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { OnboardingStepProps } from '../../types/onboarding.types';
import '../../landing/styles/glass-morphism.css';

const CANCELLATION_POLICIES = [
  'Free cancellation up to 2 hours before reservation',
  'Free cancellation up to 24 hours before reservation',
  'Free cancellation up to 48 hours before reservation',
  'No cancellations allowed',
  'Custom policy',
];

export default function Step4Settings({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.cancellation_policy.trim()) {
      newErrors.cancellation_policy = 'Cancellation policy is required';
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
        <h2 className="text-2xl font-bold text-white mb-2">Reservation preferences</h2>
        <p className="text-gray-300 text-sm">Set your booking rules and policies</p>
      </div>

      {/* Advance Booking Days */}
      <div>
        <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-white mb-2">
          How far in advance can customers book?
        </label>
        <select
          id="advance_booking_days"
          value={data.advance_booking_days}
          onChange={(e) => updateData({ advance_booking_days: parseInt(e.target.value) })}
          className="glass-input w-full px-4 py-3 text-white appearance-none cursor-pointer"
        >
          <option value={7} className="bg-gray-900">7 days</option>
          <option value={14} className="bg-gray-900">14 days</option>
          <option value={30} className="bg-gray-900">30 days (Recommended)</option>
          <option value={60} className="bg-gray-900">60 days</option>
          <option value={90} className="bg-gray-900">90 days</option>
        </select>
      </div>

      {/* Buffer Time */}
      <div>
        <label htmlFor="buffer_time" className="block text-sm font-semibold text-white mb-2">
          How much time between reservations?
        </label>
        <select
          id="buffer_time"
          value={data.buffer_time}
          onChange={(e) => updateData({ buffer_time: parseInt(e.target.value) })}
          className="glass-input w-full px-4 py-3 text-white appearance-none cursor-pointer"
        >
          <option value={0} className="bg-gray-900">0 minutes (No buffer)</option>
          <option value={15} className="bg-gray-900">15 minutes (Recommended)</option>
          <option value={30} className="bg-gray-900">30 minutes</option>
          <option value={45} className="bg-gray-900">45 minutes</option>
          <option value={60} className="bg-gray-900">60 minutes</option>
        </select>
        <p className="mt-1 text-xs text-gray-400">Buffer time to clean tables between parties</p>
      </div>

      {/* Cancellation Policy */}
      <div>
        <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-white mb-2">
          Cancellation Policy
        </label>
        <select
          id="cancellation_policy"
          value={data.cancellation_policy}
          onChange={(e) => updateData({ cancellation_policy: e.target.value })}
          className="glass-input w-full px-4 py-3 text-white appearance-none cursor-pointer"
        >
          {CANCELLATION_POLICIES.map((policy) => (
            <option key={policy} value={policy} className="bg-gray-900">
              {policy}
            </option>
          ))}
        </select>
        {errors.cancellation_policy && (
          <p className="mt-1 text-sm text-red-400">{errors.cancellation_policy}</p>
        )}
      </div>

      {/* Custom Cancellation Policy Input */}
      {data.cancellation_policy === 'Custom policy' && (
        <div>
          <label htmlFor="custom_policy" className="block text-sm font-semibold text-white mb-2">
            Enter your custom cancellation policy
          </label>
          <textarea
            id="custom_policy"
            rows={3}
            value={data.cancellation_policy === 'Custom policy' ? '' : data.cancellation_policy}
            onChange={(e) => updateData({ cancellation_policy: e.target.value })}
            placeholder="Example: Full refund if cancelled 24 hours before. 50% refund if cancelled within 24 hours."
            className="glass-input w-full px-4 py-3 text-white placeholder-gray-400 resize-none"
          />
        </div>
      )}

      {/* Special Notes */}
      <div>
        <label htmlFor="special_notes" className="block text-sm font-semibold text-white mb-2">
          Special Notes (Optional)
        </label>
        <textarea
          id="special_notes"
          rows={3}
          value={data.special_notes || ''}
          onChange={(e) => updateData({ special_notes: e.target.value })}
          placeholder="Example: Vegan options available, outdoor seating seasonal, live music on weekends"
          className="glass-input w-full px-4 py-3 text-white placeholder-gray-400 resize-none"
        />
        <p className="mt-1 text-xs text-gray-400">
          This will be shown to customers when they make reservations
        </p>
      </div>

      {/* Preview Card */}
      <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/30 rounded-lg p-5">
        <div className="flex items-start gap-3 mb-3">
          <svg className="w-6 h-6 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white font-semibold text-sm mb-2">Preview: What customers will see</p>
            <div className="space-y-1 text-gray-300 text-sm">
              <p>Book up to {data.advance_booking_days} days in advance</p>
              <p>{data.buffer_time} minute buffer between reservations</p>
              <p>{data.cancellation_policy}</p>
              {data.special_notes && <p>{data.special_notes}</p>}
            </div>
          </div>
        </div>
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
