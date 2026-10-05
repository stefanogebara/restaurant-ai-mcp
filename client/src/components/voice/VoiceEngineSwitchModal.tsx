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
      <p className="mb-6 text-sm leading-6 text-brand-muted">
        {t('voiceEngine.switchConfirmation', 'Are you sure you want to switch to {{engine}}? This will change how incoming calls are handled.', { engine: targetLabel })}
      </p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-brand-line px-4 py-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand-action"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-brand-action px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-ink"
        >
          {t('voiceEngine.switchButton', 'Switch Engine')}
        </button>
      </div>
    </Modal>
  );
}
