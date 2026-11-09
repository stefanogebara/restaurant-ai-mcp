import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { OPENAI_VOICES } from './voiceConstants';

interface Props {
  currentOpenAIVoice: string;
  onSelect: (voiceId: string) => void;
}

export default function OpenAIVoicePicker({ currentOpenAIVoice, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <section className="py-5 border-b border-glass-border-dark">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-4 flex items-center gap-2">
        <ThiingsIcon name="volume" pxSize={20} />
        {t('voiceEngine.chooseDirectVoice')}
      </h2>

      <p className="mb-4 text-sm text-muted-stone">{t('voiceEngine.directPreviewHint')}</p>
      <div role="group" aria-label={t('voiceEngine.chooseDirectVoice')} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {OPENAI_VOICES.map((voice) => (
          <button
            key={voice.id}
            type="button"
            onClick={() => onSelect(voice.id)}
            aria-pressed={currentOpenAIVoice === voice.id}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentOpenAIVoice === voice.id
                ? 'border-deep-charcoal bg-soft-gray'
                : 'border-glass-border-dark hover:border-muted-stone'
            }`}
          >
            <p className="text-sm font-semibold text-deep-charcoal">{voice.name}</p>
            <p className="text-xs text-stone-gray mt-1">{t(`voiceEngine.directDescriptions.${voice.id}`, voice.description)}</p>
            {currentOpenAIVoice === voice.id && (
              <span className="inline-block mt-2 rounded-full bg-soft-gray px-2 py-1 text-xs font-medium text-stone-gray">{t('voiceEngine.selectedVoice')}</span>
            )}
          </button>
        ))}
      </div>


    </section>
  );
}
