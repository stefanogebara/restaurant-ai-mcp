import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';

export default function VoicePersonaPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: persona, isLoading } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});

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

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate(pending, {
      onSuccess: () => { toast.success(t('dashboard.voicePersona.saved', 'Agent persona saved')); setPending({}); },
      onError: () => toast.error(t('dashboard.voicePersona.saveFailed', 'Failed to save persona')),
    });
  };

  if (isLoading) {
    return (
      <div className="py-5 border-t border-glass-border-dark mt-8 animate-pulse space-y-3">
        <div className="h-4 bg-stone-100 rounded w-40" />
        <div className="h-10 bg-stone-100 rounded" />
        <div className="h-10 bg-stone-100 rounded" />
      </div>
    );
  }

  return (
    <div className="py-5 border-t border-glass-border-dark mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('dashboard.voicePersona.title', 'Agent Persona')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Re-sync ElevenLabs agent prompt with current restaurant persona"
            className="px-3 py-1.5 border border-glass-border-dark hover:bg-soft-gray text-warm-stone text-xs font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {refreshMutation.isPending ? t('dashboard.voicePersona.refreshing', 'Refreshing...') : t('dashboard.voicePersona.refreshPrompt', 'Refresh Agent Prompt')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? t('dashboard.voicePersona.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor="agent-name" className="block text-xs font-medium text-warm-stone mb-1">
            {t('dashboard.voicePersona.agentName', 'Agent name')} <span className="text-stone-400">{t('dashboard.voicePersona.max50', '(max 50 chars)')}</span>
          </label>
          <input
            id="agent-name"
            type="text"
            maxLength={50}
            placeholder={t('placeholders.agentName', 'e.g. Sofia')}
            value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)}
            className="w-full border border-glass-border-input rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="block text-xs font-medium text-warm-stone mb-1">
            {t('dashboard.voicePersona.openingGreeting', 'Opening greeting')} <span className="text-stone-400">{t('dashboard.voicePersona.max200', '(max 200 chars)')}</span>
          </label>
          <input
            id="agent-greeting"
            type="text"
            maxLength={200}
            placeholder={t('placeholders.agentGreeting', 'e.g. Welcome to our restaurant!')}
            value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)}
            className="w-full border border-glass-border-input rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
      </div>
    </div>
  );
}
