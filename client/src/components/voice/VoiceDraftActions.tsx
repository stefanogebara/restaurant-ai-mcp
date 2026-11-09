import { useTranslation } from 'react-i18next';
import Spinner from '../common/Spinner';

interface Props { isSaving: boolean; onSave: () => void; onDiscard: () => void }

export default function VoiceDraftActions({ isSaving, onSave, onDiscard }: Props) {
  const { t } = useTranslation();
  return (
    <div className="liquid-capsule fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 sm:static sm:inset-auto" aria-busy={isSaving}>
      <p id="voice-draft-state" aria-live="polite" className="mb-2 text-xs text-muted-stone">
        {t('voiceSettings.draftHint')}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDiscard} disabled={isSaving}
          className="min-h-11 rounded-full px-3 text-sm text-stone-gray hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 disabled:opacity-40">
          {t('voiceSettings.discardChanges')}
        </button>
        <button type="button" onClick={onSave} disabled={isSaving} aria-describedby="voice-draft-state"
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-burgundy px-5 py-2.5 text-sm font-semibold text-white hover:bg-burgundy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 disabled:cursor-wait disabled:opacity-60">
          {isSaving && <Spinner size="sm" className="border-white border-t-white/30" />}
          {isSaving ? t('voiceSettings.saving') : t('voiceSettings.saveChanges')}
        </button>
      </div>
    </div>
  );
}
