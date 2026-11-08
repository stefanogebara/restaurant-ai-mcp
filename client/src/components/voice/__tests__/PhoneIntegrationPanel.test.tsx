import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import PhoneIntegrationPanel from '../PhoneIntegrationPanel';

const mockPhoneStatus = vi.hoisted(() => ({ status: 'needs_review' }));
vi.mock('../../../hooks/usePhoneIntegration', () => ({
  usePhoneIntegration: () => ({
    isLoading: false,
    isError: false,
    status: {
      restaurant: { status: mockPhoneStatus.status, has_agent: true },
      platform: { activation_mode: 'assisted', routing_verified: false },
    },
  }),
}));

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
