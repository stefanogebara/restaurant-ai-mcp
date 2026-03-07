/**
 * FeedbackSettingsPanel — enable/disable feedback, configure delay and template.
 * Placed in WhatsApp Settings page.
 */
import { useState, useEffect } from 'react';
import { useFeedbackConfig, useUpdateFeedbackConfig } from '../../hooks/useFeedback';
import ThiingsIcon from '../common/ThiingsIcon';

export default function FeedbackSettingsPanel() {
  const { data: config, isLoading } = useFeedbackConfig();
  const updateConfig = useUpdateFeedbackConfig();

  const [enabled, setEnabled] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [template, setTemplate] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setDelayMinutes(config.delay_minutes);
      setTemplate(config.message_template || '');
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate({
      enabled,
      delay_minutes: delayMinutes,
      message_template: template || null,
    });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-5 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
        <div className="h-10 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <ThiingsIcon name="message-circle" pxSize={16} className="text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-deep-charcoal">Post-Visit Feedback</h3>
      </div>

      <p className="text-xs text-muted-stone mb-4">
        Automatically send a WhatsApp message after each dining experience to collect guest feedback.
      </p>

      {/* Enable toggle */}
      <label className="flex items-center justify-between mb-4 cursor-pointer">
        <span className="text-sm text-deep-charcoal">Enable post-visit feedback</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => { setEnabled(!enabled); setDirty(true); }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </label>

      {enabled && (
        <>
          {/* Delay */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-stone mb-1">
              Send feedback after (minutes)
            </label>
            <select
              value={delayMinutes}
              onChange={(e) => { setDelayMinutes(parseInt(e.target.value)); setDirty(true); }}
              className="w-full border border-border-gray rounded-xl px-3 py-2 text-sm text-deep-charcoal"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={360}>6 hours</option>
              <option value={720}>12 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </div>

          {/* Custom template */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-stone mb-1">
              Custom message (optional)
            </label>
            <textarea
              value={template}
              onChange={(e) => { setTemplate(e.target.value); setDirty(true); }}
              placeholder="Leave blank for default message. Use {name} and {restaurant} as placeholders."
              rows={3}
              className="w-full border border-border-gray rounded-xl px-3 py-2 text-sm text-deep-charcoal resize-none"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-stone mt-0.5">
              Placeholders: {'{name}'}, {'{restaurant}'}
            </p>
          </div>
        </>
      )}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="w-full py-2 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          {updateConfig.isPending ? 'Saving...' : 'Save Feedback Settings'}
        </button>
      )}
    </div>
  );
}
