import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: mockFetch }));

import { useSaveVoiceSettings, VoiceSettingsPartialSaveError } from '../useVoiceSettings';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('useSaveVoiceSettings', () => {
  beforeEach(() => mockFetch.mockReset());

  it('preserves the remote-success/local-failure state and requests fresh readback', async () => {
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ partial: true, error: 'English server detail' }) });
    const { result } = renderHook(() => useSaveVoiceSettings(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ voice_id: 'voice-123' })).rejects.toBeInstanceOf(VoiceSettingsPartialSaveError);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['voiceSettings'] });
  });

  it('does not expose raw server errors for a rejected remote update', async () => {
    const { wrapper } = setup();
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'English server detail' }) });
    const { result } = renderHook(() => useSaveVoiceSettings(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ voice_id: 'voice-123' })).rejects.toThrow('Failed to save voice settings');
    });
    expect(result.current.error).not.toBeInstanceOf(VoiceSettingsPartialSaveError);
  });
});
