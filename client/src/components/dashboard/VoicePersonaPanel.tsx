import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona, VoicePersonaSaveResult } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';

interface Props {
  variant?: 'default' | 'studio';
  engine?: 'elevenlabs' | 'openai_realtime';
  onGreetingDraftChange?: (value: string | null) => void;
  onAgentNameDraftChange?: (value: string | null) => void;
  exampleGreeting?: string;
  voiceIdentity?: ReactNode;
  playControl?: ReactNode;
  sampleStatus?: ReactNode;
}

export default function VoicePersonaPanel({ variant = 'default', engine = 'elevenlabs', onGreetingDraftChange, onAgentNameDraftChange, exampleGreeting, voiceIdentity, playControl, sampleStatus }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: persona, isLoading, isError, refetch } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});
  const [syncStatus, setSyncStatus] = useState<'synced' | 'partial' | 'unverified' | null>(null);
  const [lastSaved, setLastSaved] = useState<VoicePersona | null>(null);
  const greetingRef = useRef<HTMLTextAreaElement>(null);

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

  const set = (key: keyof VoicePersona, value: string) => {
    setPending(p => ({ ...p, [key]: value }));
    setSyncStatus(current => current === 'partial' ? current : null);
    if (key === 'agent_greeting') onGreetingDraftChange?.(value);
    if (key === 'agent_name') onAgentNameDraftChange?.(value);
  };

  const isDirty = Object.keys(pending).length > 0;

  const savePersona = (updates: Partial<VoicePersona>) => {
    saveMutation.mutate(updates, {
      onSuccess: (result: VoicePersonaSaveResult) => {
        setLastSaved({ agent_name: result.agent_name, agent_greeting: result.agent_greeting });
        setPending({});
        onGreetingDraftChange?.(null);
        onAgentNameDraftChange?.(null);
        if (engine === 'openai_realtime') {
          setSyncStatus('unverified');
          toast.info(t('dashboard.voicePersona.openaiUnverified', 'Saved in Seatable. The OpenAI call greeting is not verified. Test a real call.'));
        } else if (result.kb_synced === true && result.prompt_synced === true && result.greeting_synced !== false) {
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

  const handleCancel = () => {
    setPending({});
    onGreetingDraftChange?.(null);
    onAgentNameDraftChange?.(null);
  };

  if (isLoading) {
    return (
      <section className={`animate-pulse space-y-4 font-brand ${variant === 'studio' ? '' : 'border-b border-brand-line pb-6'}`} aria-label={t('dashboard.voicePersona.title', 'Agent Persona')}>
        <div className="h-3 w-32 bg-brand-line/60" />
        <div className="h-11 max-w-3xl bg-brand-line/40" />
        <div className="h-11 max-w-3xl bg-brand-line/40" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mx-auto w-full max-w-[900px] border-l-2 border-amber-800 py-3 pl-4 font-brand" role="alert">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-800">{t('dashboard.voicePersona.unavailableTitle', 'Greeting unavailable')}</h2>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-5 text-brand-muted">{t('dashboard.voicePersona.unavailableBody', 'We could not load the saved greeting. The voice preview uses an example; nothing here is confirmed as saved.')}</p>
        {exampleGreeting && <p className="mt-3 max-w-[62ch] text-[16px] leading-6 text-brand-ink">“{exampleGreeting}”</p>}
        <button type="button" onClick={() => refetch?.()} className="mt-3 min-h-10 text-[13px] font-semibold text-brand-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
          {t('common.retry', 'Retry')}
        </button>
        {(voiceIdentity || playControl || sampleStatus) && <div className="mt-5 space-y-3">
          {voiceIdentity}
          <div className="flex items-center gap-4 rounded-[18px] border border-brand-line bg-white/40 p-3">{playControl}{sampleStatus}</div>
        </div>}
      </section>
    );
  }

  if (variant === 'studio') {
    const greeting = getValue('agent_greeting');
    return (
      <section className="mx-auto w-full max-w-[900px] min-w-0 pb-3 pt-4 font-brand text-brand-ink sm:pb-5 sm:pt-7" aria-labelledby="voice-persona-heading">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <h2 id="voice-persona-heading" className="font-brand text-[12px] font-medium text-brand-muted">
              {t('dashboard.voicePersona.receptionistTitle', 'Your receptionist')}
            </h2>
            <label htmlFor="agent-name" className="sr-only">{t('dashboard.voicePersona.agentName', 'Agent name')}</label>
            <input
              id="agent-name" type="text" maxLength={50}
              disabled={saveMutation.isPending}
              placeholder={t('placeholders.agentName', 'e.g. Sofia')}
              value={getValue('agent_name')}
              onChange={event => set('agent_name', event.target.value)}
              style={{ fieldSizing: 'content' }}
              className="min-h-11 min-w-0 max-w-full border-0 bg-transparent px-0 py-0 font-brand text-[30px] font-medium leading-[1.05] tracking-[-0.045em] text-brand-ink placeholder:text-brand-muted/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60 sm:text-[33px]"
            />
          </div>
          {voiceIdentity}
        </div>
        <label htmlFor="agent-greeting" className="sr-only">{t('dashboard.voicePersona.openingGreeting', 'Opening greeting')}</label>
        <textarea
          id="agent-greeting"
          ref={greetingRef}
          rows={2}
          disabled={saveMutation.isPending}
          maxLength={200}
          placeholder={t('placeholders.agentGreeting', 'e.g. Welcome to our restaurant!')}
          value={greeting}
          onChange={event => set('agent_greeting', event.target.value)}
          style={{ fieldSizing: 'content' }}
          className="mt-6 block min-h-[68px] w-full max-w-[720px] resize-none overflow-hidden border-0 bg-transparent px-0 py-0 font-serif text-[28px] font-normal leading-[1.08] tracking-[-0.025em] [text-wrap:balance] text-brand-ink placeholder:text-brand-muted/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60 sm:mt-8 sm:min-h-[100px] sm:text-[40px]"
        />
        {!greeting && !isDirty && exampleGreeting && <p className="mt-2 max-w-[70ch] text-[12px] leading-5 text-brand-muted">{t('dashboard.voicePersona.examplePreview', 'No greeting is saved. The sample plays this example:')} “{exampleGreeting}”</p>}
        <div className="mt-5 min-w-0 rounded-[18px] border border-brand-line bg-white/40 p-3 sm:mt-7 sm:p-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {playControl}
            <div className="min-w-0 flex-1">
              {sampleStatus}
              <p className={`mt-1 text-[12px] leading-4 ${isDirty ? 'text-amber-800' : 'text-brand-muted'}`}>
                {isDirty ? t('dashboard.voicePersona.unsavedDraft', 'Unsaved draft') : greeting ? t('dashboard.voicePersona.savedInSeatable', 'Saved in Seatable') : t('dashboard.voicePersona.noSavedGreeting', 'No saved greeting')}
              </p>
            </div>
            {!isDirty && <button type="button" onClick={() => greetingRef.current?.focus()} className="min-h-11 shrink-0 px-1 text-[13px] font-medium text-brand-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
              <span className="sm:hidden">{t('common.edit', 'Edit')}</span><span className="hidden sm:inline">{t('dashboard.voicePersona.editScript', 'Edit script')}</span>
            </button>}
          </div>
          {isDirty && <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={handleCancel} disabled={saveMutation.isPending} className="min-h-11 text-[13px] font-medium text-brand-muted underline underline-offset-4">{t('common.cancel', 'Cancel')}</button>
            <button type="button" onClick={handleSave} disabled={saveMutation.isPending} className="min-h-11 rounded-full bg-brand-action px-4 py-2 text-[13px] font-semibold text-brand-paper disabled:opacity-50">
              {saveMutation.isPending ? t('dashboard.voicePersona.saving', 'Saving...') : t('dashboard.voicePersona.saveGreeting', 'Save greeting')}
            </button>
          </div>}
        </div>
        <a href="#voice-settings:phone" className="mt-2 inline-flex min-h-11 items-center text-[12px] font-medium text-brand-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action">
          {t('dashboard.voicePersona.realCallHelp', 'How to test a real call')}
        </a>
        {syncStatus === 'partial' && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 text-[12px] leading-5 text-amber-800">
          <span>{t('dashboard.voicePersona.savedNotSynced', 'Saved in Seatable, but the voice agent is not fully updated. Retry the sync.')}</span>
          <button type="button" onClick={handleRetry} disabled={saveMutation.isPending || isDirty || !lastSaved} className="min-h-9 font-semibold underline underline-offset-4 disabled:opacity-40">{t('dashboard.voicePersona.retrySync', 'Retry sync')}</button>
        </div>}
        {syncStatus === 'synced' && <p role="status" className="mt-3 text-[12px] text-emerald-800">{t('dashboard.voicePersona.savedAndSynced', 'Saved in Seatable and synced with the voice agent')}</p>}
        {syncStatus === 'unverified' && <p role="status" className="mt-3 text-[12px] text-amber-800">{t('dashboard.voicePersona.openaiUnverified', 'Saved in Seatable. The OpenAI call greeting is not verified. Test a real call.')}</p>}
      </section>
    );
  }

  return (
    <section className="border-b border-brand-line pb-6 font-brand text-brand-ink" aria-labelledby="voice-persona-heading">
      <h2 id="voice-persona-heading" className="mb-5 font-brand text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('dashboard.voicePersona.title', 'Agent Persona')}</h2>
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
      {syncStatus === 'unverified' && (
        <p role="status" className="mb-5 text-[13px] leading-5 text-amber-800">
          {t('dashboard.voicePersona.openaiUnverified', 'Saved in Seatable. The OpenAI call greeting is not verified. Test a real call.')}
        </p>
      )}
      <div className="max-w-3xl space-y-5">
        <div>
          <label htmlFor="agent-name" className="mb-2 block text-[13px] font-medium text-brand-ink">
            {t('dashboard.voicePersona.agentName', 'Agent name')}
          </label>
          <input
            id="agent-name"
            type="text"
            disabled={saveMutation.isPending}
            maxLength={50}
            placeholder={t('placeholders.agentName', 'e.g. Sofia')}
            value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)}
            className="min-h-11 w-full rounded-none border border-brand-line bg-white/35 px-3 py-2 text-sm text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="mb-2 block text-[13px] font-medium text-brand-ink">
            {t('dashboard.voicePersona.openingGreeting', 'Opening greeting')}
            {getValue('agent_greeting').length >= 160 && <span className="ml-2 font-normal text-brand-muted">{getValue('agent_greeting').length}/200</span>}
          </label>
          <textarea
            id="agent-greeting"
            rows={4}
            disabled={saveMutation.isPending}
            maxLength={200}
            placeholder={t('placeholders.agentGreeting', 'e.g. Welcome to our restaurant!')}
            value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)}
            className="min-h-[112px] w-full resize-y rounded-none border border-brand-line bg-white/35 px-3 py-2 text-sm leading-6 text-brand-ink placeholder:text-brand-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action disabled:opacity-60"
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
        {engine === 'elevenlabs' && <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title={t('dashboard.voicePersona.refreshPromptHint', 'Refresh the agent prompt with the current restaurant persona')}
          className="min-h-10 text-[13px] font-medium text-brand-muted underline underline-offset-4 hover:text-brand-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {refreshMutation.isPending ? t('dashboard.voicePersona.refreshing', 'Refreshing...') : t('dashboard.voicePersona.refreshPrompt', 'Refresh Agent Prompt')}
        </button>}
      </div>
    </section>
  );
}
