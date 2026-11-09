import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';
import { authFetch } from '../../services/api';

interface SyncFeedback {
  agent: boolean | null;
  knowledge: boolean | null;
}
type RefreshFeedback = 'updated' | 'skipped' | 'failed' | null;
const fields = ['agent_name', 'agent_greeting'] as const;
const inputStyle = 'w-full rounded-xl border border-glass-border-input bg-white/60 px-3 py-3 text-[15px] text-deep-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30 disabled:cursor-wait disabled:opacity-60';
const secondaryButton = 'min-h-11 rounded-full px-4 py-2 text-sm font-medium text-deep-charcoal underline underline-offset-4 hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30 disabled:cursor-not-allowed disabled:opacity-40';

export default function VoicePersonaPanel({ showProviderRefresh = true }: { showProviderRefresh?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: persona, isLoading, isError, isFetching, refetch } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback | null>(null);
  const [retryUpdates, setRetryUpdates] = useState<Partial<VoicePersona> | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<RefreshFeedback>(null);

  const updates: Partial<VoicePersona> = {};
  for (const field of fields) {
    if (field in pending && (pending[field] ?? '') !== (persona?.[field] ?? '')) {
      updates[field] = pending[field];
    }
  }
  const isDirty = Object.keys(updates).length > 0;
  const hasSyncFailure = syncFeedback?.agent === false || syncFeedback?.knowledge === false;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/elevenlabs-voice-settings?action=refresh_prompt', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || (!data.success && !data.skipped)) throw new Error('Refresh failed');
      return data as { success?: boolean; skipped?: boolean };
    },
    onSuccess: (data) => {
      if (data.skipped) {
        setRefreshFeedback('skipped');
        return;
      }
      setRefreshFeedback('updated');
      // This endpoint repairs saved instructions and first_message, not the KB.
      setSyncFeedback(previous => previous ? { ...previous, agent: true } : previous);
    },
    onError: () => setRefreshFeedback('failed'),
  });
  const busy = saveMutation.isPending || refreshMutation.isPending;

  const save = (submitted: Partial<VoicePersona>) => {
    if (busy || isError || Object.keys(submitted).length === 0) return;
    setSaveFailed(false);
    setRefreshFeedback(null);
    saveMutation.mutate(submitted, {
      onSuccess: (result) => {
        const failed = result.agent_synced === false || result.kb_synced === false;
        setSyncFeedback({ agent: result.agent_synced, knowledge: result.kb_synced });
        setRetryUpdates(failed ? submitted : null);
        // Only discard the submitted values. Never discard a newer draft value.
        setPending(previous => {
          const remaining = { ...previous };
          for (const field of fields) {
            if (field in submitted && previous[field] === submitted[field]) delete remaining[field];
          }
          return remaining;
        });
        if (!failed) toast.success(t('dashboard.voicePersona.savedInSeatable', 'Saved in Seatable.'));
      },
      onError: () => setSaveFailed(true),
    });
  };

  const getValue = (key: keyof VoicePersona) => (key in pending ? pending[key] : persona?.[key]) ?? '';
  const set = (key: keyof VoicePersona, value: string) => setPending(previous => ({ ...previous, [key]: value }));
  const heading = t('dashboard.voicePersona.sectionTitle', 'Name and greeting');

  if (isLoading) {
    return (
      <section aria-label={heading} aria-busy="true" className="mt-8 space-y-3 border-t border-glass-border-dark py-6 motion-safe:animate-pulse">
        <div className="h-4 w-40 rounded bg-soft-gray" />
        <div className="h-12 rounded-xl bg-soft-gray" />
        <div className="h-24 rounded-xl bg-soft-gray" />
      </section>
    );
  }

  if (isError || !persona) {
    return (
      <section aria-label={heading} className="mt-8 space-y-3 border-t border-glass-border-dark py-6">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{heading}</h2>
        <p role="alert" className="text-[15px] text-red-700">
          {t('dashboard.voicePersona.loadFailed', 'Could not load the saved name and greeting. Try again before editing.')}
        </p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className={secondaryButton}>
          {isFetching ? t('common.loading', 'Loading...') : t('dashboard.voicePersona.loadRetry', 'Try again')}
        </button>
      </section>
    );
  }

  return (
    <section aria-label={heading} className="mt-8 space-y-5 border-t border-glass-border-dark py-6">
      <div className="space-y-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{heading}</h2>
        <p id="persona-save-scope" className="text-[15px] leading-relaxed text-stone-gray">
          {t('dashboard.voicePersona.saveScope', 'This saves only the agent name and opening greeting. Voice and language are saved separately.')}
        </p>
      </div>
      <div className="space-y-4" aria-busy={busy}>
        <div>
          <label htmlFor="agent-name" className="mb-2 block text-sm font-medium text-deep-charcoal">
            {t('dashboard.voicePersona.agentName', 'Agent name')} <span className="font-normal text-muted-stone">{t('dashboard.voicePersona.max50', '(max 50 chars)')}</span>
          </label>
          <input id="agent-name" name="agent_name" type="text" maxLength={50} autoComplete="off"
            placeholder={t('placeholders.agentName', 'e.g. Sofia')} value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)} disabled={busy} className={inputStyle} />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="mb-2 block text-sm font-medium text-deep-charcoal">
            {t('dashboard.voicePersona.openingGreeting', 'Opening greeting')} <span className="font-normal text-muted-stone">{t('dashboard.voicePersona.max200', '(max 200 chars)')}</span>
          </label>
          <textarea id="agent-greeting" name="agent_greeting" rows={3} maxLength={200} autoComplete="off"
            placeholder={t('placeholders.agentGreeting', 'e.g. Welcome to our restaurant!')} value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)} disabled={busy} className={`${inputStyle} resize-y`} />
        </div>
      </div>
      {saveFailed && <p role="alert" className="text-sm text-red-700">
        {t('dashboard.voicePersona.saveErrorPersistent', 'Could not save. Your edits are still here. Try again.')}
      </p>}
      {syncFeedback && <div role={hasSyncFailure ? 'alert' : 'status'} className={`space-y-2 text-sm leading-relaxed ${hasSyncFailure ? 'text-amber-700' : 'text-stone-gray'}`}>
        <p>{t('dashboard.voicePersona.savedInSeatable', 'Saved in Seatable.')}</p>
        {isDirty && <p>{t('dashboard.voicePersona.lastSavedNotice', 'These results apply to the last saved changes, not your current edits.')}</p>}
        {syncFeedback.agent === false && <p>{t('dashboard.voicePersona.agentUpdateFailed', 'The voice agent did not update.')}</p>}
        {syncFeedback.knowledge === false && <p>{t('dashboard.voicePersona.knowledgeUpdateFailed', 'The menu and restaurant information did not update on the voice agent.')}</p>}
        {hasSyncFailure && <p>{t('dashboard.voicePersona.syncRetryHint', 'Retry the saved update to resend these saved changes and refresh the agent knowledge.')}</p>}
      </div>}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={() => save(updates)} disabled={!isDirty || busy} aria-describedby="persona-save-scope"
          className="min-h-11 rounded-full bg-burgundy px-5 py-3 text-sm font-semibold text-white hover:bg-burgundy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
          {saveMutation.isPending ? t('dashboard.voicePersona.saving', 'Saving...') : t('dashboard.voicePersona.saveNameGreeting', 'Save name and greeting')}
        </button>
        {hasSyncFailure && retryUpdates && <button type="button" onClick={() => { if (!isDirty) save(retryUpdates); }} disabled={isDirty || busy} className={secondaryButton}>
          {t('dashboard.voicePersona.retrySavedUpdate', 'Retry saved update')}
        </button>}
      </div>
      {showProviderRefresh && <div className="space-y-2 border-t border-glass-border-dark pt-4">
        <button type="button" onClick={() => { if (!isDirty && !busy) { setRefreshFeedback(null); refreshMutation.mutate(); } }}
          disabled={isDirty || busy} aria-describedby="persona-refresh-scope" className={secondaryButton}>
          {refreshMutation.isPending ? t('dashboard.voicePersona.reapplying', 'Reapplying...') : t('dashboard.voicePersona.reapplySavedGreeting', 'Reapply saved greeting')}
        </button>
        <p id="persona-refresh-scope" className="text-sm leading-relaxed text-muted-stone">
          {t('dashboard.voicePersona.reapplyScope', 'Reapplies the saved agent instructions and opening greeting. Does not update the menu or restaurant information.')}
        </p>
      </div>}
      {isDirty && (showProviderRefresh || hasSyncFailure) && <p className="text-sm text-muted-stone">
        {t('dashboard.voicePersona.saveBeforeRecovery', 'Save your edits before reapplying saved settings or retrying an update.')}
      </p>}
      {refreshFeedback && <p role={refreshFeedback === 'failed' ? 'alert' : 'status'} className={`text-sm leading-relaxed ${refreshFeedback === 'failed' ? 'text-red-700' : 'text-stone-gray'}`}>
        {refreshFeedback === 'updated' && t('dashboard.voicePersona.reapplied', 'Saved instructions and opening greeting reapplied to the voice agent.')}
        {refreshFeedback === 'skipped' && t('dashboard.voicePersona.reapplySkipped', 'The saved settings were not applied to a voice agent. Check the agent connection before retrying.')}
        {refreshFeedback === 'failed' && t('dashboard.voicePersona.reapplyFailed', 'Could not reapply the saved settings. Try again.')}
      </p>}
    </section>
  );
}
