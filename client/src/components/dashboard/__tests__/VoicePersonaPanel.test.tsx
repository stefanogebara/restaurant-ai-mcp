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

  it('save button disabled when no changes', () => {
    renderWithClient(<VoicePersonaPanel />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('save button enabled after editing', async () => {
    const user = userEvent.setup();
    renderWithClient(<VoicePersonaPanel />);
    const input = screen.getByDisplayValue('Sofia');
    await user.clear(input);
    await user.type(input, 'Marco');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
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
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved in Seatable, but the voice agent is not fully updated');
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();

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
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('not fully updated');
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});
