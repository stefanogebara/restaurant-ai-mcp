import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import PhoneIntegrationPanel from '../PhoneIntegrationPanel';

const mockPhoneStatus = vi.hoisted(() => ({ status: 'needs_review', shared: false, hasAgent: true, failed: false, fetching: false }));
const refetchPhone = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/usePhoneIntegration', () => ({
  usePhoneIntegration: () => ({
    isLoading: false,
    isFetching: mockPhoneStatus.fetching,
    refetch: refetchPhone,
    isError: mockPhoneStatus.failed,
    status: {
      restaurant: { status: mockPhoneStatus.status, has_agent: mockPhoneStatus.hasAgent, shared_routing_enabled: mockPhoneStatus.shared },
      platform: { activation_mode: 'assisted', routing_verified: false },
    },
  }),
}));

beforeEach(() => { Object.assign(mockPhoneStatus, { status: 'needs_review', shared: false, hasAgent: true, failed: false, fetching: false }); refetchPhone.mockClear(); });

describe('PhoneIntegrationPanel', () => {
  it('does not present a shared platform number as the restaurant line or allow self-service activation', () => {
    render(<PhoneIntegrationPanel />);
    expect(screen.getByText(/routing check/i)).toBeVisible();
    expect(screen.getByText(/Do not forward your line yet/i)).toBeVisible();
    expect(screen.queryByText(/5028-9356/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect|test call/i })).not.toBeInTheDocument();
  });

  it('shows setup help instead of a routing warning when no number is assigned', () => {
    mockPhoneStatus.status = 'not_configured';
    try {
      render(<PhoneIntegrationPanel />);
      expect(screen.getByRole('heading', { name: 'Phone not connected' })).toBeVisible();
      expect(screen.getByText(/No number has been assigned to this restaurant/)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Ask Seatable to connect the phone' })).toBeVisible();
      expect(screen.queryByText(/shared|routing check|older setup/i)).not.toBeInTheDocument();
    } finally {
      mockPhoneStatus.status = 'needs_review';
    }
  });
});


it('describes shared setup without claiming the line is disconnected or an individual agent is required', () => {
  Object.assign(mockPhoneStatus, { status: 'not_configured', shared: true, hasAgent: false });
  render(<PhoneIntegrationPanel />);
  expect(screen.getByRole('heading', { name: 'Shared routing configured' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Phone not connected' })).not.toBeInTheDocument();
  expect(screen.queryByText(/No number has been assigned/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No individual agent is linked/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ask Seatable to connect the phone' })).not.toBeInTheDocument();
  expect(screen.queryByText(/5028-9356/)).not.toBeInTheDocument();
});


it('retries a local fetch failure while preserving the support link', () => {
  mockPhoneStatus.failed = true;
  render(<PhoneIntegrationPanel />);
  expect(screen.getByRole('heading', { name: 'Phone status unavailable' })).toBeVisible();
  const retry = screen.getByRole('button', { name: 'Retry' });
  expect(retry.className).toContain('min-h-11');
  expect(retry.className).toContain('focus-visible:ring-2');
  fireEvent.click(retry);
  expect(refetchPhone).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: 'Ask Seatable to verify phone routing' })).toHaveAttribute('href', 'mailto:hello@seatable.one?subject=Voice%20phone%20setup');
});

it('disables retry and announces a pending fetch', () => {
  Object.assign(mockPhoneStatus, { failed: true, fetching: true });
  render(<PhoneIntegrationPanel />);
  const retry = screen.getByRole('button', { name: 'Retry' });
  expect(retry).toBeDisabled();
  expect(retry).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(retry);
  expect(refetchPhone).not.toHaveBeenCalled();
});

it('keeps a saved setup failure distinct from a fetch failure', () => {
  mockPhoneStatus.status = 'error';
  render(<PhoneIntegrationPanel />);
  expect(screen.getByRole('heading', { name: 'Phone connection needs attention' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ask Seatable to verify phone routing' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});
