import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpgradeBanner from '../UpgradeBanner';

// Mock ThiingsIcon to avoid loading actual image assets
vi.mock('../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => (
    <span data-testid={`icon-${name}`} />
  ),
}));

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('UpgradeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset location.href between tests
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  // -- Default (non-compact) variant --

  it('renders the feature name in the "Unlock" heading', () => {
    render(<UpgradeBanner feature="Advanced Analytics" />);

    expect(screen.getByText('Unlock Advanced Analytics')).toBeInTheDocument();
  });

  it('renders the upgrade description text', () => {
    render(<UpgradeBanner feature="Advanced Analytics" />);

    expect(
      screen.getByText('Upgrade to the Profissional plan to access this feature'),
    ).toBeInTheDocument();
  });

  it('renders the "View Plans" button in default variant', () => {
    render(<UpgradeBanner feature="Waitlist Management" />);

    expect(screen.getByRole('button', { name: /view plans/i })).toBeInTheDocument();
  });

  it('navigates to /#pricing when "View Plans" button is clicked', async () => {
    const user = userEvent.setup();
    render(<UpgradeBanner feature="Waitlist Management" />);

    await user.click(screen.getByRole('button', { name: /view plans/i }));

    expect(window.location.href).toBe('/precos');
  });

  it('renders the sparkles icon in default variant', () => {
    render(<UpgradeBanner feature="SMS Notifications" />);

    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
  });

  it('renders the arrow-right icon in the View Plans button', () => {
    render(<UpgradeBanner feature="SMS Notifications" />);

    expect(screen.getByTestId('icon-arrow-right')).toBeInTheDocument();
  });

  // -- Compact variant --

  it('renders compact variant with feature name and "available on Profissional"', () => {
    render(<UpgradeBanner feature="Custom Reports" compact />);

    expect(screen.getByText('Custom Reports')).toBeInTheDocument();
    expect(screen.getByText(/available/i)).toBeInTheDocument();
    expect(screen.getByText(/Profissional/i)).toBeInTheDocument();
  });

  it('renders "Upgrade" button in compact variant', () => {
    render(<UpgradeBanner feature="Custom Reports" compact />);

    expect(screen.getByRole('button', { name: /upgrade/i })).toBeInTheDocument();
  });

  it('navigates to /#pricing when compact "Upgrade" button is clicked', async () => {
    const user = userEvent.setup();
    render(<UpgradeBanner feature="Custom Reports" compact />);

    await user.click(screen.getByRole('button', { name: /upgrade/i }));

    expect(window.location.href).toBe('/precos');
  });

  it('does not render "View Plans" button in compact variant', () => {
    render(<UpgradeBanner feature="Custom Reports" compact />);

    expect(screen.queryByRole('button', { name: /view plans/i })).not.toBeInTheDocument();
  });

  it('does not render "Unlock" heading in compact variant', () => {
    render(<UpgradeBanner feature="Custom Reports" compact />);

    expect(screen.queryByText(/Unlock/)).not.toBeInTheDocument();
  });
});
