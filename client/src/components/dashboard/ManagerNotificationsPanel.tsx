import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useManagerPreferences, useSaveManagerPreferences } from '../../hooks/useManagerPreferences';
import type { NotificationPreferences } from '../../hooks/useManagerPreferences';
import { useToast } from '../../contexts/ToastContext';
import PhoneInput from '../common/PhoneInput';

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
    <div className="py-5 border-t border-glass-border-dark mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {t('settings.managerNotifications')}
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-[#9F1239] hover:bg-[#881337] text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="mt-0.5 accent-[#9F1239]"
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
                className="mt-0.5 accent-[#9F1239]"
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
              className="mt-0.5 accent-[#9F1239]"
            />
            <span>
              <span className="text-sm font-medium text-deep-charcoal">{t('settings.upsellLabel', 'Pre-reservation dish recommendations')}</span>
              <span className="block text-xs text-warm-stone">{t('settings.upsellDesc', 'Send AI-personalized dish suggestions via WhatsApp the day before each reservation')}</span>
            </span>
          </label>
        </div>
      </div>

      {/* Weekly PDF report */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">{t('settings.weeklyReport', 'Weekly PDF Report')}</p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!getValue('weekly_report_whatsapp')}
              onChange={e => set('weekly_report_whatsapp', e.target.checked)}
              aria-label={t('settings.weeklyReportLabel', 'Send weekly PDF report via WhatsApp')}
              className="mt-0.5 accent-[#9F1239]"
            />
            <span>
              <span className="text-sm font-medium text-deep-charcoal">{t('settings.weeklyReportLabel', 'Send weekly PDF report via WhatsApp')}</span>
              <span className="block text-xs text-warm-stone">{t('settings.weeklyReportDesc', 'Sends the weekly analytics PDF to the manager phone once a week at 8:30 AM.')}</span>
            </span>
          </label>
          {getValue('weekly_report_whatsapp') && (
            <div className="ml-6 max-w-xs">
              <label className="block text-xs font-medium text-warm-stone mb-1" htmlFor="weekly_report_day">
                {t('settings.weeklyReportDayLabel', 'Delivery day')}
              </label>
              <select
                id="weekly_report_day"
                value={getValue('weekly_report_day') ?? 1}
                onChange={e => set('weekly_report_day', Number(e.target.value))}
                className="w-full px-3 py-2 border border-glass-border-input rounded-xl text-sm text-deep-charcoal bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#9F1239]/30 focus:border-[#9F1239]"
              >
                <option value={0}>{t('settings.daySunday', 'Sunday')}</option>
                <option value={1}>{t('settings.dayMonday', 'Monday')}</option>
                <option value={2}>{t('settings.dayTuesday', 'Tuesday')}</option>
                <option value={3}>{t('settings.dayWednesday', 'Wednesday')}</option>
                <option value={4}>{t('settings.dayThursday', 'Thursday')}</option>
                <option value={5}>{t('settings.dayFriday', 'Friday')}</option>
                <option value={6}>{t('settings.daySaturday', 'Saturday')}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Analytics briefing */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">{t('settings.analyticsBriefing', 'Daily Analytics Briefing')}</p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!getValue('analytics_briefing_enabled')}
              onChange={e => set('analytics_briefing_enabled', e.target.checked)}
              aria-label={t('settings.analyticsBriefingLabel', 'Daily analytics via WhatsApp')}
              className="mt-0.5 accent-[#9F1239]"
            />
            <span>
              <span className="text-sm font-medium text-deep-charcoal">{t('settings.analyticsBriefingLabel', 'Daily analytics via WhatsApp')}</span>
              <span className="block text-xs text-warm-stone">{t('settings.analyticsBriefingDesc', 'Receive a daily summary at 9 AM with visitors, demo funnel, and conversion metrics')}</span>
            </span>
          </label>
          {getValue('analytics_briefing_enabled') && (
            <div className="ml-6 max-w-xs">
              <PhoneInput
                value={(getValue('analytics_briefing_phone') as string) || ''}
                onChange={(fullNumber) => set('analytics_briefing_phone', fullNumber)}
                defaultCountry="BR"
                label={t('settings.analyticsBriefingPhone', 'WhatsApp number for briefing')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
