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
import ThiingsIcon from '../common/ThiingsIcon';

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
        <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">Reservation preferences</h2>
        <p className="text-stone-gray text-sm">Configure how customers can book and what policies apply to reservations</p>
      </div>

      {/* Advance Booking Days */}
      <div>
        <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-deep-charcoal mb-2">
          How far in advance can customers book?
        </label>
        <select
          id="advance_booking_days"
          value={data.advance_booking_days}
          onChange={(e) => updateData({ advance_booking_days: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
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
        <label htmlFor="buffer_time" className="block text-sm font-semibold text-deep-charcoal mb-2">
          How much time between reservations?
        </label>
        <select
          id="buffer_time"
          value={data.buffer_time}
          onChange={(e) => updateData({ buffer_time: parseInt(e.target.value) })}
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        >
          <option value={0}>0 minutes (No buffer)</option>
          <option value={15}>15 minutes (Recommended)</option>
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
        <p className="mt-1 text-xs text-stone-gray">Buffer time to clean tables between parties</p>
      </div>

      {/* Cancellation Policy */}
      <div>
        <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-deep-charcoal mb-2">
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
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        >
          {CANCELLATION_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {policy}
            </option>
          ))}
        </select>
        {errors.cancellation_policy && (
          <p className="mt-1 text-sm text-burgundy">{errors.cancellation_policy}</p>
        )}
      </div>

      {/* Custom Cancellation Policy Input */}
      {isCustomPolicy && (
        <div>
          <label htmlFor="custom_policy" className="block text-sm font-semibold text-deep-charcoal mb-2">
            Enter your custom cancellation policy
          </label>
          <textarea
            id="custom_policy"
            rows={3}
            value={data.cancellation_policy}
            onChange={(e) => updateData({ cancellation_policy: e.target.value })}
            placeholder="e.g. Full refund if cancelled 24 hours before. 50% charge for late cancellations."
            className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone resize-none focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
          />
        </div>
      )}

      {/* Special Notes */}
      <div>
        <label htmlFor="special_notes" className="block text-sm font-semibold text-deep-charcoal mb-2">
          Special Notes (Optional)
        </label>
        <textarea
          id="special_notes"
          rows={3}
          value={data.special_notes || ''}
          onChange={(e) => updateData({ special_notes: e.target.value })}
          placeholder="e.g. Vegan options available, outdoor seating is seasonal, live music on weekends"
          className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone resize-none focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent transition-all"
        />
        <p className="mt-1 text-xs text-muted-stone">
          Displayed to customers during the booking process and communicated by the AI agent
        </p>
      </div>

      {/* Preview Card */}
      <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <ThiingsIcon name="info" pxSize={24} className="text-burgundy flex-shrink-0" />
          <div>
            <p className="text-deep-charcoal font-semibold text-sm mb-2">Preview: What customers will see</p>
            <div className="space-y-1 text-stone-gray text-sm">
              <p>Bookings accepted up to {data.advance_booking_days} days in advance</p>
              <p>{data.buffer_time > 0 ? `${data.buffer_time}-minute buffer between reservations` : 'No buffer between reservations'}</p>
              {data.cancellation_policy && <p>{data.cancellation_policy}</p>}
              {data.special_notes && <p className="italic">{data.special_notes}</p>}
            </div>
          </div>
        </div>
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
