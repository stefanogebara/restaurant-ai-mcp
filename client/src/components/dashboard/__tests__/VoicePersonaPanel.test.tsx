import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../hooks/useVoicePersona', () => ({
  useVoicePersona: vi.fn(),
  useSaveVoicePersona: vi.fn(),
}));
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => mockToast }));
vi.mock('../../../services/api', () => ({
  authFetch: vi.fn(),
}));

import { useVoicePersona, useSaveVoicePersona } from '../../../hooks/useVoicePersona';
import { authFetch } from '../../../services/api';
import VoicePersonaPanel from '../VoicePersonaPanel';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const mockUse = useVoicePersona as ReturnType<typeof vi.fn>;
const mockSave = useSaveVoicePersona as ReturnType<typeof vi.fn>;

describe('VoicePersonaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUse.mockReturnValue({ data: { agent_name: 'Sofia', agent_greeting: 'Welcome!' }, isLoading: false });
  });

  it('renders heading', () => {
    renderWithClient(<VoicePersonaPanel />);
    expect(screen.getByText('Agent Persona')).toBeInTheDocument();
  });

  it('renders agent name input with current value', () => {
    renderWithClient(<VoicePersonaPanel />);
    expect(screen.getByDisplayValue('Sofia')).toBeInTheDocument();
  });

  it('hides the save button when no changes exist', () => {
    renderWithClient(<VoicePersonaPanel />);
    expect(screen.queryByRole('button', { name: /save agent persona/i })).not.toBeInTheDocument();
  });

  it('save button enabled after editing', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel />);
    const input = screen.getByDisplayValue('Sofia');
    await user.clear(input);
    await user.type(input, 'Marco');
    expect(screen.getByRole('button', { name: /save agent persona/i })).not.toBeDisabled();
  });

  it('distinguishes a saved persona from a failed agent sync and retries it', async () => {
    const mutate = vi.fn()
      .mockImplementationOnce((_updates, options) => options.onSuccess({
        agent_name: 'Marco', agent_greeting: 'Welcome!', kb_synced: false, prompt_synced: true,
      }))
      .mockImplementationOnce((_updates, options) => options.onSuccess({
        agent_name: 'Marco', agent_greeting: 'Welcome!', kb_synced: true, prompt_synced: true,
      }));
    mockSave.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel />);
    await user.clear(screen.getByLabelText(/agent name/i));
    await user.type(screen.getByLabelText(/agent name/i), 'Marco');
    await user.click(screen.getByRole('button', { name: /save agent persona/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved in Seatable, but the voice agent is not fully updated');
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /save agent persona/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry sync/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('synced with the voice agent'));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1][0]).toEqual({ agent_name: 'Marco', agent_greeting: 'Welcome!' });
    expect(mockToast.success).toHaveBeenCalledTimes(1);
  });

  it('does not claim the agent is updated when prompt sync fails', async () => {
    const mutate = vi.fn((_updates, options) => options.onSuccess({
      agent_name: 'Marco', agent_greeting: 'Welcome!', kb_synced: true, prompt_synced: false,
    }));
    mockSave.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel />);
    await user.clear(screen.getByLabelText(/agent name/i));
    await user.type(screen.getByLabelText(/agent name/i), 'Marco');
    await user.click(screen.getByRole('button', { name: /save agent persona/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('not fully updated');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('auditions an unsaved line and does not claim sync when the opening message differs', async () => {
    const onGreetingDraftChange = vi.fn();
    const mutate = vi.fn((_updates, options) => options.onSuccess({
      agent_name: 'Sofia', agent_greeting: 'Olá da Casa.', kb_synced: true,
      prompt_synced: true, greeting_synced: false,
    }));
    mockSave.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel variant="studio" onGreetingDraftChange={onGreetingDraftChange} />);
    expect(screen.getByRole('link', { name: /how to test a real call in phone/i })).toHaveAttribute('href', '#voice-settings:phone');
    const input = screen.getByLabelText(/opening greeting/i);
    await user.clear(input);
    await user.type(input, 'Olá da Casa.');
    expect(onGreetingDraftChange).toHaveBeenLastCalledWith('Olá da Casa.');
    await user.click(screen.getByRole('button', { name: /save greeting/i }));
    expect(mutate.mock.calls[0][0]).toEqual({ agent_greeting: 'Olá da Casa.' });
    expect(onGreetingDraftChange).toHaveBeenLastCalledWith(null);
    expect(await screen.findByRole('status')).toHaveTextContent('not fully updated');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('restores the saved greeting in the always-open editor when cancelled', async () => {
    const onGreetingDraftChange = vi.fn();
    const mutate = vi.fn();
    mockSave.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel variant="studio" onGreetingDraftChange={onGreetingDraftChange} />);
    const input = screen.getByLabelText(/opening greeting/i);
    await user.clear(input);
    await user.type(input, 'New opening');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByLabelText(/opening greeting/i)).toHaveValue('Welcome!');
    expect(onGreetingDraftChange).toHaveBeenLastCalledWith(null);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('marks a failed persona read as example-only and offers retry', async () => {
    const refetch = vi.fn();
    mockUse.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel variant="studio" exampleGreeting="Welcome to our restaurant." />);
    expect(screen.getByRole('alert')).toHaveTextContent('nothing here is confirmed as saved');
    expect(screen.getByText(/Welcome to our restaurant/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/opening greeting/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('refreshes the agent prompt without saving the persona', async () => {
    const user = userEvent.setup();
    const fetchMock = authFetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ json: async () => ({ success: true }) });
    const mutate = vi.fn();
    mockSave.mockReturnValue({ mutate, isPending: false });
    renderWithClient(<VoicePersonaPanel />);

    await user.click(screen.getByRole('button', { name: /refresh agent prompt/i }));

    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Agent prompt refreshed successfully'));
    expect(fetchMock).toHaveBeenCalledWith('/api/elevenlabs-voice-settings?action=refresh_prompt', { method: 'POST' });
    expect(mutate).not.toHaveBeenCalled();
  });
});
