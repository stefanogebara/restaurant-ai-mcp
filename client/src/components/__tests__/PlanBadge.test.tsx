import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlanBadge from '../PlanBadge';

// Mock ThiingsIcon to avoid loading actual image assets
vi.mock('../common/ThiingsIcon', () => ({
  default: ({ name, pxSize }: { name: string; pxSize?: number }) => (
    <span data-testid={`icon-${name}`} style={{ width: pxSize, height: pxSize }} />
  ),
}));

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('PlanBadge', () => {
  it('renders the plan name text for Basic plan', () => {
    render(<PlanBadge plan="Basic" />);

    expect(screen.getByText('Basic')).toBeInTheDocument();
  });

  it('renders the zap icon for Basic plan', () => {
    render(<PlanBadge plan="Basic" />);

    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
  });

  it('renders the plan name text for Professional plan', () => {
    render(<PlanBadge plan="Professional" />);

    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('renders the star icon for Professional plan', () => {
    render(<PlanBadge plan="Professional" />);

    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });

  it('renders the plan name text for Enterprise plan', () => {
    render(<PlanBadge plan="Enterprise" />);

    expect(screen.getByText('Enterprise')).toBeInTheDocument();
  });

  it('renders the crown icon for Enterprise plan', () => {
    render(<PlanBadge plan="Enterprise" />);

    expect(screen.getByTestId('icon-crown')).toBeInTheDocument();
  });

  it('falls back to zap icon for unknown plan', () => {
    render(<PlanBadge plan="Unknown" />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
  });

  it('does not show Free Trial badge when isTrial is false', () => {
    render(<PlanBadge plan="Basic" isTrial={false} />);

    expect(screen.queryByText('Free Trial')).not.toBeInTheDocument();
  });

  it('shows Free Trial badge when isTrial is true', () => {
    render(<PlanBadge plan="Professional" isTrial={true} />);

    expect(screen.getByText('Free Trial')).toBeInTheDocument();
  });

  it('does not show Free Trial badge by default (isTrial defaults to false)', () => {
    render(<PlanBadge plan="Basic" />);

    expect(screen.queryByText('Free Trial')).not.toBeInTheDocument();
  });

  it('renders small size variant', () => {
    const { container } = render(<PlanBadge plan="Basic" size="small" />);

    // Small size uses text-xs class
    const badge = container.querySelector('.text-xs');
    expect(badge).toBeTruthy();
  });

  it('renders medium size variant by default', () => {
    const { container } = render(<PlanBadge plan="Basic" />);

    // Medium size uses text-sm class
    const badge = container.querySelector('.text-sm');
    expect(badge).toBeTruthy();
  });

  it('renders large size variant', () => {
    const { container } = render(<PlanBadge plan="Basic" size="large" />);

    // Large size uses text-base class
    const badge = container.querySelector('.text-base');
    expect(badge).toBeTruthy();
  });

  it('is case-insensitive for plan name matching (renders correct icon)', () => {
    render(<PlanBadge plan="PROFESSIONAL" />);

    // Plan name is displayed as-is (preserves case)
    expect(screen.getByText('PROFESSIONAL')).toBeInTheDocument();
    // But icon matching is case-insensitive
    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });
});
