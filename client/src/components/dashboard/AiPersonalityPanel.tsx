import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiPersonality, useSaveAiPersonality } from '../../hooks/useAiPersonality';
import type { AiPersonality } from '../../hooks/useAiPersonality';
import { useToast } from '../../contexts/ToastContext';

const HUMOR_OPTIONS: AiPersonality['humor_type'][] = ['none', 'light', 'witty', 'warm', 'playful'];
const COMM_STYLE_OPTIONS: AiPersonality['communication_style'][] = ['formal', 'casual', 'friendly_professional'];
const TONE_OPTIONS: AiPersonality['language_tone'][] = ['enthusiastic', 'calm', 'neutral', 'warm'];
const MAX_TRAITS = 5;

const SUGGESTED_TRAITS = [
  'friendly', 'professional', 'empathetic', 'energetic',
  'patient', 'knowledgeable', 'caring', 'humorous',
  'sophisticated', 'welcoming', 'attentive', 'cheerful',
];

/**
 * Persona presets. The previous version asked João to combine 5 humor types
 * × 3 communication styles × 4 tones × 5 traits from a pool of 12 — a
 * factor-explosion of choices nobody knows how to navigate. Now we lead with
 * 4 named presets that fill in all 4 dimensions at once, and keep the
 * granular pickers behind a "Customise" disclosure for power users.
 *
 * The presets map to existing enum values so there's zero API/data-model
 * change. An auto-detect pass on mount finds the closest preset to the
 * user's current saved state.
 */
type PresetKey = 'neighborhood' | 'fine_dining' | 'fast_efficient' | 'family_friendly';

const PERSONA_PRESETS: Record<PresetKey, {
  humor_type: AiPersonality['humor_type'];
  communication_style: AiPersonality['communication_style'];
  language_tone: AiPersonality['language_tone'];
  traits: string[];
}> = {
  neighborhood: {
    humor_type: 'warm',
    communication_style: 'casual',
    language_tone: 'warm',
    traits: ['friendly', 'welcoming', 'caring'],
  },
  fine_dining: {
    humor_type: 'none',
    communication_style: 'formal',
    language_tone: 'calm',
    traits: ['professional', 'sophisticated', 'knowledgeable'],
  },
  fast_efficient: {
    humor_type: 'light',
    communication_style: 'friendly_professional',
    language_tone: 'neutral',
    traits: ['attentive', 'professional', 'patient'],
  },
  family_friendly: {
    humor_type: 'playful',
    communication_style: 'casual',
    language_tone: 'enthusiastic',
    traits: ['caring', 'cheerful', 'welcoming'],
  },
};

function detectPreset(p: Partial<AiPersonality>): PresetKey | null {
  for (const [key, preset] of Object.entries(PERSONA_PRESETS) as Array<[PresetKey, typeof PERSONA_PRESETS[PresetKey]]>) {
    const traits = p.personality_traits ?? [];
    if (
      p.humor_type === preset.humor_type &&
      p.communication_style === preset.communication_style &&
      p.language_tone === preset.language_tone &&
      traits.length === preset.traits.length &&
      preset.traits.every((tr) => traits.includes(tr))
    ) return key;
  }
  return null;
}

export default function AiPersonalityPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: personality, isLoading } = useAiPersonality();
  const saveMutation = useSaveAiPersonality();
  const [pending, setPending] = useState<Partial<AiPersonality>>({});
  const [customTrait, setCustomTrait] = useState('');
  const [showCustomize, setShowCustomize] = useState(false);

  const getValue = <K extends keyof AiPersonality>(key: K): AiPersonality[K] =>
    (key in pending ? pending[key] : personality?.[key]) as AiPersonality[K] ?? getDefault(key);

  const set = <K extends keyof AiPersonality>(key: K, value: AiPersonality[K]) =>
    setPending(p => ({ ...p, [key]: value }));

  const isDirty = Object.keys(pending).length > 0;

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate(pending, {
      onSuccess: () => { toast.success(t('dashboard.aiPersonality.saved', 'AI personality saved')); setPending({}); },
      onError: () => toast.error(t('dashboard.aiPersonality.saveFailed', 'Failed to save AI personality')),
    });
  };

  const currentTraits = getValue('personality_traits') || [];

  const merged: Partial<AiPersonality> = {
    humor_type: getValue('humor_type'),
    communication_style: getValue('communication_style'),
    language_tone: getValue('language_tone'),
    personality_traits: currentTraits,
  };
  const detectedPreset = useMemo(() => detectPreset(merged), [merged.humor_type, merged.communication_style, merged.language_tone, currentTraits.join('|')]);

  const applyPreset = (key: PresetKey) => {
    const p = PERSONA_PRESETS[key];
    setPending((prev) => ({
      ...prev,
      humor_type: p.humor_type,
      communication_style: p.communication_style,
      language_tone: p.language_tone,
      personality_traits: [...p.traits],
    }));
  };

  const toggleTrait = (trait: string) => {
    const current = [...currentTraits];
    const idx = current.indexOf(trait);
    if (idx >= 0) {
      set('personality_traits', [...current.slice(0, idx), ...current.slice(idx + 1)]);
    } else if (current.length < MAX_TRAITS) {
      set('personality_traits', [...current, trait]);
    }
  };

  const addCustomTrait = () => {
    const trimmed = customTrait.trim();
    if (!trimmed || currentTraits.length >= MAX_TRAITS || currentTraits.includes(trimmed)) return;
    set('personality_traits', [...currentTraits, trimmed]);
    setCustomTrait('');
  };

  if (isLoading) {
    return (
      <div className="py-5 border-t border-[#E5E7EB] mt-8 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-48" />
        <div className="h-10 bg-gray-100 rounded" />
        <div className="h-10 bg-gray-100 rounded" />
        <div className="h-10 bg-gray-100 rounded" />
      </div>
    );
  }

  const presetCards: Array<{ key: PresetKey; title: string; desc: string }> = [
    { key: 'neighborhood',     title: t('dashboard.aiPersonality.preset.neighborhood',     'Neighbourhood spot'),  desc: t('dashboard.aiPersonality.preset.neighborhoodDesc',     'Warm, casual, like a regular host who knows the guests.') },
    { key: 'fine_dining',      title: t('dashboard.aiPersonality.preset.fineDining',       'Upscale fine dining'), desc: t('dashboard.aiPersonality.preset.fineDiningDesc',       'Formal and refined. Calm, professional, never playful.') },
    { key: 'fast_efficient',   title: t('dashboard.aiPersonality.preset.fastEfficient',    'Fast & efficient'),    desc: t('dashboard.aiPersonality.preset.fastEfficientDesc',    'Direct and helpful. Best for high-volume lunch spots and counters.') },
    { key: 'family_friendly',  title: t('dashboard.aiPersonality.preset.familyFriendly',   'Family-friendly'),     desc: t('dashboard.aiPersonality.preset.familyFriendlyDesc',   'Cheerful and playful. Great for places with kids and birthdays.') },
  ];

  return (
    <div className="py-5 border-t border-[#E5E7EB] mt-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">
            {t('dashboard.aiPersonality.title', 'AI personality')}
          </h2>
          <p className="text-xs text-warm-stone mt-0.5">
            {t('dashboard.aiPersonality.description', 'Pick a style and the AI will match it on calls and WhatsApp.')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMutation.isPending ? t('dashboard.aiPersonality.saving', 'Saving...') : t('common.save', 'Save')}
        </button>
      </div>

      {/* Persona presets - the primary choice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {presetCards.map(({ key, title, desc }) => {
          const isSelected = detectedPreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                isSelected
                  ? 'border-burgundy bg-burgundy/5'
                  : 'border-border-gray hover:border-muted-stone'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-deep-charcoal">{title}</span>
                {isSelected && (
                  <span className="text-[10px] font-medium text-burgundy bg-burgundy/10 px-2 py-0.5 rounded-full">
                    {t('dashboard.aiPersonality.preset.selected', 'Current')}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-gray">{desc}</p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowCustomize((v) => !v)}
        className="text-xs text-muted-stone hover:text-deep-charcoal underline underline-offset-2"
      >
        {showCustomize
          ? t('dashboard.aiPersonality.hideCustomize', 'Hide fine controls')
          : t('dashboard.aiPersonality.showCustomize', 'Customise further…')}
      </button>

      {showCustomize && (
        <div className="space-y-5">
          {/* Humor Type */}
          <fieldset>
            <legend className="block text-xs font-medium text-warm-stone mb-2">
              {t('dashboard.aiPersonality.humorType', 'Humor type')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {HUMOR_OPTIONS.map(option => (
                <label
                  key={option}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    getValue('humor_type') === option
                      ? 'border-burgundy bg-burgundy/5 text-burgundy'
                      : 'border-border-gray text-warm-stone hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="humor_type"
                    value={option}
                    checked={getValue('humor_type') === option}
                    onChange={() => set('humor_type', option)}
                    className="sr-only"
                  />
                  {t(`dashboard.aiPersonality.humor.${option}`, option)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Communication Style */}
          <fieldset>
            <legend className="block text-xs font-medium text-warm-stone mb-2">
              {t('dashboard.aiPersonality.communicationStyle', 'Communication style')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {COMM_STYLE_OPTIONS.map(option => (
                <label
                  key={option}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    getValue('communication_style') === option
                      ? 'border-burgundy bg-burgundy/5 text-burgundy'
                      : 'border-border-gray text-warm-stone hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="communication_style"
                    value={option}
                    checked={getValue('communication_style') === option}
                    onChange={() => set('communication_style', option)}
                    className="sr-only"
                  />
                  {t(`dashboard.aiPersonality.commStyle.${option}`, option.replace(/_/g, ' '))}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Language Tone */}
          <fieldset>
            <legend className="block text-xs font-medium text-warm-stone mb-2">
              {t('dashboard.aiPersonality.languageTone', 'Language tone')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {TONE_OPTIONS.map(option => (
                <label
                  key={option}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    getValue('language_tone') === option
                      ? 'border-burgundy bg-burgundy/5 text-burgundy'
                      : 'border-border-gray text-warm-stone hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="language_tone"
                    value={option}
                    checked={getValue('language_tone') === option}
                    onChange={() => set('language_tone', option)}
                    className="sr-only"
                  />
                  {t(`dashboard.aiPersonality.tone.${option}`, option)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Personality Traits */}
          <div>
            <label className="block text-xs font-medium text-warm-stone mb-2">
              {t('dashboard.aiPersonality.personalityTraits', 'Personality traits')}
              <span className="text-gray-400 ml-1">({currentTraits.length}/{MAX_TRAITS})</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SUGGESTED_TRAITS.map(trait => {
                const isSelected = currentTraits.includes(trait);
                return (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => toggleTrait(trait)}
                    disabled={!isSelected && currentTraits.length >= MAX_TRAITS}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-burgundy text-white'
                        : 'bg-soft-gray text-warm-stone hover:bg-border-gray disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {t(`dashboard.aiPersonality.trait.${trait}`, trait)}
                  </button>
                );
              })}
            </div>
            {/* Custom traits display */}
            {currentTraits.filter(tr => !SUGGESTED_TRAITS.includes(tr)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {currentTraits.filter(tr => !SUGGESTED_TRAITS.includes(tr)).map(trait => (
                  <button
                    key={trait}
                    type="button"
                    onClick={() => toggleTrait(trait)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-burgundy text-white transition-colors"
                  >
                    {trait} &times;
                  </button>
                ))}
              </div>
            )}
            {/* Custom trait input */}
            {currentTraits.length < MAX_TRAITS && (
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={50}
                  placeholder={t('dashboard.aiPersonality.customTraitPlaceholder', 'Add custom trait...')}
                  value={customTrait}
                  onChange={e => setCustomTrait(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTrait(); } }}
                  className="flex-1 border border-border-gray rounded-lg px-3 py-1.5 text-xs text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
                />
                <button
                  type="button"
                  onClick={addCustomTrait}
                  disabled={!customTrait.trim()}
                  className="px-3 py-1.5 border border-border-gray hover:bg-soft-gray text-warm-stone text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {t('common.add', 'Add')}
                </button>
              </div>
            )}
          </div>

          {/* Verbal Quirks — renamed in copy from the previous "Verbal Quirks"
              which read as a clinical/linguistic term to a non-technical
              owner. Now: "Catchphrases the AI should use". */}
          <div>
            <label htmlFor="verbal-quirks" className="block text-xs font-medium text-warm-stone mb-1">
              {t('dashboard.aiPersonality.verbalQuirks', 'Catchphrases the AI should use')}
              <span className="text-gray-400 ml-1">{t('dashboard.aiPersonality.max300', '(max 300 chars)')}</span>
            </label>
            <p className="text-[11px] text-muted-stone mb-2">
              {t('dashboard.aiPersonality.verbalQuirksHint', 'The AI will sprinkle these naturally into conversations, not force them every time.')}
            </p>
            <textarea
              id="verbal-quirks"
              maxLength={300}
              rows={2}
              placeholder={t('dashboard.aiPersonality.verbalQuirksPlaceholder', 'e.g. uses Brazilian slang, always says "com certeza", ends messages with a food emoji')}
              value={getValue('verbal_quirks') || ''}
              onChange={e => set('verbal_quirks', e.target.value)}
              className="w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getDefault<K extends keyof AiPersonality>(key: K): AiPersonality[K] {
  const defaults: AiPersonality = {
    humor_type: 'warm',
    personality_traits: [],
    communication_style: 'friendly_professional',
    verbal_quirks: '',
    language_tone: 'warm',
  };
  return defaults[key];
}
