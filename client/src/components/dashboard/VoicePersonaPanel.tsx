import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona, VoicePersonaSaveResult } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';

export default function VoicePersonaPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: persona, isLoading } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});
  const [syncStatus, setSyncStatus] = useState<'synced' | 'partial' | null>(null);
  const [lastSaved, setLastSaved] = useState<VoicePersona | null>(null);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/elevenlabs-voice-settings?action=refresh_prompt', { method: 'POST' });
      const data = await res.json();
      if (!data.success && !data.skipped) throw new Error(data.error || 'Refresh failed');
      return data;
    },
    onSuccess: (data) => {
      if (data.skipped) toast.info(t('dashboard.voicePersona.skipped', 'Skipped: {{reason}}', { reason: data.reason || t('dashboard.voicePersona.noAgentConfigured', 'no agent configured') }));
      else toast.success(t('dashboard.voicePersona.refreshSuccess', 'Agent prompt refreshed successfully'));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('dashboard.voicePersona.refreshFailed', 'Failed to refresh prompt')),
  });

  const getValue = (key: keyof VoicePersona): string =>
    ((key in pending ? pending[key] : persona?.[key]) ?? '') as string;

  const set = (key: keyof VoicePersona, value: string) =>
    setPending(p => ({ ...p, [key]: value }));

  const isDirty = Object.keys(pending).length > 0;

  const savePersona = (updates: Partial<VoicePersona>) => {
    saveMutation.mutate(updates, {
      onSuccess: (result: VoicePersonaSaveResult) => {
        setLastSaved({ agent_name: result.agent_name, agent_greeting: result.agent_greeting });
        setPending({});
        if (result.kb_synced === true && result.prompt_synced === true) {
          setSyncStatus('synced');
          toast.success(t('dashboard.voicePersona.savedAndSynced', 'Saved in Seatable and synced with the voice agent'));
        } else {
          setSyncStatus('partial');
          toast.info(t('dashboard.voicePersona.savedNotSynced', 'Saved in Seatable, but the voice agent is not fully updated. Retry the sync.'));
        }
      },
      onError: () => toast.error(t('dashboard.voicePersona.saveFailed', 'Failed to save persona')),
    });
  };

  const handleSave = () => {
    if (isDirty) savePersona(pending);
  };

  const handleRetry = () => {
    if (lastSaved && !isDirty) savePersona(lastSaved);
  };

  if (isLoading) {
    return (
      <section className="animate-pulse space-y-4 border-b border-brand-line pb-6 font-brand" aria-label={t('dashboard.voicePersona.title', 'Agent Persona')}>
        <div className="h-3 w-32 bg-brand-line/60" />
        <div className="h-11 max-w-3xl bg-brand-line/40" />
        <div className="h-11 max-w-3xl bg-brand-line/40" />
      </section>
    );
  }

  return (
    <section className="border-b border-brand-line pb-6 font-brand text-brand-ink" aria-labelledby="voice-persona-heading">
      <h2 id="voice-persona-heading" className="mb-5 font-brand text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
        {t('dashboard.voicePersona.title', 'Agent Persona')}
      </h2>
      {syncStatus === 'partial' && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 text-[13px] leading-5 text-amber-800">
          <p>{t('dashboard.voicePersona.savedNotSynced', 'Saved in Seatable, but the voice agent is not fully updated. Retry the sync.')}</p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={saveMutation.isPending || isDirty || !lastSaved}
            className="min-h-10 rounded-full border border-amber-700/40 px-4 py-2 font-medium text-amber-900 hover:bg-amber-700/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
          >
            {t('dashboard.voicePersona.retrySync', 'Retry sync')}
          </button>
        </div>
      )}
      {syncStatus === 'synced' && (
        <p role="status" className="mb-5 text-[13px] leading-5 text-emerald-800">
          {t('dashboard.voicePersona.savedAndSynced', 'Saved in Seatable and synced with the voice agent')}
        </p>
      )}
      <div className="max-w-3xl space-y-5">
        <div>
          <label htmlFor="agent-name" className="mb-2 block text-[13px] font-medium text-brand-ink">
            {t('dashboard.voicePersona.agentName', 'Agent name')} <span className="ml-1 font-normal text-brand-muted">{t('dashboard.voicePersona.max50', '(max 50 chars)')}</span>
          </label>
          <input
            id="agent-name"
            type="text"
            disabled={saveMutation.isPending}
            maxLength={50}
            placeholder={t('placeholders.agentName', 'e.g. Sofia')}
            value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)}
            className="min-h-11 w-full rounded-lg border border-brand-line bg-brand-paper px-3 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="mb-2 block text-[13px] font-medium text-brand-ink">
            {t('dashboard.voicePersona.openingGreeting', 'Opening greeting')} <span className="ml-1 font-normal text-brand-muted">{t('dashboard.voicePersona.max200', '(max 200 chars)')}</span>
          </label>
          <input
            id="agent-greeting"
            type="text"
            disabled={saveMutation.isPending}
            maxLength={200}
            placeholder={t('placeholders.agentGreeting', 'e.g. Welcome to our restaurant!')}
            value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)}
            className="min-h-11 w-full rounded-lg border border-brand-line bg-brand-paper px-3 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {isDirty && <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="min-h-10 rounded-full border border-brand-action px-5 py-2 text-[13px] font-semibold text-brand-action transition-colors hover:bg-brand-action hover:text-brand-paper disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {saveMutation.isPending
            ? t('dashboard.voicePersona.saving', 'Saving...')
            : `${t('common.save', 'Save')} ${t('dashboard.voicePersona.title', 'Agent Persona')}`}
        </button>}
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title={t('dashboard.voicePersona.refreshPromptHint', 'Refresh the agent prompt with the current restaurant persona')}
          className="min-h-10 text-[13px] font-medium text-brand-muted underline underline-offset-4 hover:text-brand-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {refreshMutation.isPending ? t('dashboard.voicePersona.refreshing', 'Refreshing...') : t('dashboard.voicePersona.refreshPrompt', 'Refresh Agent Prompt')}
        </button>
      </div>
    </section>
  );
}
