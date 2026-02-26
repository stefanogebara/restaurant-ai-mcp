import { useState } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';

const CANCELLATION_POLICIES = [
  'Free cancellation up to 2 hours before reservation',
  'Free cancellation up to 24 hours before reservation',
  'Free cancellation up to 48 hours before reservation',
  'No cancellations allowed',
];

interface ReservationSettingsPanelProps {
  advanceBookingDays: number;
  bufferTime: number;
  cancellationPolicy: string;
  onUpdate: (key: string, value: string | number) => void;
}

export default function ReservationSettingsPanel({ advanceBookingDays, bufferTime, cancellationPolicy, onUpdate }: ReservationSettingsPanelProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="border border-border-gray rounded-xl overflow-hidden">
      <button
        onClick={() => setShowSettings(!showSettings)}
        aria-expanded={showSettings}
        className="w-full flex items-center justify-between px-5 py-4 bg-soft-gray hover:bg-stone-pale transition-colors"
      >
        <div className="flex items-center gap-3">
          <ThiingsIcon name="gear" pxSize={20} className="text-stone-gray" />
          <div className="text-left">
            <span className="text-sm font-semibold text-deep-charcoal">Reservation Settings</span>
            <p className="text-xs text-warm-stone">
              Booking window: {advanceBookingDays} days | Buffer: {bufferTime} min
            </p>
          </div>
        </div>
        <ThiingsIcon name="chevron-down" pxSize={20} className={`text-stone-gray transition-transform ${showSettings ? 'rotate-180' : ''}`} />
      </button>

      {showSettings && (
        <div className="px-5 py-4 space-y-4 bg-white">
          <div>
            <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-deep-charcoal mb-2">
              How far in advance can customers book?
            </label>
            <select
              id="advance_booking_days"
              value={advanceBookingDays}
              onChange={(e) => onUpdate('advance_booking_days', parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days (Recommended)</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <div>
            <label htmlFor="buffer_time" className="block text-sm font-semibold text-deep-charcoal mb-2">
              Buffer time between reservations
            </label>
            <select
              id="buffer_time"
              value={bufferTime}
              onChange={(e) => onUpdate('buffer_time', parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              <option value={0}>0 minutes (No buffer)</option>
              <option value={15}>15 minutes (Recommended)</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          <div>
            <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-deep-charcoal mb-2">
              Cancellation Policy
            </label>
            <select
              id="cancellation_policy"
              value={cancellationPolicy}
              onChange={(e) => onUpdate('cancellation_policy', e.target.value)}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              {CANCELLATION_POLICIES.map((policy) => (
                <option key={policy} value={policy}>{policy}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
