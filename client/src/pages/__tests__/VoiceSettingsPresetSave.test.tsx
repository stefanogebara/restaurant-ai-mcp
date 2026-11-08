import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import VoiceSettingsPage from '../VoiceSettingsPage';

const saveVoice = vi.hoisted(() => vi.fn());

vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useSubscription', () => ({ useFeatureAccess: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock('../../hooks/useVoiceSettings', () => ({
  useVoiceSettings: () => ({
    data: {
      agent_id: 'agent-1', voice_id: 'voice-1', voice_name: 'Current voice', language: 'pt',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.05 },
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useSaveVoiceSettings: () => ({ isPending: false, mutate: saveVoice }),
}));
vi.mock('../../hooks/useVoiceEngineSettings', () => ({
  useVoiceEngineSettings: () => ({ data: { voice_engine: 'elevenlabs', voice_engine_status: 'active' } }),
  useSaveVoiceEngine: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('../../hooks/useVoiceBrowser', () => ({
  useVoiceBrowser: () => ({ voices: [], isLoadingVoices: false, isLoadingMore: false, hasMore: false, voicesSource: '', error: null, refetch: vi.fn(), filters: { gender: 'all', language: 'pt', search: '' }, setFilters: vi.fn(), handleLoadMore: vi.fn() }),
}));
vi.mock('../../hooks/useAudioPlayback', () => ({
  useAudioPlayback: () => ({ playingVoiceId: null, loadingAudio: null, handlePlayVoice: vi.fn(), handlePreviewWithSettings: vi.fn() }),
}));
vi.mock('../../components/dashboard/VoicePersonaPanel', () => ({ default: () => null }));
vi.mock('../../components/voice/PhoneIntegrationPanel', () => ({ default: () => null }));

describe('VoiceSettingsPage preset save', () => {
  it('submits all preset values together and keeps the saved speaking speed', async () => {
    saveVoice.mockClear();
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: /Calm/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(saveVoice).toHaveBeenCalledTimes(1);
    expect(saveVoice.mock.calls[0][0].voice_settings).toEqual({
      stability: 0.75, similarity_boost: 0.85, style: 0.1, speed: 1.05,
    });
  });
});
