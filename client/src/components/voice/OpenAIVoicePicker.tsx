import ThiingsIcon from '../common/ThiingsIcon';
import { OPENAI_VOICES } from './voiceConstants';

interface Props {
  currentOpenAIVoice: string;
  savedOpenAIVoice: string | undefined;
  onSelect: (voiceId: string) => void;
}

export default function OpenAIVoicePicker({ currentOpenAIVoice, savedOpenAIVoice, onSelect }: Props) {
  return (
    <section className="py-5 border-b border-[#E5E7EB]">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4 flex items-center gap-2">
        <ThiingsIcon name="volume" pxSize={20} />
        OpenAI Voice
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {OPENAI_VOICES.map((voice) => (
          <button
            key={voice.id}
            type="button"
            onClick={() => onSelect(voice.id)}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentOpenAIVoice === voice.id
                ? 'border-burgundy bg-burgundy/5'
                : 'border-border-gray hover:border-muted-stone'
            }`}
          >
            <p className="text-sm font-semibold text-deep-charcoal">{voice.name}</p>
            <p className="text-xs text-stone-gray mt-1">{voice.description}</p>
            {currentOpenAIVoice === voice.id && (
              <span className="inline-block mt-2 text-xs font-medium text-burgundy">Selected</span>
            )}
          </button>
        ))}
      </div>

      {currentOpenAIVoice !== savedOpenAIVoice && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-600/10 rounded-xl px-3 py-2">
          Voice change pending. Click "Save Changes" to apply.
        </p>
      )}
    </section>
  );
}
