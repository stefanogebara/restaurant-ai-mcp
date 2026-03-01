import { useState } from 'react';
import { useManagerPreferences, useSaveManagerPreferences } from '../../hooks/useManagerPreferences';
import type { NotificationPreferences } from '../../hooks/useManagerPreferences';
import { useToast } from '../../contexts/ToastContext';

type BriefingChannel = 'text' | 'voice_note' | 'phone_call';

const CHANNEL_OPTIONS: { value: BriefingChannel; label: string; description: string }[] = [
  { value: 'text', label: 'Text Message', description: 'WhatsApp text (default)' },
  { value: 'voice_note', label: 'Voice Note', description: 'AI-generated audio via WhatsApp' },
  { value: 'phone_call', label: 'Phone Call', description: 'Automated call reads the briefing aloud' },
];

const ALERT_OPTIONS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'alert_low_covers', label: 'Low covers', description: 'Alert at 6pm when tonight is under 50% capacity' },
  { key: 'alert_high_noshows', label: 'High no-show risk', description: 'Alert at 3pm when 3+ reservations have >70% no-show probability' },
  { key: 'alert_late_cancellations', label: 'Late cancellations', description: 'Alert every 2h (12–8pm) when 2+ cancellations in the last 2 hours' },
];

export default function ManagerNotificationsPanel() {
  const toast = useToast();
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
        toast.success('Notification preferences saved');
        setPending({});
      },
      onError: () => toast.error('Failed to save preferences'),
    });
  };

  if (isLoading) return null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">
          Manager Notifications
        </h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Briefing channel */}
      <div>
        <p className="text-sm font-medium text-deep-charcoal mb-3">Daily briefing delivery</p>
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
                  className="mt-0.5 accent-burgundy"
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
        <p className="text-sm font-medium text-deep-charcoal mb-3">Proactive alerts</p>
        <div className="space-y-3">
          {ALERT_OPTIONS.map(({ key, label, description }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!getValue(key)}
                onChange={e => set(key, e.target.checked as NotificationPreferences[typeof key])}
                aria-label={label}
                className="mt-0.5 accent-burgundy"
              />
              <span>
                <span className="text-sm font-medium text-deep-charcoal">{label}</span>
                <span className="block text-xs text-warm-stone">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
