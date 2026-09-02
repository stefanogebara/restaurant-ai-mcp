import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppWorkspace } from '../WhatsAppSettingsPage';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../../services/api', () => ({ authFetch: fetchMock }));
vi.mock('../../components/layout/DashboardLayout', () => ({ default: () => null }));
vi.mock('../../components/dashboard/AiPersonalityPanel', () => ({ default: () => <div>Personality editor</div> }));
vi.mock('../../components/dashboard/ManagerNotificationsPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/FeedbackSettingsPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/SurveySettingsPanel', () => ({ default: () => null }));

let provision: Record<string, unknown>;
let failStatus: boolean;
let testMessage: Record<string, unknown> | null;
beforeEach(() => {
  provision = { estado: 'nao_iniciado' };
  failStatus = false;
  testMessage = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: !failStatus,
    json: async () => ({ success: !failStatus, data: url === '/api/whatsapp-provision' ? provision
      : url.includes('test_status') ? testMessage
        : { enabled: true, api_configured: true, phone_number: '+5511111111111', display_phone: '+5522222222222', wa_me_link: 'https://wa.me/5522222222222' } }),
  }));
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><WhatsAppWorkspace /></MemoryRouter></QueryClientProvider>);
}
describe('WhatsApp workspace', () => {
  it('does not mistake global credentials or owner phone for a connected restaurant', async () => {
    mount();
    expect(await screen.findByText('Connect to get started')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open conversation' })).not.toBeInTheDocument();
    expect(screen.queryByText('+5511111111111')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('test_status'))).toBe(true);
  });
  it('links only the registered customer-facing number', async () => {
    provision = { estado: 'ativo', numero_e164: '+5511999998888' };
    mount();
    expect(await screen.findByRole('link', { name: 'Open conversation' })).toHaveAttribute('href', 'https://wa.me/5511999998888');
    expect(screen.getByText(/Test an incoming conversation before/)).toBeInTheDocument();
  });
  it('shows pending verification instead of a success badge', async () => {
    provision = { estado: 'aguardando_codigo', numero_e164: '+5511999998888' };
    mount();
    expect(await screen.findByText('Verification in progress')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Verification code' })).toBeInTheDocument();
  });
  it('surfaces failed status reads with a retry, not an empty setup form', async () => {
    failStatus = true;
    mount();
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('Nothing has been changed');
    expect(screen.queryByPlaceholderText('11 3456-7890')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
  it('mounts optional settings on demand and preserves them when collapsed', async () => {
    mount();
    await screen.findByText('Connect to get started');
    expect(screen.queryByText('Personality editor')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText('How the AI replies'));
    expect(await screen.findByText('Personality editor')).toBeVisible();
    await user.click(screen.getByText('How the AI replies'));
    expect(screen.getByText('Personality editor')).not.toBeVisible();
  });
  it('distinguishes a platform delivery test from the customer conversation', async () => {
    mount();
    await screen.findByText('Connect to get started');
    await userEvent.click(screen.getByText('Check outbound delivery'));
    expect(await screen.findByText(/Delivery does not verify/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('test_status'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Send test message' })).toBeDisabled();
  });
  it('requires an international phone and sends to the existing test endpoint', async () => {
    mount();
    await screen.findByText('Connect to get started');
    const user = userEvent.setup();
    await user.click(screen.getByText('Check outbound delivery'));
    const input = await screen.findByLabelText(/Your number to receive the test/);
    await user.type(input, '11999998888');
    expect(screen.getByRole('button', { name: 'Send test message' })).toBeDisabled();
    await user.clear(input);
    await user.type(input, '+5511999998888');
    await user.click(screen.getByRole('button', { name: 'Send test message' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/whatsapp-settings?action=test', expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone_number: '+5511999998888' }) }));
    expect(await screen.findByText('Request accepted. Waiting for delivery confirmation.')).toBeInTheDocument();
  });
  it('honors recipient-specific delivery cooldowns', async () => {
    testMessage = { status: 'accepted', recipient_phone: '+5511999998888', requested_at: new Date().toISOString(), cooldown_expires_at: new Date(Date.now() + 60000).toISOString() };
    mount();
    await screen.findByText('Connect to get started');
    const user = userEvent.setup();
    await user.click(screen.getByText('Check outbound delivery'));
    const input = await screen.findByLabelText(/Your number to receive the test/);
    await user.type(input, '+5511999998888');
    expect(screen.getByRole('button', { name: 'Send test message' })).toBeDisabled();
    expect(screen.getByText(/Please wait before sending/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '+5511999997777');
    expect(screen.getByRole('button', { name: 'Send test message' })).toBeEnabled();
  });
  it('shows delivery failure rather than an unqualified sent message', async () => {
    testMessage = { status: 'failed', recipient_phone: '+5511999998888', error_message: 'Delivery rejected' };
    mount();
    await screen.findByText('Connect to get started');
    await userEvent.click(screen.getByText('Check outbound delivery'));
    expect(await screen.findByText('Delivery rejected')).toBeInTheDocument();
    expect(screen.queryByText('Request accepted. Waiting for delivery confirmation.')).not.toBeInTheDocument();
  });
  it('does not leave an old accepted message waiting indefinitely or invent delivery failure', async () => {
    testMessage = { status: 'accepted', recipient_phone: '+5511999998888', requested_at: '2020-06-09T13:09:00Z' };
    mount();
    await screen.findByText('Connect to get started');
    await userEvent.click(screen.getByText('Check outbound delivery'));
    expect(await screen.findByText('Delivery not confirmed')).toBeInTheDocument();
    expect(screen.getByText(/This does not prove the message failed/)).toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });
});
