import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../hooks/useVoicePersona', () => ({
  useVoicePersona: vi.fn(),
  useSaveVoicePersona: vi.fn(),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
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
});
