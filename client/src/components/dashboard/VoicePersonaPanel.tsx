import { useState } from 'react';
import { useVoicePersona, useSaveVoicePersona } from '../../hooks/useVoicePersona';
import type { VoicePersona } from '../../hooks/useVoicePersona';
import { useToast } from '../../contexts/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { authFetch } from '../../services/api';

export default function VoicePersonaPanel() {
  const toast = useToast();
  const { data: persona, isLoading } = useVoicePersona();
  const saveMutation = useSaveVoicePersona();
  const [pending, setPending] = useState<Partial<VoicePersona>>({});

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/elevenlabs-voice-settings?action=refresh_prompt', { method: 'POST' });
      const data = await res.json();
      if (!data.success && !data.skipped) throw new Error(data.error || 'Refresh failed');
      return data;
    },
    onSuccess: (data) => {
      if (data.skipped) toast.info(`Skipped: ${data.reason || 'no agent configured'}`);
      else toast.success('Agent prompt refreshed successfully');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to refresh prompt'),
  });

  const getValue = (key: keyof VoicePersona): string =>
    ((key in pending ? pending[key] : persona?.[key]) ?? '') as string;

  const set = (key: keyof VoicePersona, value: string) =>
    setPending(p => ({ ...p, [key]: value }));

  const isDirty = Object.keys(pending).length > 0;

  const handleSave = () => {
    if (!isDirty) return;
    saveMutation.mutate(pending, {
      onSuccess: () => { toast.success('Agent persona saved'); setPending({}); },
      onError: () => toast.error('Failed to save persona'),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        <div className="h-10 bg-gray-100 rounded" />
        <div className="h-10 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-deep-charcoal uppercase tracking-wider">Agent Persona</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Re-sync ElevenLabs agent prompt with current restaurant persona"
            className="px-3 py-1.5 border border-border-gray hover:bg-soft-gray text-warm-stone text-xs font-medium rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Agent Prompt'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="px-4 py-1.5 bg-burgundy hover:bg-burgundy-dark text-white text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor="agent-name" className="block text-xs font-medium text-warm-stone mb-1">
            Agent name <span className="text-gray-400">(max 50 chars)</span>
          </label>
          <input
            id="agent-name"
            type="text"
            maxLength={50}
            placeholder="e.g. Sofia"
            value={getValue('agent_name')}
            onChange={e => set('agent_name', e.target.value)}
            className="w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
        <div>
          <label htmlFor="agent-greeting" className="block text-xs font-medium text-warm-stone mb-1">
            Opening greeting <span className="text-gray-400">(max 200 chars)</span>
          </label>
          <input
            id="agent-greeting"
            type="text"
            maxLength={200}
            placeholder="e.g. Welcome to our restaurant!"
            value={getValue('agent_greeting')}
            onChange={e => set('agent_greeting', e.target.value)}
            className="w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-deep-charcoal focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
        </div>
      </div>
    </div>
  );
}
