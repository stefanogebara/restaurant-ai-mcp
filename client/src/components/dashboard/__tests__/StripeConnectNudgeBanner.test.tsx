import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import StripeConnectNudgeBanner from '../StripeConnectNudgeBanner';

// authFetch backs useStripeConnectStatus
const mockAuthFetch = vi.fn();
vi.mock('../../../services/api', async () => {
  // useDepositConfig uses api.get/api.patch (an axios-style client).
  return {
    authFetch: (...args: unknown[]) => mockAuthFetch(...args),
    api: {
      get: vi.fn(async (path: string) => {
        if (path === '/deposit-config') {
          return mockDepositConfigResponse();
        }
        throw new Error(`Unexpected api.get(${path})`);
      }),
    },
  };
});

// Shared accessor so each test can set the deposit-config response.
let mockDepositConfigResponse = () => Promise.resolve({ data: { deposit_config: { enabled: false } } });
function setDepositConfig(payload: { enabled: boolean; type?: string; amount?: number }) {
  mockDepositConfigResponse = () => Promise.resolve({ data: { deposit_config: payload } });
}

function stubConnectStatus(body: unknown) {
  mockAuthFetch.mockReturnValue(
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response),
  );
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe('StripeConnectNudgeBanner', () => {
  it('renders nothing while queries are loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => { /* hangs */ }));
    setDepositConfig({ enabled: true });
    const { container } = render(<StripeConnectNudgeBanner />);
    expect(container.querySelector('[data-testid="stripe-connect-nudge-banner"]')).toBeNull();
  });

  it('renders nothing when deposits are disabled (no nag)', async () => {
    setDepositConfig({ enabled: false });
    stubConnectStatus({ success: true, connected: false });
    const { container } = render(<StripeConnectNudgeBanner />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-nudge-banner"]')).toBeNull();
  });

  it('renders nothing when already connected (badge handles ongoing states)', async () => {
    setDepositConfig({ enabled: true, type: 'flat', amount: 50 });
    stubConnectStatus({ success: true, connected: true, status: 'active', account_id: 'acct_1' });
    const { container } = render(<StripeConnectNudgeBanner />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-nudge-banner"]')).toBeNull();
  });

  it('renders nothing even when status=revoked (badge owns that messaging)', async () => {
    // This is the most subtle case: a revoked restaurant is "not active"
    // but they're also `connected: true`, so the badge already nags them.
    // We must not double-nag with a banner.
    setDepositConfig({ enabled: true, type: 'flat', amount: 50 });
    stubConnectStatus({ success: true, connected: true, status: 'revoked', account_id: 'acct_old' });
    const { container } = render(<StripeConnectNudgeBanner />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-nudge-banner"]')).toBeNull();
  });

  it('renders the banner when deposits enabled AND not connected', async () => {
    setDepositConfig({ enabled: true, type: 'flat', amount: 50 });
    stubConnectStatus({ success: true, connected: false });
    render(<StripeConnectNudgeBanner />);

    const banner = await screen.findByTestId('stripe-connect-nudge-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Connect your Stripe account/i);
    expect(banner.textContent).toMatch(/currently routed through Seatable/i);
    const cta = screen.getByRole('link', { name: /Connect Stripe/i });
    expect(cta.getAttribute('href')).toBe('/host-dashboard/voice-settings#tab=pos');
  });

  it('renders the banner for per-person deposit config too', async () => {
    setDepositConfig({ enabled: true, type: 'per_person', amount: 20 });
    stubConnectStatus({ success: true, connected: false });
    render(<StripeConnectNudgeBanner />);
    expect(await screen.findByTestId('stripe-connect-nudge-banner')).toBeInTheDocument();
  });

  it('renders nothing if the connect-status response is success:false (graceful degrade)', async () => {
    // The hook resolves to { success: false, connected: false } when the
    // API call fails (ok=false). Without confirmed state we must not nag —
    // we might be telling a fully-connected restaurant to "connect Stripe".
    setDepositConfig({ enabled: true });
    mockAuthFetch.mockReturnValue(Promise.resolve({ ok: false } as Response));
    const { container } = render(<StripeConnectNudgeBanner />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    // Give React Query a turn to apply the result.
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-testid="stripe-connect-nudge-banner"]')).toBeNull();
  });
});
