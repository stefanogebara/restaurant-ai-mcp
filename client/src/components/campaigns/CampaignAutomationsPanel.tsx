import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutomations, useUpdateAutomation } from '../../hooks/useCampaignAutomations';
import type { CampaignAutomation } from '../../hooks/useCampaignAutomations';
import { useToast } from '../../contexts/ToastContext';

const TRIGGER_ORDER = [
  'post_visit_thank_you',
  'birthday_reminder',
  'anniversary_reminder',
  'lapsed_30d',
  'lapsed_60d',
  'lapsed_90d',
  'review_request',
] as const;

const CHANNEL_OPTIONS = [
  { value: 'email', labelKey: 'campaigns.automations.channelEmail' },
  { value: 'whatsapp', labelKey: 'campaigns.automations.channelWhatsApp' },
] as const;

export default function CampaignAutomationsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: automations, isLoading, error } = useAutomations();
  const updateMutation = useUpdateAutomation();

  if (isLoading) {
    return (
      <div className="text-center py-12 text-stone-gray text-sm">
        {t('campaigns.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-700 text-sm">
        {t('campaigns.automations.updateFailed', 'Failed to load automations')}
      </div>
    );
  }

  const automationMap = new Map(
    (automations || []).map(a => [a.trigger_type, a])
  );

  return (
    <div>
      <p className="text-[15px] text-stone-gray mb-7 max-w-2xl">
        {t('campaigns.automations.description')}
      </p>

      {TRIGGER_ORDER.map(triggerType => {
        const automation = automationMap.get(triggerType);
        return (
          <AutomationRow
            key={triggerType}
            triggerType={triggerType}
            automation={automation || null}
            onUpdate={(params) => {
              updateMutation.mutate(params, {
                onError: () => {
                  toast.error(t('campaigns.automations.updateFailed'));
                },
              });
            }}
            isUpdating={updateMutation.isPending}
          />
        );
      })}
    </div>
  );
}

interface AutomationRowProps {
  triggerType: string;
  automation: CampaignAutomation | null;
  onUpdate: (params: { trigger_type: string; enabled?: boolean; channel?: string; delay_minutes?: number; google_review_url?: string | null }) => void;
  isUpdating: boolean;
}

function AutomationRow({ triggerType, automation, onUpdate, isUpdating }: AutomationRowProps) {
  const { t } = useTranslation();
  const enabled = automation?.enabled ?? false;
  const channel = automation?.channel ?? 'email';
  const delayMinutes = automation?.delay_minutes ?? 120;
  const [reviewUrl, setReviewUrl] = useState(automation?.google_review_url || '');

  const triggerKey = `campaigns.automations.triggers.${triggerType}`;
  const descKey = `campaigns.automations.triggers.${triggerType}Desc`;

  return (
    <section className="py-6 border-t border-glass-border-dark">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-deep-charcoal">
            {t(triggerKey)}
          </h3>
          <p className="text-sm text-stone-gray mt-1">
            {t(descKey)}
          </p>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-label={t(triggerKey)}
          aria-checked={enabled}
          disabled={isUpdating}
          onClick={() => onUpdate({ trigger_type: triggerType, enabled: !enabled })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2 ${
            enabled ? 'bg-emerald-600' : 'bg-border-gray'
          } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Expanded settings when enabled */}
      {enabled && (
        <div className="mt-5 pt-5 border-t border-glass-border-dark grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Channel */}
          <div>
            <label htmlFor={`automation-channel-${triggerType}`} className="block text-xs font-medium text-stone-gray mb-1">
              {t('campaigns.automations.channel')}
            </label>
            <select
              id={`automation-channel-${triggerType}`}
              value={channel}
              onChange={(e) => onUpdate({ trigger_type: triggerType, channel: e.target.value })}
              disabled={isUpdating}
              className="w-full text-sm border border-glass-border-input rounded-md px-3 py-1.5 bg-white/60 focus:outline-none focus:ring-1 focus:ring-burgundy"
            >
              {CHANNEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Delay */}
          <div>
            <label htmlFor={`automation-delay-${triggerType}`} className="block text-xs font-medium text-stone-gray mb-1">
              {t('campaigns.automations.delay')}
            </label>
            <select
              id={`automation-delay-${triggerType}`}
              value={delayMinutes}
              onChange={(e) => onUpdate({ trigger_type: triggerType, delay_minutes: Number(e.target.value) })}
              disabled={isUpdating}
              className="w-full text-sm border border-glass-border-input rounded-md px-3 py-1.5 bg-white/60 focus:outline-none focus:ring-1 focus:ring-burgundy"
            >
              <option value={60}>{t('campaigns.automations.delay1h')}</option>
              <option value={120}>{t('campaigns.automations.delay2h')}</option>
              <option value={240}>{t('campaigns.automations.delay4h')}</option>
              <option value={480}>{t('campaigns.automations.delay8h')}</option>
              <option value={1440}>{t('campaigns.automations.delay24h')}</option>
              <option value={10080}>{t('campaigns.automations.delay7d')}</option>
            </select>
          </div>

          {/* Google Review URL (only for review_request) */}
          {triggerType === 'review_request' && (
            <div className="sm:col-span-2">
              <label htmlFor={`automation-review-${triggerType}`} className="block text-xs font-medium text-stone-gray mb-1">
                {t('campaigns.automations.googleReviewUrl')}
              </label>
              <div className="flex gap-2">
                <input
                  id={`automation-review-${triggerType}`}
                  type="url"
                  value={reviewUrl}
                  onChange={(e) => setReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/..."
                  className="flex-1 text-sm border border-glass-border-input rounded-md px-3 py-1.5 bg-white/60 focus:outline-none focus:ring-1 focus:ring-burgundy"
                />
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onUpdate({ trigger_type: triggerType, google_review_url: reviewUrl || null })}
                  className="px-3 py-1.5 text-sm bg-burgundy text-white rounded-md hover:bg-burgundy-dark transition-colors disabled:opacity-50"
                >
                  {t('campaigns.automations.save')}
                </button>
              </div>
              <p className="text-xs text-stone-gray mt-1">
                {t('campaigns.automations.googleReviewUrlHint')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
