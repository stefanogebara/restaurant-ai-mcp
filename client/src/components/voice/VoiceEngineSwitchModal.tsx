import Modal from '../common/Modal';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

interface Props {
  isOpen: boolean;
  engineSwitchTarget: VoiceEngineSettings['voice_engine'] | null;
  onConfirm: () => void;
  onClose: () => void;
}

export default function VoiceEngineSwitchModal({ isOpen, engineSwitchTarget, onConfirm, onClose }: Props) {
  const targetLabel = engineSwitchTarget === 'openai_realtime' ? 'OpenAI Realtime' : 'ElevenLabs';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Switch Voice Engine?" size="sm">
      <p className="text-sm text-stone-gray mb-6">
        Are you sure you want to switch to{' '}
        <span className="font-semibold text-deep-charcoal">{targetLabel}</span>?
        This will change how incoming calls are handled.
      </p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-5 py-2 text-sm font-semibold bg-burgundy hover:bg-burgundy-dark text-white rounded-xl transition-colors"
        >
          Switch Engine
        </button>
      </div>
    </Modal>
  );
}
