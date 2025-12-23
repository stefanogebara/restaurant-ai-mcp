/**
 * Step 4: Reservation Settings - Modern Elegant Design
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

const CANCELLATION_POLICIES = [
  'Free cancellation up to 2 hours before reservation',
  'Free cancellation up to 24 hours before reservation',
  'Free cancellation up to 48 hours before reservation',
  'No cancellations allowed',
  'Custom policy',
];

export default function Step4Settings({ data, updateData, onNext, onBack }: OnboardingStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCustomPolicy, setIsCustomPolicy] = useState(
    !CANCELLATION_POLICIES.slice(0, -1).includes(data.cancellation_policy)
  );

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
        <h2 className="font-serif text-2xl font-bold text-[#1C1917] mb-2">Reservation preferences</h2>
        <p className="text-[#57534E] text-sm">Set your booking rules and policies</p>
      </div>

      {/* Advance Booking Days */}
      <div>
        <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-[#1C1917] mb-2">
          How far in advance can customers book?
        </label>
        <select
          id="advance_booking_days"
          value={data.advance_booking_days}
          onChange={(e) => updateData({ advance_booking_days: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days (Recommended)</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Buffer Time */}
      <div>
        <label htmlFor="buffer_time" className="block text-sm font-semibold text-[#1C1917] mb-2">
          How much time between reservations?
        </label>
        <select
          id="buffer_time"
          value={data.buffer_time}
          onChange={(e) => updateData({ buffer_time: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
        >
          <option value={0}>0 minutes (No buffer)</option>
          <option value={15}>15 minutes (Recommended)</option>
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
        <p className="mt-1 text-xs text-[#57534E]">Buffer time to clean tables between parties</p>
      </div>

      {/* Cancellation Policy */}
      <div>
        <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-[#1C1917] mb-2">
          Cancellation Policy
        </label>
        <select
          id="cancellation_policy"
          value={isCustomPolicy ? 'Custom policy' : data.cancellation_policy}
          onChange={(e) => {
            const selectedValue = e.target.value;
            if (selectedValue === 'Custom policy') {
              setIsCustomPolicy(true);
              updateData({ cancellation_policy: '' });
            } else {
              setIsCustomPolicy(false);
              updateData({ cancellation_policy: selectedValue });
            }
          }}
          className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
        >
          {CANCELLATION_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {policy}
            </option>
          ))}
        </select>
        {errors.cancellation_policy && (
          <p className="mt-1 text-sm text-[#9F1239]">{errors.cancellation_policy}</p>
        )}
      </div>

      {/* Custom Cancellation Policy Input */}
      {isCustomPolicy && (
        <div>
          <label htmlFor="custom_policy" className="block text-sm font-semibold text-[#1C1917] mb-2">
            Enter your custom cancellation policy
          </label>
          <textarea
            id="custom_policy"
            rows={3}
            value={data.cancellation_policy}
            onChange={(e) => updateData({ cancellation_policy: e.target.value })}
            placeholder="Example: Full refund if cancelled 24 hours before. 50% refund if cancelled within 24 hours."
            className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] resize-none focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
          />
        </div>
      )}

      {/* Special Notes */}
      <div>
        <label htmlFor="special_notes" className="block text-sm font-semibold text-[#1C1917] mb-2">
          Special Notes (Optional)
        </label>
        <textarea
          id="special_notes"
          rows={3}
          value={data.special_notes || ''}
          onChange={(e) => updateData({ special_notes: e.target.value })}
          placeholder="Example: Vegan options available, outdoor seating seasonal, live music on weekends"
          className="w-full px-4 py-3 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] resize-none focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:border-transparent transition-all"
        />
        <p className="mt-1 text-xs text-[#57534E]">
          This will be shown to customers when they make reservations
        </p>
      </div>

      {/* Preview Card */}
      <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <svg className="w-6 h-6 text-[#9F1239] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-[#1C1917] font-semibold text-sm mb-2">Preview: What customers will see</p>
            <div className="space-y-1 text-[#57534E] text-sm">
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
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-8 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300"
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
