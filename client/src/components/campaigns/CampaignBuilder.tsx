import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateWhatsAppCampaign, useSegmentCounts } from '../../hooks/useCampaigns';
import { useToast } from '../../contexts/ToastContext';
import SegmentPicker from './SegmentPicker';
import type { SegmentCounts } from '../../hooks/useCampaigns';

interface CampaignBuilderProps {
  onCreated: () => void;
  onCancel: () => void;
}

const TEMPLATES = [
  { value: 'seatable_promotion', labelKey: 'campaigns.templatePromotion' },
  { value: 'seatable_birthday', labelKey: 'campaigns.templateBirthday' },
  { value: 'seatable_reengagement', labelKey: 'campaigns.templateReengagement' },
] as const;

const MAX_MESSAGE_LENGTH = 1024;

export default function CampaignBuilder({ onCreated, onCancel }: CampaignBuilderProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const createMutation = useCreateWhatsAppCampaign();
  const { data: counts } = useSegmentCounts();

  const [name, setName] = useState('');
  const [segment, setSegment] = useState('all');
  const [template, setTemplate] = useState('seatable_promotion');
  const [message, setMessage] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const selectedCount = counts?.[segment as keyof SegmentCounts] ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        segment,
        message: message.trim(),
        template_name: template,
        scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success(t('campaigns.created'));
      onCreated();
    } catch (err) {
      console.error('[CampaignBuilder] create failed', err);
      toast.error(t('campaigns.createFailed', 'Failed to create campaign'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#E5E7EB] rounded-lg bg-white p-5 space-y-5"
    >
      {/* Campaign name */}
      <div>
        <label htmlFor="campaign-name" className="block text-sm font-medium text-deep-charcoal mb-1">
          {t('campaigns.campaignName')}
        </label>
        <input
          id="campaign-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('campaigns.campaignNamePlaceholder')}
          className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-deep-charcoal placeholder:text-stone-gray focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
          required
        />
      </div>

      {/* Segment picker */}
      <SegmentPicker value={segment} onChange={setSegment} />

      {/* Template selector */}
      <div>
        <label htmlFor="campaign-template" className="block text-sm font-medium text-deep-charcoal mb-1">
          {t('campaigns.template')}
        </label>
        <select
          id="campaign-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-deep-charcoal bg-white focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
        >
          {TEMPLATES.map((tpl) => (
            <option key={tpl.value} value={tpl.value}>
              {t(tpl.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* Message body */}
      <div>
        <label htmlFor="campaign-message" className="block text-sm font-medium text-deep-charcoal mb-1">
          {t('campaigns.message')}
        </label>
        <textarea
          id="campaign-message"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder={t('campaigns.messagePlaceholder')}
          rows={4}
          maxLength={MAX_MESSAGE_LENGTH}
          className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-deep-charcoal placeholder:text-stone-gray resize-none focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
        />
        <p className="text-xs text-stone-gray text-right mt-1">
          {message.length}/{MAX_MESSAGE_LENGTH}
        </p>
      </div>

      {/* Schedule toggle */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="send-mode"
              checked={!isScheduled}
              onChange={() => setIsScheduled(false)}
              className="accent-burgundy"
            />
            {t('campaigns.sendNow')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="send-mode"
              checked={isScheduled}
              onChange={() => setIsScheduled(true)}
              className="accent-burgundy"
            />
            {t('campaigns.schedule')}
          </label>
        </div>

        {isScheduled && (
          <div>
            <label htmlFor="campaign-schedule" className="block text-xs text-stone-gray mb-1">
              {t('campaigns.scheduleAt')}
            </label>
            <input
              id="campaign-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-1 focus:ring-burgundy focus:border-burgundy"
              required={isScheduled}
            />
          </div>
        )}
      </div>

      {/* Reach preview */}
      <p className="text-sm text-stone-gray">
        {t('campaigns.reachCount', { count: selectedCount })}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={createMutation.isPending || !name.trim()}
          className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white font-semibold rounded-full text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending
            ? t('campaigns.creating')
            : isScheduled
              ? t('campaigns.scheduleCampaign')
              : t('campaigns.createCampaign')
          }
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm text-stone-gray hover:text-deep-charcoal transition-colors"
        >
          {t('campaigns.cancel')}
        </button>
      </div>
    </form>
  );
}
