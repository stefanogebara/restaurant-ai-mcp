import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import VoiceSlider from './VoiceSlider';
import type { VoiceSettings } from './voiceTypes';

interface Props {
  settings: VoiceSettings;
  currentVoiceId: string;
  loadingAudio: string | null;
  onSettingChange: (key: keyof VoiceSettings, value: number) => void;
  onReset: () => void;
  onPreview: () => void;
}

export default function VoiceTuningPanel({
  settings,
  currentVoiceId,
  loadingAudio,
  onSettingChange,
  onReset,
  onPreview,
}: Props) {
  const { t } = useTranslation();

  return (
    <section className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold">{t('voiceTuning.title', 'Voice Tuning')}</span>
        <button onClick={onReset} className="text-xs text-burgundy hover:underline">
          {t('voiceTuning.resetToDefaults', 'Reset to defaults')}
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <VoiceSlider
            label={t('voiceTuning.stability', 'Stability')}
            value={settings.stability}
            min={0} max={1} step={0.05}
            lowLabel={t('voiceTuning.variable', 'Variable')} highLabel={t('voiceTuning.stable', 'Stable')}
            onChange={(v) => onSettingChange('stability', v)}
          />
          <VoiceSlider
            label={t('voiceTuning.similarityBoost', 'Similarity Boost')}
            value={settings.similarity_boost}
            min={0} max={1} step={0.05}
            lowLabel={t('voiceTuning.low', 'Low')} highLabel={t('voiceTuning.high', 'High')}
            onChange={(v) => onSettingChange('similarity_boost', v)}
          />
          <VoiceSlider
            label={t('voiceTuning.style', 'Style')}
            value={settings.style}
            min={0} max={1} step={0.05}
            lowLabel={t('voiceTuning.none', 'None')} highLabel={t('voiceTuning.expressive', 'Expressive')}
            onChange={(v) => onSettingChange('style', v)}
          />
          <VoiceSlider
            label={t('voiceTuning.speed', 'Speed')}
            value={settings.speed}
            min={0.7} max={1.2} step={0.05}
            lowLabel={t('voiceTuning.slow', 'Slow')} highLabel={t('voiceTuning.fast', 'Fast')}
            formatValue={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => onSettingChange('speed', v)}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-border-gray">
          <button
            type="button"
            onClick={onPreview}
            disabled={!currentVoiceId || loadingAudio !== null}
            className="px-5 py-2.5 text-sm font-medium bg-soft-gray hover:bg-border-gray rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loadingAudio ? <Spinner size="sm" /> : <ThiingsIcon name="play" pxSize={16} />}
            {t('voiceTuning.previewWithSettings', 'Preview with settings')}
          </button>
        </div>
      </div>
    </section>
  );
}
