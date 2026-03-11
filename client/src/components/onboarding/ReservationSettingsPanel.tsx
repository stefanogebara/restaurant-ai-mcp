import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

const CANCELLATION_POLICY_KEYS = [
  { value: 'Free cancellation up to 2 hours before reservation', key: 'onboarding.cancelFree2h' },
  { value: 'Free cancellation up to 24 hours before reservation', key: 'onboarding.cancelFree24h' },
  { value: 'Free cancellation up to 48 hours before reservation', key: 'onboarding.cancelFree48h' },
  { value: 'No cancellations allowed', key: 'onboarding.cancelNone' },
];

interface ReservationSettingsPanelProps {
  advanceBookingDays: number;
  bufferTime: number;
  cancellationPolicy: string;
  onUpdate: (key: string, value: string | number) => void;
}

export default function ReservationSettingsPanel({ advanceBookingDays, bufferTime, cancellationPolicy, onUpdate }: ReservationSettingsPanelProps) {
  const { t } = useTranslation();
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
            <span className="text-sm font-semibold text-deep-charcoal">{t('onboarding.reservationSettings')}</span>
            <p className="text-xs text-warm-stone">
              {t('onboarding.bookingWindowSummary', { days: advanceBookingDays, minutes: bufferTime })}
            </p>
          </div>
        </div>
        <ThiingsIcon name="chevron-down" pxSize={20} className={`text-stone-gray transition-transform ${showSettings ? 'rotate-180' : ''}`} />
      </button>

      {showSettings && (
        <div className="px-5 py-4 space-y-4 bg-white">
          <div>
            <label htmlFor="advance_booking_days" className="block text-sm font-semibold text-deep-charcoal mb-2">
              {t('onboarding.advanceBookingLabel')}{' '}
              <span title={t('onboarding.advanceBookingHint')} className="text-muted-stone cursor-help font-normal">ⓘ</span>
            </label>
            <select
              id="advance_booking_days"
              value={advanceBookingDays}
              onChange={(e) => onUpdate('advance_booking_days', parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              <option value={7}>{t('onboarding.days7')}</option>
              <option value={14}>{t('onboarding.days14')}</option>
              <option value={30}>{t('onboarding.days30')}</option>
              <option value={60}>{t('onboarding.days60')}</option>
              <option value={90}>{t('onboarding.days90')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="buffer_time" className="block text-sm font-semibold text-deep-charcoal mb-2">
              {t('onboarding.bufferTimeLabel')}{' '}
              <span title={t('onboarding.bufferTimeHint')} className="text-muted-stone cursor-help font-normal">ⓘ</span>
            </label>
            <select
              id="buffer_time"
              value={bufferTime}
              onChange={(e) => onUpdate('buffer_time', parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              <option value={0}>{t('onboarding.buffer0')}</option>
              <option value={15}>{t('onboarding.buffer15')}</option>
              <option value={30}>{t('onboarding.buffer30')}</option>
              <option value={45}>{t('onboarding.buffer45')}</option>
              <option value={60}>{t('onboarding.buffer60')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="cancellation_policy" className="block text-sm font-semibold text-deep-charcoal mb-2">
              {t('onboarding.cancellationPolicyLabel')}
            </label>
            <select
              id="cancellation_policy"
              value={cancellationPolicy}
              onChange={(e) => onUpdate('cancellation_policy', e.target.value)}
              className="w-full px-4 py-3 bg-soft-gray border border-border-gray rounded-xl text-deep-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy"
            >
              {CANCELLATION_POLICY_KEYS.map((policy) => (
                <option key={policy.value} value={policy.value}>{t(policy.key)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
