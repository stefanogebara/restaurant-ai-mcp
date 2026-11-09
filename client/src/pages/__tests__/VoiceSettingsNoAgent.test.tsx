import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { renderWithProviders } from '../../test/renderWithProviders';
import VoiceSettingsPage from '../VoiceSettingsPage';
import { authFetch } from '../../services/api';

const state = vi.hoisted(() => ({
  agentId: null as string | null, restaurantName: 'Seatable CI Sandbox' as string | null,
  hasAccess: true, phoneShared: true, phoneStatus: 'not_configured', phoneError: false, 
  voiceError: false,
}));
const voiceQuery = vi.hoisted(() => vi.fn());
const saveVoice = vi.hoisted(() => vi.fn());
const saveEngine = vi.hoisted(() => vi.fn());
vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useSubscription', () => ({ useFeatureAccess: () => ({ hasAccess: state.hasAccess, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('../../hooks/useSubscriptionManage', () => ({ useSubscriptionData: () => ({ data: { currency: 'BRL' } }) }));
vi.mock('../../hooks/useVoiceSettings', () => ({
  useVoiceSettings: (options: unknown) => {
    voiceQuery(options);
    return { data: { agent_id: state.agentId, restaurant_name: state.restaurantName, voice_id: 'voice-owned', voice_name: 'Owned voice', language: 'pt', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 } }, isLoading: false, isError: state.voiceError, refetch: vi.fn() };
  },
  useSaveVoiceSettings: () => ({ isPending: false, mutate: saveVoice }),
}));
vi.mock('../../hooks/useVoiceEngineSettings', () => ({
  useVoiceEngineSettings: () => ({ data: { voice_engine: 'elevenlabs', voice_engine_status: 'active', openai_voice_id: 'alloy' }, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveVoiceEngine: () => ({ isPending: false, mutate: saveEngine }),
}));
vi.mock('../../hooks/useVoiceBrowser', () => ({ useVoiceBrowser: () => ({ voices: [], isLoadingVoices: false, isLoadingMore: false, hasMore: false, voicesSource: '', error: null, refetch: vi.fn(), filters: { gender: 'all', language: 'pt', search: '' }, setFilters: vi.fn(), handleLoadMore: vi.fn() }) }));
vi.mock('../../hooks/useAudioPlayback', () => ({ useAudioPlayback: () => ({ playingVoiceId: null, loadingAudio: null, handlePlayVoice: vi.fn(), handlePreviewWithSettings: vi.fn(), stopPlayback: vi.fn() }) }));
vi.mock('../../components/dashboard/VoicePersonaPanel', () => ({ default: () => <div>Individual agent presentation</div> }));
vi.mock('../../services/api', () => ({ authFetch: vi.fn() }));
const api = vi.mocked(authFetch);
function setup() { return renderWithProviders(<MemoryRouter><VoiceSettingsPage /></MemoryRouter>); }
function expectReadOnly() {
  expect(screen.queryByText(/creating your voice agent|criando seu agente|creando tu agente/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /retry agent creation|criar|crear/i })).not.toBeInTheDocument();
  expect(screen.queryAllByRole('link').some(link => link.getAttribute('href') === '/onboarding')).toBe(false);
  expect(screen.queryByText('Individual agent presentation')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Direct Voice|Premium Voice|Save voice/i })).not.toBeInTheDocument();
  expect(saveVoice).not.toHaveBeenCalled();
  expect(saveEngine).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { agentId: null, restaurantName: 'Seatable CI Sandbox', hasAccess: true, phoneShared: true, phoneStatus: 'not_configured', phoneError: false,  voiceError: false });
  window.history.replaceState({}, '', '#voice-settings:voice');
  api.mockImplementation(async (url, options) => {
    if (url !== '/api/phone-integration-simple?action=status' || options?.method && options.method !== 'GET') throw new Error('Unexpected voice/provider write');
    return { ok: !state.phoneError, status: state.phoneError ? 500 : 200, json: async () => ({
      success: true,
      restaurant: { name: 'Seatable CI Sandbox', has_agent: Boolean(state.agentId), agent_id: state.agentId, phone_number: null, status: state.phoneStatus, shared_routing_enabled: state.phoneShared, error: null, configured_at: null },
      platform: { activation_mode: 'assisted', routing_verified: false },
    }) } as Response;
  });
});
afterEach(async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
  window.history.replaceState({}, '', '#voice-settings:voice');
});

describe('Voice page without an individual agent', () => {
  it.each(['#voice-settings:voice', '#voice-settings:phone'])('exposes saved shared setup safely from %s', async hash => {
    window.history.replaceState({}, '', hash);
    setup();
    expect(await screen.findByRole('heading', { name: 'Shared routing configured' })).toBeVisible();
    expect(screen.getByText('Setup saved in Seatable. This page does not check whether the shared phone line is available now.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Call History' })).toHaveAttribute('href', '/host-dashboard/calls');
    expectReadOnly();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pt-BR', 'Roteamento compartilhado configurado', 'Voz e chamadas'],
    ['es', 'Enrutamiento compartido configurado', 'Voz y llamadas'],
  ])('shows the shared no-agent journey in %s', async (language, phoneTitle, pageTitle) => {
    await i18n.changeLanguage(language);
    setup();
    expect(await screen.findByRole('heading', { name: phoneTitle })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: pageTitle })).toBeVisible();
    const intro = i18n.t('voiceSettings.noIndividualAgentIntro');
    expect(intro).not.toBe('voiceSettings.noIndividualAgentIntro');
    expect(screen.getByText(intro)).toBeVisible();
    expectReadOnly();
  });

  it('does not treat a missing restaurant name as a reason to restart onboarding', async () => {
    state.restaurantName = null;
    setup();
    expect(await screen.findByRole('heading', { name: 'Shared routing configured' })).toBeVisible();
    expectReadOnly();
  });

  it('shows loading only for the actual phone status request', async () => {
    api.mockReturnValueOnce(new Promise<Response>(() => {}));
    setup();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading phone status');
    expectReadOnly();
  });

  it('provides assisted setup without a creation promise when the phone is unconfigured', async () => {
    state.phoneShared = false;
    setup();
    expect(await screen.findByRole('heading', { name: 'Phone not connected' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ask Seatable to connect the phone' })).toHaveAttribute('href', 'mailto:hello@seatable.one?subject=Voice%20phone%20setup');
    expect(screen.queryByText(/setup above/i)).not.toBeInTheDocument();
    expectReadOnly();
  });

  it.each([
    ['pending', 'Phone setup in progress'],
    ['error', 'Phone connection needs attention'],
  ])('keeps the saved %s phone state distinct from agent creation', async (phoneStatus, title) => {
    Object.assign(state, { phoneShared: false, phoneStatus });
    setup();
    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    expectReadOnly();
  });

  it('reports an unavailable phone status without claiming shared routing is connected', async () => {
    state.phoneError = true;
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check the phone setup right now.");
    expect(screen.queryByRole('heading', { name: 'Shared routing configured' })).not.toBeInTheDocument();
    expectReadOnly();
  });

  it('keeps a blocked plan blocked and does not request the phone status', async () => {
    state.hasAccess = false;
    setup();
    expect(screen.getByRole('button', { name: /Upgrade to/i })).toBeVisible();
    expect(voiceQuery).toHaveBeenCalledWith({ enabled: false });
    expect(screen.queryByRole('heading', { name: 'Shared routing configured' })).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('retains the existing individual-agent controls when an owned agent is present', async () => {
    state.agentId = 'agent-owned';
    setup();
    await waitFor(() => expect(screen.getByText('Individual agent presentation')).toBeVisible());
    expect(screen.getByRole('button', { name: /Direct Voice/i })).toBeVisible();
    expect(screen.getByRole('combobox')).toHaveValue('pt');
    expect(screen.getByRole('tab', { name: 'Phone' })).toBeVisible();
  });

  it('does not reinterpret a failed individual-agent query as an unconfigured restaurant', () => {
    state.voiceError = true;
    setup();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(api).not.toHaveBeenCalled();
    expectReadOnly();
  });
});
