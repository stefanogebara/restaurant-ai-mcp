/**
 * RestaurantSettingsPage
 *
 * Edit restaurant info, business hours, and reservation policies post-onboarding.
 * Route: /host-dashboard/settings
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRestaurantSettings, useUpdateRestaurantSettings } from '../hooks/useRestaurantSettings';
import type { BusinessHours, ReservationSettings } from '../hooks/useRestaurantSettings';
import { localizeCancellationPolicy } from '../utils/cancellationPolicy';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import StaffingSettingsPanel from '../components/dashboard/StaffingSettingsPanel';
import DepositSettingsPanel from '../components/settings/DepositSettingsPanel';
import CoverPhotoPanel from '../components/settings/CoverPhotoPanel';
import BookingChannelsPanel from '../components/dashboard/BookingChannelsPanel';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { isDayHoursValid } from '../components/onboarding/Step2Contact';

// Number-input setter that doesn't snap to `fallback` on every keystroke. The
// previous `parseInt(v) || fallback` pattern (a) ignored the radix and (b) hit
// the `||` branch on a legit `0` value AND on a momentarily-empty input,
// preventing 0-buffer entry and making every clear-and-retype revert mid-edit.
const parseIntOrKeep = (raw: string, current: number, fallback: number): number => {
  if (raw === '') return current;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^\+\d{7,14}$/;

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
    default_dining_duration: 90,
    auto_confirm: true,
  });

  // ONE-TIME hydration from server. The previous version re-ran on every
  // settings ref change — React Query refetches on window focus / mutation
  // success, so any unsaved typing in the cancellation-policy textarea
  // got silently overwritten when the host switched tabs and came back.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!settings || hasHydrated.current) return;
    hasHydrated.current = true;
    setInfo({
      restaurant_name: settings.restaurant_name || '',
      phone: settings.phone || '',
      email: settings.email || '',
      city: settings.city || '',
      country: settings.country || '',
      timezone: settings.timezone || 'America/Sao_Paulo',
    });
    // Seed all 7 days from the server payload (or sensible defaults). Saves
    // need the complete week — without this, a partial server payload meant
    // the days the host never touched were missing from the PUT.
    const seeded: BusinessHours = {};
    for (const day of DAYS) {
      const existing = settings.business_hours?.[day];
      seeded[day] = existing ?? { is_open: false, open_time: '12:00', close_time: '23:00' };
    }
    setHours(seeded);
    if (settings.reservation_settings) {
      setPolicies((prev) => ({ ...prev, ...settings.reservation_settings }));
    }
  }, [settings]);

  // Track which section is dirty — used to warn before tab close.
  const [dirty, setDirty] = useState({ info: false, hours: false, policies: false });
  const isAnyDirty = dirty.info || dirty.hours || dirty.policies;

  // beforeunload warning when the host has unsaved edits in any section. The
  // page has three independent save buttons — easy to think you saved one
  // section when you saved another and navigate away losing the rest.
  useEffect(() => {
    if (!isAnyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message and show their own — return value
      // just needs to be truthy.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isAnyDirty]);

  const handleSaveInfo = () => {
    const phone = info.phone.trim();
    const email = info.email.trim();
    // Match the validation Step2Contact already runs during onboarding —
    // this page was accepting "abc" as email and "123" as phone, both of
    // which then break Twilio/WhatsApp/Resend dispatchers downstream.
    if (phone && !PHONE_RE.test(phone.replace(/\s/g, ''))) {
      toast.error(t('onboarding.phoneInvalidFormat', 'Phone must start with + followed by 7-14 digits (E.164 format)'));
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      toast.error(t('onboarding.emailInvalid', 'Please enter a valid email address'));
      return;
    }
    updateMutation.mutate(info, {
      onSuccess: () => { toast.success(t('settings.saved', 'Settings saved')); setDirty((d) => ({ ...d, info: false })); },
      onError: (err) => toast.error(err.message || t('settings.saveFailed', 'Failed to save settings')),
    });
  };

  const handleSaveHours = () => {
    // Validate every open day. The previous version had ZERO validation —
    // a host could enter open=20:00 close=02:00, get a success toast, and
    // their availability backend (api/portal.js) would silently produce
    // zero bookable slots for that day. isDayHoursValid allows midnight
    // (00:00) close — the only overnight case the slot generator handles.
    const invalidDays: string[] = [];
    for (const day of DAYS) {
      const dh = hours[day];
      if (!dh || !dh.is_open) continue;
      if (!dh.open_time || !dh.close_time) {
        invalidDays.push(day);
        continue;
      }
      if (!isDayHoursValid(dh.open_time, dh.close_time)) {
        invalidDays.push(day);
      }
    }
    if (invalidDays.length > 0) {
      const names = invalidDays.map((d) => dayLabels[d]).join(', ');
      toast.error(`${t('onboarding.closingAfterOpening', 'Closing time must be after opening time')} (${names})`);
      return;
    }
    updateMutation.mutate({ business_hours: hours }, {
      onSuccess: () => { toast.success(t('settings.hoursSaved', 'Business hours saved')); setDirty((d) => ({ ...d, hours: false })); },
      onError: (err) => toast.error(err.message || t('settings.saveFailed', 'Failed to save')),
    });
  };

  const handleSavePolicies = () => {
    updateMutation.mutate({ reservation_settings: policies } as Record<string, unknown>, {
      onSuccess: () => { toast.success(t('settings.policiesSaved', 'Policies saved')); setDirty((d) => ({ ...d, policies: false })); },
      onError: (err) => toast.error(err.message || t('settings.saveFailed', 'Failed to save')),
    });
  };

  // Patch helpers also flip the dirty flag for the section — required so the
  // beforeunload warning + the disabled-save logic actually fire.
  const patchInfo = (patch: Partial<typeof info>) => {
    setInfo((prev) => ({ ...prev, ...patch }));
    setDirty((d) => ({ ...d, info: true }));
  };
  const patchPolicies = (patch: Partial<ReservationSettings>) => {
    setPolicies((prev) => ({ ...prev, ...patch }));
    setDirty((d) => ({ ...d, policies: true }));
  };
  const updateHour = (day: string, field: 'open_time' | 'close_time' | 'is_open', value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
    setDirty((d) => ({ ...d, hours: true }));
  };

  // "Copy to all days" — propagates the first day's config (Monday in our
  // DAYS array order) to the other 6. Audit found owners with consistent
  // weekday/weekend hours had to fill 7 sets of fields by hand. Pulled from
  // the source day so a user can configure Monday once and broadcast.
  const copyHoursToAllDays = () => {
    setHours((prev) => {
      const source = prev[DAYS[0]];
      if (!source) return prev;
      const next: BusinessHours = { ...prev };
      for (const day of DAYS) {
        // Preserve a fresh object per day so React Query/serialisation later
        // doesn't see referential equality with the source.
        next[day] = {
          is_open: source.is_open,
          open_time: source.open_time,
          close_time: source.close_time,
        };
      }
      return next;
    });
    setDirty((d) => ({ ...d, hours: true }));
  };

  // Normalize "en-US" → "en" so unsupported sub-locales fall back to the
  // language root before hitting English. The cast was a type lie before.
  const langRoot = (i18n.language?.split('-')[0] || 'en');
  const langKey = (DAY_LABELS[i18n.language] ? i18n.language : langRoot) as keyof typeof DAY_LABELS;
  const dayLabels = DAY_LABELS[langKey] || DAY_LABELS.en;

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
      <div className="p-4 sm:p-6 lg:p-10 max-w-3xl mx-auto mt-14 sm:mt-0 pb-24 sm:pb-10 overflow-x-hidden">
        <div className="pl-10 lg:pl-0 mb-8">
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
            <Field label={t('settings.name', 'Restaurant Name')} value={info.restaurant_name} onChange={(v) => patchInfo({ restaurant_name: v })} />
            <Field label={t('settings.phone', 'Phone')} value={info.phone} onChange={(v) => patchInfo({ phone: v })} type="tel" />
            <Field label={t('settings.email', 'Email')} value={info.email} onChange={(v) => patchInfo({ email: v })} type="email" />
            <Field label={t('settings.city', 'City')} value={info.city} onChange={(v) => patchInfo({ city: v })} />
            <CountrySelect label={t('settings.country', 'Country')} value={info.country} onChange={(v) => patchInfo({ country: v })} selectPlaceholder={t('common.select', '— Select —')} />
            <TimezoneSelect label={t('settings.timezone', 'Timezone')} value={info.timezone} onChange={(v) => patchInfo({ timezone: v })} selectPlaceholder={t('common.select', '— Select —')} />
          </div>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSaveInfo} loading={updateMutation.isPending} disabled={!dirty.info} label={t('settings.saveInfo', 'Save Info')} />
          </div>

          {/* Booking-page cover photo — self-contained panel that saves
              immediately on upload/remove (no Save button dependency). */}
          <div className="pt-4 border-t border-[#F3F4F6]">
            <CoverPhotoPanel coverImageUrl={settings?.cover_image_url} />
          </div>
        </section>

        {/* ── Business Hours ── */}
        <section className="py-5 border-b border-[#E5E7EB] space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
              <ThiingsIcon name="clock" pxSize={16} className="text-muted-stone" />
              {t('settings.businessHours', 'Business Hours')}
            </h2>
            {/* Quick-fill shortcut: copies Monday's open/close + open flag to
                the other 6 days so consistent-hours restaurants don't have
                to enter 7 sets of fields by hand. */}
            <button
              type="button"
              onClick={copyHoursToAllDays}
              className="text-xs font-medium text-burgundy hover:text-burgundy-dark underline underline-offset-2"
            >
              {t('settings.copyHoursToAll', 'Copiar horários da segunda para todos os dias')}
            </button>
          </div>

          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayHours = hours[day] || { is_open: false, open_time: '12:00', close_time: '23:00' };
              return (
                <div key={day} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 py-2 border-b border-[#F3F4F6] sm:border-b-0 last:border-b-0">
                  <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <label className="w-16 sm:w-20 text-sm font-medium text-deep-charcoal flex-shrink-0">
                      {dayLabels[day]}
                    </label>
                    <label className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={dayHours.is_open}
                        onChange={(e) => updateHour(day, 'is_open', e.target.checked)}
                        className="w-4 h-4 rounded border-glass-border-input text-burgundy focus:ring-burgundy/30"
                      />
                      <span className="text-xs text-muted-stone">{t('settings.open', 'Open')}</span>
                    </label>
                    {!dayHours.is_open && (
                      <span className="text-xs text-muted-stone italic">{t('settings.closed', 'Closed')}</span>
                    )}
                  </div>
                  {dayHours.is_open && (
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 pl-0 sm:pl-0 ml-0">
                      <input
                        type="time"
                        value={dayHours.open_time || '12:00'}
                        onChange={(e) => updateHour(day, 'open_time', e.target.value)}
                        className="min-w-0 flex-1 sm:flex-none sm:w-[120px] px-2 py-1.5 bg-soft-gray border border-glass-border-input rounded-lg text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                      />
                      <span className="text-xs text-muted-stone flex-shrink-0">—</span>
                      <input
                        type="time"
                        value={dayHours.close_time || '23:00'}
                        onChange={(e) => updateHour(day, 'close_time', e.target.value)}
                        className="min-w-0 flex-1 sm:flex-none sm:w-[120px] px-2 py-1.5 bg-soft-gray border border-glass-border-input rounded-lg text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSaveHours} loading={updateMutation.isPending} disabled={!dirty.hours} label={t('settings.saveHours', 'Save Hours')} />
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
                onChange={(e) => patchPolicies({ advance_booking_days: parseIntOrKeep(e.target.value, policies.advance_booking_days ?? 30, 30) })}
                className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-stone mb-1">
                {t('settings.defaultDiningDuration', 'Default Dining Duration')}
              </label>
              <select
                value={policies.default_dining_duration ?? 90}
                onChange={(e) => patchPolicies({ default_dining_duration: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              >
                <option value={60}>{t('settings.durationMinutes', '{{count}} minutes', { count: 60 })}</option>
                <option value={90}>{t('settings.durationMinutes', '{{count}} minutes', { count: 90 })}</option>
                <option value={120}>{t('settings.durationMinutes', '{{count}} minutes', { count: 120 })}</option>
                <option value={150}>{t('settings.durationMinutes', '{{count}} minutes', { count: 150 })}</option>
              </select>
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
                onChange={(e) => patchPolicies({ buffer_time_minutes: parseIntOrKeep(e.target.value, policies.buffer_time_minutes ?? 15, 15) })}
                className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
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
                onChange={(e) => patchPolicies({ min_party_size: parseIntOrKeep(e.target.value, policies.min_party_size ?? 1, 1) })}
                className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
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
                onChange={(e) => patchPolicies({ max_party_size: parseIntOrKeep(e.target.value, policies.max_party_size ?? 12, 12) })}
                className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-stone mb-1">
              {t('settings.cancellationPolicy', 'Cancellation Policy')}
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              // If the stored value is a stable preset key (set during onboarding),
              // show the localized preset text so the owner reads it in their
              // language. Any edit replaces with the typed text (custom policy).
              value={localizeCancellationPolicy(policies.cancellation_policy, t, '')}
              onChange={(e) => patchPolicies({ cancellation_policy: e.target.value })}
              className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 resize-none"
              placeholder={t('settings.cancellationPlaceholder', 'Free cancellation up to 24 hours before...')}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policies.auto_confirm ?? true}
              onChange={(e) => patchPolicies({ auto_confirm: e.target.checked })}
              className="w-4 h-4 rounded border-glass-border-input text-burgundy focus:ring-burgundy/30"
            />
            <span className="text-sm text-deep-charcoal">{t('settings.autoConfirm', 'Automatically confirm reservations')}</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policies.allow_waitlist ?? true}
              onChange={(e) => patchPolicies({ allow_waitlist: e.target.checked })}
              className="w-4 h-4 rounded border-glass-border-input text-burgundy focus:ring-burgundy/30"
            />
            <span className="text-sm text-deep-charcoal">{t('settings.allowWaitlist', 'Allow waitlist when fully booked')}</span>
          </label>

          <div className="flex justify-end pt-2">
            <SaveButton onClick={handleSavePolicies} loading={updateMutation.isPending} disabled={!dirty.policies} label={t('settings.savePolicies', 'Save Policies')} />
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
        className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
      />
    </div>
  );
}

// Friendly labels for each timezone the picker offers — IANA strings like
// "America/Sao_Paulo" leak technical detail to restaurant owners who'd rather
// see "São Paulo (GMT-3)". Order kept stable across the list.
const TZ_OPTIONS: ReadonlyArray<{ tz: string; label: string }> = [
  { tz: 'America/Sao_Paulo',    label: 'São Paulo (GMT-3)' },
  { tz: 'America/New_York',     label: 'New York (GMT-5)' },
  { tz: 'America/Chicago',      label: 'Chicago (GMT-6)' },
  { tz: 'America/Denver',       label: 'Denver (GMT-7)' },
  { tz: 'America/Los_Angeles',  label: 'Los Angeles (GMT-8)' },
  { tz: 'America/Mexico_City',  label: 'Cidade do México (GMT-6)' },
  { tz: 'America/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { tz: 'America/Bogota',       label: 'Bogotá (GMT-5)' },
  { tz: 'Europe/London',        label: 'London (GMT+0)' },
  { tz: 'Europe/Paris',         label: 'Paris (GMT+1)' },
  { tz: 'Europe/Berlin',        label: 'Berlin (GMT+1)' },
  { tz: 'Europe/Madrid',        label: 'Madrid (GMT+1)' },
  { tz: 'Europe/Rome',          label: 'Rome (GMT+1)' },
  { tz: 'Europe/Lisbon',        label: 'Lisbon (GMT+0)' },
  { tz: 'Europe/Amsterdam',     label: 'Amsterdam (GMT+1)' },
  { tz: 'Europe/Zurich',        label: 'Zurich (GMT+1)' },
  { tz: 'Europe/Vienna',        label: 'Vienna (GMT+1)' },
  { tz: 'Asia/Tokyo',           label: 'Tokyo (GMT+9)' },
  { tz: 'Asia/Shanghai',        label: 'Shanghai (GMT+8)' },
  { tz: 'Asia/Dubai',           label: 'Dubai (GMT+4)' },
  { tz: 'Asia/Singapore',       label: 'Singapore (GMT+8)' },
  { tz: 'Asia/Kolkata',         label: 'Kolkata (GMT+5:30)' },
  { tz: 'Australia/Sydney',     label: 'Sydney (GMT+10)' },
  { tz: 'Pacific/Auckland',     label: 'Auckland (GMT+12)' },
];
const COMMON_TIMEZONES = TZ_OPTIONS.map((o) => o.tz);

function TimezoneSelect({ label, value, onChange, selectPlaceholder = '— Select —' }: { label: string; value: string; onChange: (v: string) => void; selectPlaceholder?: string }) {
  // If the stored timezone is outside the curated list (e.g. America/Halifax),
  // include it as an extra option. Otherwise the <select> silently rendered no
  // selection and saving the form would overwrite the host's real timezone
  // with the empty placeholder value.
  const options: ReadonlyArray<{ tz: string; label: string }> =
    value && !COMMON_TIMEZONES.includes(value)
      ? [{ tz: value, label: value.replace(/_/g, ' ') }, ...TZ_OPTIONS]
      : TZ_OPTIONS;
  return (
    <div>
      <label className="block text-xs font-medium text-muted-stone mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
      >
        <option value="">{selectPlaceholder}</option>
        {options.map(({ tz, label }) => (
          <option key={tz} value={tz}>{label}</option>
        ))}
      </select>
    </div>
  );
}

// Curated country list — keeps the dropdown short and surfaces the home
// markets first. ISO-3166 alpha-2 codes are still what we persist; the label
// the owner sees is the localized country name.
const COUNTRY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'BR', label: 'Brasil' },
  { code: 'PT', label: 'Portugal' },
  { code: 'ES', label: 'España' },
  { code: 'MX', label: 'México' },
  { code: 'AR', label: 'Argentina' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'FR', label: 'France' },
  { code: 'IT', label: 'Italia' },
  { code: 'DE', label: 'Deutschland' },
  { code: 'JP', label: '日本' },
];
const COUNTRY_CODES = COUNTRY_OPTIONS.map((o) => o.code);

function CountrySelect({ label, value, onChange, selectPlaceholder = '— Select —' }: { label: string; value: string; onChange: (v: string) => void; selectPlaceholder?: string }) {
  // Preserve any out-of-list value the same way TimezoneSelect does, so
  // saving with an unfamiliar legacy code doesn't silently wipe it.
  const options: ReadonlyArray<{ code: string; label: string }> =
    value && !COUNTRY_CODES.includes(value.toUpperCase())
      ? [{ code: value, label: value }, ...COUNTRY_OPTIONS]
      : COUNTRY_OPTIONS;
  return (
    <div>
      <label className="block text-xs font-medium text-muted-stone mb-1">{label}</label>
      <select
        value={value.toUpperCase()}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-soft-gray border border-glass-border-input rounded-xl text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
      >
        <option value="">{selectPlaceholder}</option>
        {options.map(({ code, label }) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </div>
  );
}

function SaveButton({ onClick, loading, label, disabled }: { onClick: () => void; loading: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading}
      className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? '...' : label}
    </button>
  );
}
