import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface VoicePersona {
  agent_name: string | null;
  agent_greeting: string | null;
}

export interface VoicePersonaSaveResult extends VoicePersona {
  kb_synced: boolean;
  prompt_synced: boolean;
  greeting_synced: boolean | null;
}

/** Thrown when the endpoint returns 403 — typically means the account lacks
 *  an active subscription with the `voice_ai` feature. The page can detect
 *  this via `error instanceof VoicePersonaForbiddenError` and show an upsell
 *  instead of silently falling back to defaults. */
export class VoicePersonaForbiddenError extends Error {
  upgradeUrl?: string;
  constructor(message: string, upgradeUrl?: string) {
    super(message);
    this.name = 'VoicePersonaForbiddenError';
    this.upgradeUrl = upgradeUrl;
  }
}

async function fetchPersona(): Promise<VoicePersona> {
  const res = await authFetch('/api/voice-persona');
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new VoicePersonaForbiddenError(
      body?.message || 'Subscription required',
      body?.upgrade_url
    );
  }
  if (!res.ok) throw new Error('Failed to load voice persona');
  return res.json() as Promise<VoicePersona>;
}

async function patchPersona(updates: Partial<VoicePersona>): Promise<VoicePersonaSaveResult> {
  const res = await authFetch('/api/voice-persona', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save voice persona');
  return res.json() as Promise<VoicePersonaSaveResult>;
}

export function useVoicePersona({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['voice-persona'], queryFn: fetchPersona, enabled, staleTime: 10 * 60 * 1000 });
}

export function useSaveVoicePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPersona,
    onSuccess: ({ agent_name, agent_greeting }) => {
      queryClient.setQueryData<VoicePersona>(['voice-persona'], { agent_name, agent_greeting });
    },
  });
}
