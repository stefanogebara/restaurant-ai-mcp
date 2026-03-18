import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useManagerPreferences, useSaveManagerPreferences } from '../../hooks/useManagerPreferences';
import type { NotificationPreferences } from '../../hooks/useManagerPreferences';
import { useToast } from '../../contexts/ToastContext';

type BriefingChannel = 'text' | 'voice_note' | 'phone_call';

export default function ManagerNotificationsPanel() {
  const { t } = useTranslation();
  const toast = useToast();

  const CHANNEL_OPTIONS: { value: BriefingChannel; label: string; description: string }[] = [
    { value: 'text', label: t('settings.channelText'), description: t('settings.channelTextDesc') },
    { value: 'voice_note', label: t('settings.channelVoiceNote'), description: t('settings.channelVoiceNoteDesc') },
    { value: 'phone_call', label: t('settings.channelPhoneCall'), description: t('settings.channelPhoneCallDesc') },
  ];

  const ALERT_OPTIONS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
    { key: 'alert_low_covers', label: t('settings.alertLowCovers'), description: t('settings.alertLowCoversDesc') },
    { key: 'alert_high_noshows', label: t('settings.alertHighNoshows'), description: t('settings.alertHighNoshowsDesc') },
    { key: 'alert_late_cancellations', label: t('settings.alertLateCancellations'), description: t('settings.alertLateCancellationsDesc') },
  ];
  const { data: prefs, isLoading } = useManagerPreferences();
  const saveMutation = useSaveManagerPreferences();

  const [pending, setPending] = useState<Partial<NotificationPreferences>>({});

  const getValue = <K extends keyof NotificationPreferences>(key: K): NotificationPreferences[K] =>
    (key in pending ? pending[key] : prefs?.[key]) as NotificationPreferences[K];

  const set = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) =>
    setPending(p => ({ ...p, [key]: value }));

  const isDirty = Object.keys(pending).length > 0;

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate(pending, {
      onSuccess: () => {
        toast.success(t('settings.notificationsSaved'));
        setPending({});
      },
      onError: () => toast.error(t('settings.notificationsSaveFailed')),
    });
  };

  if (isLoading) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal tracking-wider">
          {t('settings.managerNotifications')}
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? t('common.loading') : t('common.save')}
        </button>
      </div>

      {/* Briefing channel */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">{t('settings.dailyBriefingDelivery')}</p>
        <div className="space-y-2">
          {CHANNEL_OPTIONS.map(opt => {
            const current = getValue('briefing_channel') ?? 'text';
            return (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="briefing_channel"
                  value={opt.value}
                  checked={current === opt.value}
                  onChange={() => set('briefing_channel', opt.value)}
                  aria-label={opt.label}
                  className="mt-0.5 accent-[#0D9488]"
                />
                <span>
                  <span className="text-sm font-medium text-deep-charcoal">{opt.label}</span>
                  <span className="block text-xs text-warm-stone">{opt.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Alert toggles */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">{t('settings.proactiveAlerts')}</p>
        <div className="space-y-3">
          {ALERT_OPTIONS.map(({ key, label, description }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!getValue(key)}
                onChange={e => set(key, e.target.checked as NotificationPreferences[typeof key])}
                aria-label={label}
                className="mt-0.5 accent-[#0D9488]"
              />
              <span>
                <span className="text-sm font-medium text-deep-charcoal">{label}</span>
                <span className="block text-xs text-warm-stone">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Customer engagement */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">{t('settings.customerEngagement', 'Customer Engagement')}</p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!getValue('pre_reservation_upsell')}
              onChange={e => set('pre_reservation_upsell', e.target.checked)}
              aria-label={t('settings.upsellLabel', 'Pre-reservation dish recommendations')}
              className="mt-0.5 accent-[#0D9488]"
            />
            <span>
              <span className="text-sm font-medium text-deep-charcoal">{t('settings.upsellLabel', 'Pre-reservation dish recommendations')}</span>
              <span className="block text-xs text-warm-stone">{t('settings.upsellDesc', 'Send AI-personalized dish suggestions via WhatsApp the day before each reservation')}</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
