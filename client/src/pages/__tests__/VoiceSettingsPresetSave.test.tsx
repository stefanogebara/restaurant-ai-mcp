import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import VoiceSettingsPage from '../VoiceSettingsPage';

const saveVoice = vi.hoisted(() => vi.fn());
const saveEngine = vi.hoisted(() => vi.fn());
const engineRequest = vi.hoisted(() => ({ isError: false, isLoading: false, refetch: vi.fn() }));
const access = vi.hoisted(() => ({ hasAccess: true, isLoading: false, isError: false, refetch: vi.fn() }));

vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useSubscription', () => ({ useFeatureAccess: () => access }));
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
  useVoiceEngineSettings: () => ({ ...engineRequest, data: { voice_engine: 'elevenlabs', voice_engine_status: 'active', openai_voice_id: 'alloy' } }),
  useSaveVoiceEngine: () => ({ isPending: false, mutate: saveEngine }),
}));
vi.mock('../../hooks/useVoiceBrowser', () => ({
  useVoiceBrowser: () => ({ voices: [], isLoadingVoices: false, isLoadingMore: false, hasMore: false, voicesSource: '', error: null, refetch: vi.fn(), filters: { gender: 'all', language: 'pt', search: '' }, setFilters: vi.fn(), handleLoadMore: vi.fn() }),
}));
vi.mock('../../hooks/useAudioPlayback', () => ({
  useAudioPlayback: () => ({ playingVoiceId: null, loadingAudio: null, handlePlayVoice: vi.fn(), handlePreviewWithSettings: vi.fn(), stopPlayback: vi.fn() }),
}));
vi.mock('../../hooks/useVoicePersona', () => ({
  useVoicePersona: () => ({ data: { agent_name: 'Sofia', agent_greeting: 'Welcome!' }, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveVoicePersona: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../components/voice/PhoneIntegrationPanel', () => ({ default: () => null }));

describe('VoiceSettingsPage preset save', () => {
  beforeEach(() => { access.hasAccess = true; access.isError = false; access.refetch.mockClear(); saveVoice.mockClear(); saveEngine.mockClear(); engineRequest.isError = false; engineRequest.refetch.mockClear(); });
  it('offers retry instead of an upgrade when voice access could not be checked', async () => {
    access.hasAccess = false; access.isError = true;
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    expect(screen.getByText('Could not check voice access')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(access.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Unlock with/i)).not.toBeInTheDocument();
  });

  it('makes the call history reachable from the voice setup journey', () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Call History' })).toHaveAttribute('href', '/host-dashboard/calls');
  });

  it('keeps a language edit made after an earlier save started', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    const submitted = saveVoice.mock.calls[0][1];
    await userEvent.selectOptions(screen.getByRole('combobox'), 'fr');
    await act(async () => submitted.onSuccess({ success: true }));
    expect(screen.getByRole('combobox')).toHaveValue('fr');
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    expect(saveVoice.mock.calls[1][0].language).toBe('fr');
  });

  it('keeps a preset edit made while an earlier preset is saving', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Calm/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    const submitted = saveVoice.mock.calls[0][1];
    await userEvent.click(screen.getByRole('button', { name: /Energetic/ }));
    await act(async () => submitted.onSuccess({ success: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    expect(saveVoice.mock.calls[1][0].voice_settings.stability).toBe(0.35);
  });

  it('keeps the presentation draft when changing the staged voice engine', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    const name = screen.getByDisplayValue('Sofia');
    await userEvent.clear(name); await userEvent.type(name, 'Marina');
    await userEvent.click(screen.getByRole('button', { name: /Direct Voice/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this option' }));
    expect(screen.getByRole('textbox', { name: /Agent name/i })).toHaveValue('Marina');
  });

  it('does not invent an engine choice when the engine request failed', async () => {
    engineRequest.isError = true;
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Direct voice/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(engineRequest.refetch).toHaveBeenCalledOnce();
  });

  it('discards voice settings without losing the separate presentation draft', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    await userEvent.clear(screen.getByDisplayValue('Sofia'));
    await userEvent.type(screen.getByRole('textbox', { name: /Agent name/i }), 'Marina');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('combobox')).toHaveValue('pt');
    expect(screen.getByRole('textbox', { name: /Agent name/i })).toHaveValue('Marina');
    expect(screen.queryByRole('button', { name: 'Save voice' })).not.toBeInTheDocument();
  });

  it('keeps an OpenAI voice chosen after an engine save started', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /Direct voice/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this option' }));
    await userEvent.click(screen.getByRole('button', { name: /Echo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    const submitted = saveEngine.mock.calls[0][1];
    await userEvent.click(screen.getByRole('button', { name: /Nova/ }));
    await act(async () => submitted.onSuccess({ success: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    expect(saveEngine.mock.calls[1][0].openai_voice_id).toBe('nova');
  });

  it('retries only the failed engine part after voice settings succeeded', async () => {
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'es');
    await userEvent.click(screen.getByRole('button', { name: /Direct voice/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this option' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    await act(async () => {
      saveVoice.mock.calls[0][1].onSuccess({ success: true });
      saveEngine.mock.calls[0][1].onError(new Error('Engine unavailable'));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    expect(saveVoice).toHaveBeenCalledTimes(1);
    expect(saveEngine).toHaveBeenCalledTimes(2);
  });

  it('submits all preset values together and keeps the saved speaking speed', async () => {
    saveVoice.mockClear();
    renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: /Calm/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save voice' }));

    expect(saveVoice).toHaveBeenCalledTimes(1);
    expect(saveVoice.mock.calls[0][0].voice_settings).toEqual({
      stability: 0.75, similarity_boost: 0.85, style: 0.1, speed: 1.05,
    });
  });
});
