import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import VoiceSlider from './VoiceSlider';
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from './voiceTypes';

interface Props {
  settings: VoiceSettings;
  currentVoiceId: string;
  loadingAudio: string | null;
  onSettingChange: (key: keyof VoiceSettings, value: number) => void;
  onApplyPreset: (preset: Pick<VoiceSettings, 'stability' | 'similarity_boost' | 'style'>) => void;
  onReset: () => void;
  onPreview: () => void;
}

/**
 * Voice tuning previously surfaced four ML-jargon sliders to a non-technical
 * audience: Stability, Similarity Boost, Style, Speed. João had no idea
 * which way to move "Similarity Boost". Now we lead with three named
 * presets — Calm / Warm / Energetic — that map to ElevenLabs setting
 * triples used in production. The granular sliders are still there for
 * users who want to fine-tune, hidden behind an "Advanced" disclosure.
 *
 * Speed stays as a separate slider because it's the only one with an
 * obvious user mental model ("Slow ↔ Fast").
 */

type PresetKey = 'calm' | 'warm' | 'energetic';

const TUNING_PRESETS: Record<PresetKey, { stability: number; similarity_boost: number; style: number }> = {
  // Reliable, low-variance reading — best for confirmations + numbers.
  calm:      { stability: 0.75, similarity_boost: 0.85, style: 0.10 },
  // Friendly, mid-variance — the default for most restaurants.
  warm:      { stability: 0.55, similarity_boost: 0.80, style: 0.25 },
  // Higher variance + style — punchier, more expressive replies.
  energetic: { stability: 0.35, similarity_boost: 0.75, style: 0.55 },
};

function detectPreset(settings: VoiceSettings): PresetKey | null {
  for (const [key, preset] of Object.entries(TUNING_PRESETS) as Array<[PresetKey, typeof TUNING_PRESETS[PresetKey]]>) {
    if (
      Math.abs(settings.stability - preset.stability) < 0.04 &&
      Math.abs(settings.similarity_boost - preset.similarity_boost) < 0.04 &&
      Math.abs(settings.style - preset.style) < 0.04
    ) return key;
  }
  return null;
}

export default function VoiceTuningPanel({
  settings,
  currentVoiceId,
  loadingAudio,
  onSettingChange,
  onApplyPreset,
  onReset,
  onPreview,
}: Props) {
  const { t } = useTranslation();
  const detectedPreset = useMemo(() => detectPreset(settings), [settings]);
  const isDefault = settings.stability === DEFAULT_VOICE_SETTINGS.stability
    && settings.similarity_boost === DEFAULT_VOICE_SETTINGS.similarity_boost
    && settings.style === DEFAULT_VOICE_SETTINGS.style;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyPreset = (key: PresetKey) => {
    onApplyPreset(TUNING_PRESETS[key]);
  };

  const presetCards: Array<{ key: PresetKey; title: string; desc: string }> = [
    {
      key: 'calm',
      title: t('voiceTuning.preset.calm', 'Calm'),
      desc: t('voiceTuning.preset.calmDesc', 'Steady and reassuring. Best for confirming reservations.'),
    },
    {
      key: 'warm',
      title: t('voiceTuning.preset.warm', 'Warm'),
      desc: t('voiceTuning.preset.warmDesc', 'Friendly neighbourhood feel. A good choice for most restaurants.'),
    },
    {
      key: 'energetic',
      title: t('voiceTuning.preset.energetic', 'Energetic'),
      desc: t('voiceTuning.preset.energeticDesc', 'Lively and expressive. Best for busy spots and bars.'),
    },
  ];

  return (
    <section className="overflow-hidden pb-5 border-b border-glass-border-dark">
      <div className="flex items-center justify-between py-5 border-b border-glass-border-dark">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('voiceTuning.title', 'How your AI sounds')}</span>
        <button type="button" onClick={onReset} className="text-xs text-burgundy hover:underline">
          {t('voiceTuning.resetToDefaults', 'Reset to defaults')}
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('voiceTuning.title', 'How your AI sounds')}>
          {presetCards.map(({ key, title }) => {
            const isSelected = detectedPreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                aria-pressed={isSelected}
                className={`min-h-11 rounded-full border px-2 py-2 text-center text-xs font-medium transition-colors sm:text-sm ${
                  isSelected
                    ? 'border-deep-charcoal bg-soft-gray text-deep-charcoal'
                    : 'border-glass-border-dark hover:border-muted-stone'
                }`}
              >
                {title}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-muted-stone">
          {detectedPreset === null
            ? isDefault
              ? t('voiceTuning.default', 'Default tuning')
              : t('voiceTuning.custom', 'Custom tuning')
            : presetCards.find((preset) => preset.key === detectedPreset)?.desc}
        </p>

        {/* Speed always-visible — only slider with an obvious mental model. */}
        <div className="max-w-md">
          <VoiceSlider
            label={t('voiceTuning.speed', 'Speaking speed')}
            value={settings.speed}
            min={0.7} max={1.2} step={0.05}
            lowLabel={t('voiceTuning.slow', 'Slow')} highLabel={t('voiceTuning.fast', 'Fast')}
            formatValue={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => onSettingChange('speed', v)}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="text-xs text-muted-stone hover:text-deep-charcoal underline underline-offset-2"
        >
          {showAdvanced
            ? t('voiceTuning.hideAdvanced', 'Hide advanced controls')
            : t('voiceTuning.showAdvanced', 'Show advanced controls')}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <VoiceSlider
              label={t('voiceTuning.stability', 'Stability')}
              value={settings.stability}
              min={0} max={1} step={0.05}
              lowLabel={t('voiceTuning.variable', 'Variable')} highLabel={t('voiceTuning.stable', 'Stable')}
              onChange={(v) => onSettingChange('stability', v)}
            />
            <VoiceSlider
              label={t('voiceTuning.similarityBoost', 'Voice match')}
              value={settings.similarity_boost}
              min={0} max={1} step={0.05}
              lowLabel={t('voiceTuning.low', 'Low')} highLabel={t('voiceTuning.high', 'High')}
              onChange={(v) => onSettingChange('similarity_boost', v)}
            />
            <VoiceSlider
              label={t('voiceTuning.style', 'Expressiveness')}
              value={settings.style}
              min={0} max={1} step={0.05}
              lowLabel={t('voiceTuning.none', 'Neutral')} highLabel={t('voiceTuning.expressive', 'Expressive')}
              onChange={(v) => onSettingChange('style', v)}
            />
          </div>
        )}

        <div className="pt-4 border-t border-glass-border-dark">
          <button
            type="button"
            onClick={onPreview}
            disabled={!currentVoiceId || loadingAudio !== null}
            className="px-5 py-2.5 text-sm font-medium bg-soft-gray hover:bg-border-gray rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loadingAudio ? <Spinner size="sm" /> : <ThiingsIcon name="play" pxSize={16} />}
            {t('voiceTuning.previewWithSettings', 'Hear how it sounds')}
          </button>
        </div>
      </div>
    </section>
  );
}
