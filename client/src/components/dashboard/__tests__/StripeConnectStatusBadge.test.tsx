import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import StripeConnectStatusBadge from '../StripeConnectStatusBadge';

// Mock authFetch — the badge's only side effect is the GET on
// /api/stripe-connect-status. We return canned responses per test.
const mockAuthFetch = vi.fn();
vi.mock('../../../services/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  mockAuthFetch.mockReset();
});

describe('StripeConnectStatusBadge', () => {
  it('renders nothing while loading', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => { /* never resolves */ }));
    const { container } = render(<StripeConnectStatusBadge />);
    expect(container.querySelector('[data-testid="stripe-connect-status-badge"]')).toBeNull();
  });

  it('renders nothing when not connected', async () => {
    mockAuthFetch.mockReturnValue(ok({ success: true, connected: false }));
    const { container } = render(<StripeConnectStatusBadge />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-status-badge"]')).toBeNull();
  });

  it('renders nothing when status=active (everything fine)', async () => {
    mockAuthFetch.mockReturnValue(ok({
      success: true,
      connected: true,
      status: 'active',
      account_id: 'acct_1',
    }));
    const { container } = render(<StripeConnectStatusBadge />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-status-badge"]')).toBeNull();
  });

  it('renders amber pill for pending', async () => {
    mockAuthFetch.mockReturnValue(ok({
      success: true,
      connected: true,
      status: 'pending',
      account_id: 'acct_1',
    }));
    render(<StripeConnectStatusBadge />);
    const badge = await screen.findByTestId('stripe-connect-status-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-amber-50');
    expect(badge.className).toContain('text-amber-800');
    expect(badge.textContent).toMatch(/Finish Stripe onboarding/i);
  });

  it('renders amber pill for restricted', async () => {
    mockAuthFetch.mockReturnValue(ok({
      success: true,
      connected: true,
      status: 'restricted',
      account_id: 'acct_1',
    }));
    render(<StripeConnectStatusBadge />);
    const badge = await screen.findByTestId('stripe-connect-status-badge');
    expect(badge.className).toContain('bg-amber-50');
    expect(badge.textContent).toMatch(/Stripe needs attention/i);
  });

  it('renders red pill for disabled', async () => {
    mockAuthFetch.mockReturnValue(ok({
      success: true,
      connected: true,
      status: 'disabled',
      account_id: 'acct_1',
    }));
    render(<StripeConnectStatusBadge />);
    const badge = await screen.findByTestId('stripe-connect-status-badge');
    expect(badge.className).toContain('bg-red-50');
    expect(badge.textContent).toMatch(/Stripe disabled/i);
  });

  it('renders red pill for revoked + links to Voice Settings POS tab', async () => {
    mockAuthFetch.mockReturnValue(ok({
      success: true,
      connected: true,
      status: 'revoked',
      account_id: 'acct_1',
    }));
    render(<StripeConnectStatusBadge />);
    const badge = await screen.findByTestId('stripe-connect-status-badge');
    expect(badge.className).toContain('bg-red-50');
    expect(badge.textContent).toMatch(/Stripe disconnected/i);
    expect(badge.getAttribute('href')).toBe('/host-dashboard/voice-settings#tab=pos');
  });

  it('renders nothing if API call fails (graceful degradation)', async () => {
    mockAuthFetch.mockReturnValue(Promise.resolve({ ok: false } as Response));
    const { container } = render(<StripeConnectStatusBadge />);
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="stripe-connect-status-badge"]')).toBeNull();
  });
});
