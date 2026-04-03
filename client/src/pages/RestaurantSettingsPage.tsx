/**
 * RestaurantSettingsPage
 *
 * Edit restaurant info, business hours, and reservation policies post-onboarding.
 * Route: /host-dashboard/settings
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRestaurantSettings, useUpdateRestaurantSettings } from '../hooks/useRestaurantSettings';
import type { BusinessHours, ReservationSettings } from '../hooks/useRestaurantSettings';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import StaffingSettingsPanel from '../components/dashboard/StaffingSettingsPanel';
import DepositSettingsPanel from '../components/settings/DepositSettingsPanel';
import BookingChannelsPanel from '../components/dashboard/BookingChannelsPanel';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_LABELS: Record<string, Record<string, string>> = {
  en: { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' },
  es: { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' },
  'pt-BR': { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' },
};

export default function RestaurantSettingsPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('pageTitles.settings'));
  const toast = useToast();
  const { data: settings, isLoading, error } = useRestaurantSettings();
  const updateMutation = useUpdateRestaurantSettings();
  const { data: dashData } = useQuery({
    queryKey: ['hostDashboard'],
    queryFn: async () => {
      const res = await authFetch('/host-dashboard?action=dashboard');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const slug: string = (dashData as { slug?: string } | undefined)?.slug || '';

  // Basic info form
  const [info, setInfo] = useState({
    restaurant_name: '',
    phone: '',
    email: '',
    city: '',
    country: '',
    timezone: '',
  });

  // Business hours form
  const [hours, setHours] = useState<BusinessHours>({});

  // Reservation policies form
  const [policies, setPolicies] = useState<ReservationSettings>({
    advance_booking_days: 30,
    buffer_time_minutes: 15,
    cancellation_policy: '',
    max_party_size: 12,
    min_party_size: 1,
    allow_waitlist: true,
  });

  // Sync from server
  useEffect(() => {
    if (!settings) return;
    setInfo({
      restaurant_name: settings.restaurant_name || '',
      phone: settings.phone || '',
      email: settings.email || '',
      city: settings.city || '',
      country: settings.country || '',
      timezone: settings.timezone || 'America/Sao_Paulo',
    });
    if (settings.business_hours) setHours(settings.business_hours);
    if (settings.reservation_settings) {
      setPolicies((prev) => ({ ...prev, ...settings.reservation_settings }));
    }
  }, [settings]);

  const handleSaveInfo = () => {
    updateMutation.mutate(info, {
      onSuccess: () => toast.success(t('settings.saved', 'Settings saved')),
      onError: () => toast.error(t('settings.saveFailed', 'Failed to save settings')),
    });
  };

  const handleSaveHours = () => {
    updateMutation.mutate({ business_hours: hours }, {
      onSuccess: () => toast.success(t('settings.hoursSaved', 'Business hours saved')),
      onError: () => toast.error(t('settings.saveFailed', 'Failed to save')),
    });
  };

  const handleSavePolicies = () => {
    updateMutation.mutate({ reservation_settings: policies } as Record<string, unknown>, {
      onSuccess: () => toast.success(t('settings.policiesSaved', 'Policies saved')),
      onError: () => toast.error(t('settings.saveFailed', 'Failed to save')),
    });
  };

  const updateHour = (day: string, field: 'open_time' | 'close_time' | 'is_open', value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const lang = (i18n.language || 'en') as keyof typeof DAY_LABELS;
  const dayLabels = DAY_LABELS[lang] || DAY_LABELS.en;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 sm:p-10 max-w-3xl mx-auto space-y-6 mt-14 sm:mt-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="py-5 border-b border-[#E5E7EB] animate-pulse space-y-3">
              <div className="h-5 bg-gray-100 rounded w-40" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6 sm:p-10 max-w-3xl mx-auto mt-14 sm:mt-0 text-center">
          <p className="text-sm text-red-600 mb-3">{t('settings.loadError', 'Failed to load restaurant settings.')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-burgundy text-white text-sm rounded-xl hover:bg-burgundy-dark transition-colors"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-10 max-w-3xl mx-auto bg-white mt-14 sm:mt-0">
        <div className="pl-12 lg:pl-0 mb-8">
          <h1 className="text-2xl font-bold text-deep-charcoal tracking-tight">
            {t('settings.title', 'Restaurant Settings')}
          </h1>
          <p className="text-sm text-muted-stone mt-0.5">
            {t('settings.subtitle', 'Manage your restaurant details, hours, and booking policies.')}
          </p>
        </div>

        {/* ── Basic Info ── */}
        <section className="py-5 border-b border-[#E5E7EB] space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
            <ThiingsIcon name="store" pxSize={16} className="text-muted-stone" />
            {t('settings.restaurantInfo', 'Restaurant Info')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('settings.name', 'Restaurant Name')} value={info.restaurant_name} onChange={(v) => setInfo({ ...info, restaurant_name: v })} />
            <Field label={t('settings.phone', 'Phone')} value={info.phone} onChange={(v) => setInfo({ ...info, phone: v })} type="tel" />
            <Field label={t('settings.email', 'Email')} value={info.email} onChange={(v) => setInfo({ ...info, email: v })} type="email" />
            <Field label={t('settings.city', 'City')} value={info.city} onChange={(v) => setInfo({ ...info, city: v })} />
            <Field label={t('settings.country', 'Country')} value={info.country} onChange={(v) => setInfo({ ...info, country: v })} />
            <TimezoneSelect label={t('settings.timezone', 'Timezone')} value={info.timezone} onChange={(v) => setInfo({ ...info, timezone: v })} selectPlaceholder={t('common.select', '— Select —')} />
          </div>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSaveInfo} loading={updateMutation.isPending} label={t('settings.saveInfo', 'Save Info')} />
          </div>
        </section>

        {/* ── Business Hours ── */}
        <section className="py-5 border-b border-[#E5E7EB] space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
            <ThiingsIcon name="clock" pxSize={16} className="text-muted-stone" />
            {t('settings.businessHours', 'Business Hours')}
          </h2>

          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayHours = hours[day] || { is_open: false, open_time: '12:00', close_time: '23:00' };
              return (
                <div key={day} className="flex items-center gap-3 py-2">
                  <label className="w-20 text-sm font-medium text-deep-charcoal flex-shrink-0">
                    {dayLabels[day]}
                  </label>
                  <label className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={dayHours.is_open}
                      onChange={(e) => updateHour(day, 'is_open', e.target.checked)}
                      className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy/30"
                    />
                    <span className="text-xs text-muted-stone">{t('settings.open', 'Open')}</span>
                  </label>
                  {dayHours.is_open && (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={dayHours.open_time || '12:00'}
                        onChange={(e) => updateHour(day, 'open_time', e.target.value)}
                        className="px-2 py-1.5 bg-soft-gray border border-border-gray rounded-lg text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                      />
                      <span className="text-xs text-muted-stone">—</span>
                      <input
                        type="time"
                        value={dayHours.close_time || '23:00'}
                        onChange={(e) => updateHour(day, 'close_time', e.target.value)}
                        className="px-2 py-1.5 bg-soft-gray border border-border-gray rounded-lg text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                      />
                    </div>
                  )}
                  {!dayHours.is_open && (
                    <span className="text-xs text-muted-stone italic">{t('settings.closed', 'Closed')}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSaveHours} loading={updateMutation.isPending} label={t('settings.saveHours', 'Save Hours')} />
          </div>
        </section>

        {/* ── Reservation Policies ── */}
        <section className="py-5 border-b border-[#E5E7EB] space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
            <ThiingsIcon name="settings" pxSize={16} className="text-muted-stone" />
            {t('settings.reservationPolicies', 'Reservation Policies')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-stone mb-1">
                {t('settings.advanceBooking', 'Advance Booking (days)')}
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={policies.advance_booking_days ?? 30}
                onChange={(e) => setPolicies({ ...policies, advance_booking_days: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-stone mb-1">
                {t('settings.bufferTime', 'Buffer Between Reservations (min)')}
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={policies.buffer_time_minutes ?? 15}
                onChange={(e) => setPolicies({ ...policies, buffer_time_minutes: parseInt(e.target.value) || 15 })}
                className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-stone mb-1">
                {t('settings.minPartySize', 'Min Party Size')}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={policies.min_party_size ?? 1}
                onChange={(e) => setPolicies({ ...policies, min_party_size: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-stone mb-1">
                {t('settings.maxPartySize', 'Max Party Size')}
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={policies.max_party_size ?? 12}
                onChange={(e) => setPolicies({ ...policies, max_party_size: parseInt(e.target.value) || 12 })}
                className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-stone mb-1">
              {t('settings.cancellationPolicy', 'Cancellation Policy')}
            </label>
            <textarea
              rows={2}
              value={policies.cancellation_policy || ''}
              onChange={(e) => setPolicies({ ...policies, cancellation_policy: e.target.value })}
              className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 resize-none"
              placeholder={t('settings.cancellationPlaceholder', 'Free cancellation up to 24 hours before...')}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policies.allow_waitlist ?? true}
              onChange={(e) => setPolicies({ ...policies, allow_waitlist: e.target.checked })}
              className="w-4 h-4 rounded border-border-gray text-burgundy focus:ring-burgundy/30"
            />
            <span className="text-sm text-deep-charcoal">{t('settings.allowWaitlist', 'Allow waitlist when fully booked')}</span>
          </label>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSavePolicies} loading={updateMutation.isPending} label={t('settings.savePolicies', 'Save Policies')} />
          </div>
        </section>

        {/* ── Staffing Ratios ── */}
        <section className="py-5 border-b border-[#E5E7EB]">
          <StaffingSettingsPanel />
        </section>

        {/* ── Reservation Deposits ── */}
        <section className="py-5 border-b border-[#E5E7EB]">
          <DepositSettingsPanel />
        </section>

        {/* ── Booking Channels ── */}
        {slug && <BookingChannelsPanel slug={slug} />}
      </div>
    </DashboardLayout>
  );
}

// ── Sub-components ──

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-stone mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
      />
    </div>
  );
}

const COMMON_TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Mexico_City', 'America/Buenos_Aires', 'America/Bogota',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Lisbon', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Vienna',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

function TimezoneSelect({ label, value, onChange, selectPlaceholder = '— Select —' }: { label: string; value: string; onChange: (v: string) => void; selectPlaceholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-stone mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
      >
        <option value="">{selectPlaceholder}</option>
        {COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
        ))}
      </select>
    </div>
  );
}

function SaveButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? '...' : label}
    </button>
  );
}
