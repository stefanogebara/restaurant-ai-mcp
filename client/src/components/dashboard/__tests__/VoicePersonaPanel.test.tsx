import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../hooks/useVoicePersona', () => ({
  useVoicePersona: vi.fn(),
  useSaveVoicePersona: vi.fn(),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { useVoicePersona, useSaveVoicePersona } from '../../../hooks/useVoicePersona';
import VoicePersonaPanel from '../VoicePersonaPanel';

const mockUse = useVoicePersona as ReturnType<typeof vi.fn>;
const mockSave = useSaveVoicePersona as ReturnType<typeof vi.fn>;

describe('VoicePersonaPanel', () => {
  beforeEach(() => {
    mockSave.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUse.mockReturnValue({ data: { agent_name: 'Sofia', agent_greeting: 'Welcome!' }, isLoading: false });
  });

  it('renders heading', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByText('Agent Persona')).toBeInTheDocument();
  });

  it('renders agent name input with current value', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByDisplayValue('Sofia')).toBeInTheDocument();
  });

  it('save button disabled when no changes', () => {
    render(<VoicePersonaPanel />);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('save button enabled after editing', async () => {
    const user = userEvent.setup();
    render(<VoicePersonaPanel />);
    const input = screen.getByDisplayValue('Sofia');
    await user.clear(input);
    await user.type(input, 'Marco');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });
});
