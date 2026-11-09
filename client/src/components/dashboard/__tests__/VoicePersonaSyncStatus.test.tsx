import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import VoicePersonaPanel from '../VoicePersonaPanel';

const { savePersona, toastError, toastSuccess } = vi.hoisted(() => ({
  savePersona: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
}));

vi.mock('../../../hooks/useVoicePersona', () => ({
  useVoicePersona: () => ({ data: { agent_name: 'Sofia', agent_greeting: 'Olá!' }, isLoading: false }),
  useSaveVoicePersona: () => ({ mutate: savePersona, isPending: false }),
}));
vi.mock('../../../contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ error: toastError, success: toastSuccess, info: vi.fn() }),
}));

describe('VoicePersonaPanel live sync feedback', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('separates a saved edit from an agent sync failure with a dedicated retry', async () => {
    savePersona.mockImplementation((_pending, options) => options.onSuccess({ agent_synced: false, kb_synced: true }));
    renderWithProviders(<VoicePersonaPanel />);

    await userEvent.clear(screen.getByLabelText(/Opening greeting/));
    await userEvent.type(screen.getByLabelText(/Opening greeting/), 'Welcome!');
    await userEvent.click(screen.getByRole('button', { name: 'Save name and greeting' }));

    expect(screen.getByRole('alert')).toHaveTextContent('The voice agent did not update.');
    expect(screen.getByRole('button', { name: 'Retry saved update' })).toBeEnabled();
    expect(savePersona).toHaveBeenCalledWith({ agent_greeting: 'Welcome!' }, expect.any(Object));
  });

  it('clears the saved edit when both live syncs succeeded', async () => {
    savePersona.mockImplementation((_pending, options) => options.onSuccess({ agent_synced: true, kb_synced: true }));
    renderWithProviders(<VoicePersonaPanel />);
    await userEvent.type(screen.getByLabelText(/Agent name/), ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Save name and greeting' }));
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save name and greeting' })).toBeDisabled();
  });

  it('accepts the OpenAI path where ElevenLabs sync does not apply', async () => {
    savePersona.mockImplementation((_pending, options) => options.onSuccess({ agent_synced: null, kb_synced: null }));
    renderWithProviders(<VoicePersonaPanel />);
    await userEvent.type(screen.getByLabelText(/Agent name/), ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Save name and greeting' }));
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save name and greeting' })).toBeDisabled();
  });

  it('does not offer an ElevenLabs-only refresh in the OpenAI tab', () => {
    renderWithProviders(<VoicePersonaPanel showProviderRefresh={false} />);
    expect(screen.queryByRole('button', { name: 'Reapply saved greeting' })).not.toBeInTheDocument();
    expect(screen.queryByText('Saved agent settings', { selector: 'summary' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name and greeting' })).toBeInTheDocument();
  });
});
