import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

interface Props {
  isOpen: boolean;
  engineSwitchTarget: VoiceEngineSettings['voice_engine'] | null;
  onConfirm: () => void;
  onClose: () => void;
}

export default function VoiceEngineSwitchModal({ isOpen, engineSwitchTarget, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const targetLabel = engineSwitchTarget === 'openai_realtime' ? 'OpenAI Realtime' : 'ElevenLabs';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('voiceEngine.switchTitle', 'Switch Voice Engine?')} size="sm">
      <p className="text-sm text-stone-gray mb-6">
        {t('voiceEngine.switchConfirmation', 'Are you sure you want to switch to {{engine}}? This will change how incoming calls are handled.', { engine: targetLabel })}
      </p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-5 py-2 text-sm font-semibold bg-burgundy hover:bg-burgundy-dark text-white rounded-xl transition-colors"
        >
          {t('voiceEngine.switchButton', 'Switch Engine')}
        </button>
      </div>
    </Modal>
  );
}
