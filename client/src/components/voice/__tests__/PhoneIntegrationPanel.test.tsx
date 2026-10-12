import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import PhoneIntegrationPanel from '../PhoneIntegrationPanel';

vi.mock('../../../hooks/usePhoneIntegration', () => ({
  usePhoneIntegration: () => ({
    isLoading: false,
    isError: false,
    status: {
      restaurant: { status: 'needs_review', has_agent: true },
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
});
