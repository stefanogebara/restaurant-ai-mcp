import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  config: { source: 'agent_api' } as Record<string, unknown>,
  save: vi.fn(),
  saveEngine: vi.fn(),
  refetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../contexts/ToastContext', () => ({ useToast: () => mocks.toast }));
vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useVoiceSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../hooks/useVoiceSettings')>(),
  useVoiceSettings: () => ({ data: mocks.config, isLoading: false, isError: false, refetch: mocks.refetch }),
  useSaveVoiceSettings: () => ({ mutate: mocks.save, isPending: false }),
}));
vi.mock('../../hooks/useVoiceEngineSettings', () => ({
  useVoiceEngineSettings: () => ({ data: { voice_engine: 'elevenlabs', voice_engine_status: 'active', openai_voice_id: 'alloy' } }),
  useSaveVoiceEngine: () => ({ mutate: mocks.saveEngine, isPending: false }),
}));
vi.mock('../../hooks/useSubscription', () => ({ useFeatureAccess: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock('../../hooks/useWhatsAppSettings', () => ({ useWhatsAppIntegrationStatus: () => ({ data: undefined }) }));
vi.mock('../../hooks/useVoiceBrowser', () => ({ useVoiceBrowser: () => ({
  voices: [], isLoadingVoices: false, isLoadingMore: false, hasMore: false,
  voicesSource: 'all', error: null, refetch: vi.fn(), filters: {}, setFilters: vi.fn(), handleLoadMore: vi.fn(),
}) }));
vi.mock('../../hooks/useAudioPlayback', () => ({ useAudioPlayback: () => ({
  playingVoiceId: null, loadingAudio: null, handlePlayVoice: vi.fn(), handlePreviewWithSettings: vi.fn(),
}) }));
vi.mock('../../services/api', () => ({
  authFetch: vi.fn(),
  hostAPI: { getDashboard: vi.fn().mockResolvedValue({ data: {} }) },
}));
vi.mock('../../components/voice/VoiceSettingsTabs', () => ({ default: ({ tabs }: { tabs: Array<{ id: string; content: React.ReactNode }> }) => (
  <div>{tabs.find(tab => tab.id === 'voice')?.content}{tabs.find(tab => tab.id === 'phone')?.content}</div>
) }));
vi.mock('../../components/voice/VoiceTuningPanel', () => ({ default: ({ onSettingChange }: { onSettingChange: (key: string, value: number) => void }) => (
  <>
    <button type="button" onClick={() => onSettingChange('speed', 1.1)}>Change speed</button>
    <button type="button" onClick={() => {
      onSettingChange('stability', 0.75);
      onSettingChange('similarity_boost', 0.85);
      onSettingChange('style', 0.1);
    }}>Choose calm preset</button>
  </>
) }));
vi.mock('../../components/voice/PhoneIntegrationPanel', () => ({ default: () => <p>Phone remains available</p> }));

vi.mock('../../components/voice/VoiceCurrentCard', () => ({ default: () => null }));
vi.mock('../../components/voice/VoiceEngineSelector', () => ({ default: ({ onEngineSwitch }: { onEngineSwitch: (engine: string) => void }) => (
  <button type="button" onClick={() => onEngineSwitch('openai_realtime')}>Switch engine</button>
) }));
vi.mock('../../components/voice/VoiceLanguagePicker', () => ({ default: () => null }));
vi.mock('../../components/voice/VoiceAgentInfo', () => ({ default: () => null }));
vi.mock('../../components/voice/OpenAIVoicePicker', () => ({ default: () => null }));
vi.mock('../../components/voice/OpenAIEngineInfo', () => ({ default: () => null }));
vi.mock('../../components/voice/VoiceEngineSwitchModal', () => ({ default: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) => (
  isOpen ? <button type="button" onClick={onConfirm}>Confirm switch</button> : null
) }));
vi.mock('../../components/voice/VoiceFilters', () => ({ default: () => null }));
vi.mock('../../components/voice/VoiceGrid', () => ({ default: () => null }));
vi.mock('../../components/voice/VoiceSetupNextStep', () => ({ default: () => null }));
vi.mock('../../components/dashboard/VoicePersonaPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/BookingChannelsPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/POSIntegrationPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/InstagramPanel', () => ({ default: () => null }));

import VoiceSettingsPage from '../VoiceSettingsPage';
import { VoiceSettingsPartialSaveError } from '../../hooks/useVoiceSettings';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><VoiceSettingsPage /></QueryClientProvider>), client };
}

describe('VoiceSettingsPage remote readback and partial save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockReset();
    mocks.saveEngine.mockReset();
    mocks.config = {
      source: 'agent_api', agent_id: 'agent-123', voice_id: 'voice-123', voice_name: 'Sofia',
      language: 'pt', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 },
      restaurant_name: 'Cantina',
    };
  });

  it('does not present fallback tuning values as live settings', async () => {
    mocks.config = { ...mocks.config, source: 'database_only' };
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Live voice settings are unavailable');
    expect(screen.queryByRole('button', { name: 'Change speed' })).not.toBeInTheDocument();
    expect(screen.getByText('Phone remains available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry live settings' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps edits and warns when the agent changes but Seatable fails to save', async () => {
    mocks.save
      .mockImplementationOnce((_body, callbacks) => callbacks.onError(new VoiceSettingsPartialSaveError()))
      .mockImplementationOnce((_body, callbacks) => callbacks.onSuccess({ success: true }));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Change speed' }));
    const save = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('agent accepted the change');
    expect(save).toBeEnabled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await user.click(save);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it('pauses a pending voice edit if readback falls back to the database', async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(screen.getByRole('button', { name: 'Change speed' }));
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();

    mocks.config = { ...mocks.config, source: 'database_only' };
    view.rerender(<QueryClientProvider client={view.client}><VoiceSettingsPage /></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Live voice settings are unavailable');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('can save an engine switch while keeping a paused voice edit pending', async () => {
    mocks.saveEngine.mockImplementation((_body, callbacks) => callbacks.onSuccess({ success: true }));
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(screen.getByRole('button', { name: 'Change speed' }));
    mocks.config = { ...mocks.config, source: 'database_only' };
    view.rerender(<QueryClientProvider client={view.client}><VoiceSettingsPage /></QueryClientProvider>);

    await user.click(screen.getByRole('button', { name: 'Switch engine' }));
    await user.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(mocks.saveEngine.mock.calls[0][0]).toEqual({ voice_engine: 'openai_realtime' });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Live voice settings are unavailable');
  });

  it('keeps all three preset values when React batches the changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Choose calm preset' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(mocks.save.mock.calls[0][0].voice_settings).toEqual({
      stability: 0.75, similarity_boost: 0.85, style: 0.1, speed: 1,
    });
  });
});
