import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import VoiceSlider from './VoiceSlider';
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from './voiceTypes';

interface Props {
  settings: VoiceSettings;
  onSettingChange: (key: keyof VoiceSettings, value: number) => void;
  onReset: () => void;
}

/**
 * Voice tuning previously surfaced four ML-jargon sliders to a non-technical
 * audience: Stability, Similarity Boost, Style, Speed. We lead with three
 * named presets — Calm / Warm / Energetic — that map to specific settings
 * values. The granular sliders are still there for
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
  warm:      { ...DEFAULT_VOICE_SETTINGS },
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
  onSettingChange,
  onReset,
}: Props) {
  const { t } = useTranslation();
  const detectedPreset = useMemo(() => detectPreset(settings), [settings]);
  const [showTuning, setShowTuning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const canReset = (Object.keys(DEFAULT_VOICE_SETTINGS) as Array<keyof VoiceSettings>)
    .some((key) => Math.abs(settings[key] - DEFAULT_VOICE_SETTINGS[key]) > 0.001);

  const applyPreset = (key: PresetKey) => {
    const p = TUNING_PRESETS[key];
    onSettingChange('stability', p.stability);
    onSettingChange('similarity_boost', p.similarity_boost);
    onSettingChange('style', p.style);
  };

  const presets: Array<{ key: PresetKey; title: string; desc: string }> = [
    {
      key: 'calm',
      title: t('voiceTuning.preset.calm', 'Calm'),
      desc: t('voiceTuning.preset.calmDesc', 'Steady and reassuring. Best for confirming reservations.'),
    },
    {
      key: 'warm',
      title: t('voiceTuning.preset.warm', 'Warm'),
      desc: t('voiceTuning.preset.warmDesc', 'Friendly neighbourhood feel. The default for most restaurants.'),
    },
    {
      key: 'energetic',
      title: t('voiceTuning.preset.energetic', 'Lively'),
      desc: t('voiceTuning.preset.energeticDesc', 'Lively and expressive. Best for busy spots and bars.'),
    },
  ];
  const selectedTitle = presets.find(preset => preset.key === detectedPreset)?.title || t('voiceTuning.customLabel', 'Custom');
  const paceLabel = settings.speed < 0.95
    ? t('voiceTuning.paceSlow', 'Unhurried')
    : settings.speed > 1.05
      ? t('voiceTuning.paceFast', 'Brisk')
      : t('voiceTuning.paceNatural', 'Natural');

  return (
    <section className="min-w-0 py-4 font-brand text-brand-ink">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[150px_minmax(0,1fr)_auto]">
        <p role="heading" aria-level={2} className="col-start-1 row-start-1 font-brand text-[13px] font-medium text-brand-muted">{t('voiceTuning.toneAndPace', 'Tone & pace')}</p>
        <p className="col-start-1 row-start-2 min-w-0 text-[16px] font-medium leading-6 md:col-start-2 md:row-start-1">{selectedTitle} <span className="font-normal text-brand-muted">· {paceLabel}</span></p>
        <button
          type="button"
          onClick={() => setShowTuning(value => !value)}
          aria-expanded={showTuning}
          aria-controls="voice-tuning-controls"
          className="col-start-2 row-span-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-[13px] font-medium text-brand-action hover:bg-brand-action/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action md:col-start-3 md:row-span-1 md:row-start-1"
        >
          <span className="sm:hidden">{showTuning ? t('voiceTuning.closeShort', 'Close') : t('voiceTuning.adjustShort', 'Adjust')}</span>
          <span className="hidden sm:inline">{showTuning ? t('voiceTuning.closeTuning', 'Close controls') : t('voiceTuning.editTuning', 'Adjust tone & pace')}</span>
        </button>
      </div>

      <div id="voice-tuning-controls" hidden={!showTuning} className={showTuning ? 'mt-3 space-y-4 pt-2' : 'hidden'}>
        <div>
          <div className="space-y-1" role="group" aria-label={t('voiceTuning.title', 'How your AI sounds')}>
            {presets.map(({ key, title, desc }) => {
              const isSelected = detectedPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  aria-pressed={isSelected}
                  className={`flex min-h-[64px] w-full items-center gap-3 border-l-2 py-2 pl-3 pr-1 text-left hover:text-brand-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action ${isSelected ? 'border-brand-action' : 'border-transparent'}`}
                >
                  <span aria-hidden="true" className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${isSelected ? 'border-brand-action' : 'border-brand-line'}`}>
                    {isSelected && <span className="size-[8px] rounded-full bg-brand-action" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[15px] leading-5 ${isSelected ? 'font-semibold text-brand-ink' : 'font-medium text-brand-ink'}`}>{title}</span>
                    <span className="block text-[12px] leading-4 text-brand-muted">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-0">
          <VoiceSlider
            label={t('voiceTuning.speed', 'Speaking speed')}
            value={settings.speed}
            min={0.7} max={1.2} step={0.05}
            lowLabel={t('voiceTuning.slow', 'Slow')} highLabel={t('voiceTuning.fast', 'Fast')}
            formatValue={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => onSettingChange('speed', v)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            aria-controls="voice-advanced-controls"
            className="min-h-10 text-xs font-medium text-brand-muted underline underline-offset-4 hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
          >
            {showAdvanced
              ? t('voiceTuning.hideAdvanced', 'Hide advanced controls')
              : t('voiceTuning.showAdvanced', 'Show advanced controls')}
          </button>
          {canReset && <button type="button" onClick={() => { setShowAdvanced(false); onReset(); }} className="min-h-10 text-xs font-medium text-brand-action underline underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
            {t('voiceTuning.resetToDefaults', 'Reset to defaults')}
          </button>}
        </div>

        <div id="voice-advanced-controls" hidden={!showAdvanced} className={showAdvanced ? 'grid max-w-3xl grid-cols-1 gap-x-10 gap-y-6 border-t border-brand-line pt-5 md:grid-cols-2' : 'hidden'}>
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

      </div>
    </section>
  );
}
