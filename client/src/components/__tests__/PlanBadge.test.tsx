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
  it('renders the plan name text for Starter plan', () => {
    render(<PlanBadge plan="Starter" />);

    expect(screen.getByText('Starter')).toBeInTheDocument();
  });

  it('renders the zap icon for Starter plan', () => {
    render(<PlanBadge plan="Starter" />);

    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
  });

  it('renders the plan name text for Growth plan', () => {
    render(<PlanBadge plan="Growth" />);

    expect(screen.getByText('Growth')).toBeInTheDocument();
  });

  it('renders the star icon for Growth plan', () => {
    render(<PlanBadge plan="Growth" />);

    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });

  it('renders the plan name text for Scale plan', () => {
    render(<PlanBadge plan="Scale" />);

    expect(screen.getByText('Scale')).toBeInTheDocument();
  });

  it('renders the crown icon for Scale plan', () => {
    render(<PlanBadge plan="Scale" />);

    expect(screen.getByTestId('icon-crown')).toBeInTheDocument();
  });

  it('falls back to zap icon for unknown plan', () => {
    render(<PlanBadge plan="Unknown" />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
  });

  it('does not show Free Trial badge when isTrial is false', () => {
    render(<PlanBadge plan="Starter" isTrial={false} />);

    expect(screen.queryByText('Free Trial')).not.toBeInTheDocument();
  });

  it('shows Free Trial badge when isTrial is true', () => {
    render(<PlanBadge plan="Growth" isTrial={true} />);

    expect(screen.getByText('Free Trial')).toBeInTheDocument();
  });

  it('does not show Free Trial badge by default (isTrial defaults to false)', () => {
    render(<PlanBadge plan="Starter" />);

    expect(screen.queryByText('Free Trial')).not.toBeInTheDocument();
  });

  it('renders small size variant', () => {
    const { container } = render(<PlanBadge plan="Starter" size="small" />);

    // Small size uses text-xs class
    const badge = container.querySelector('.text-xs');
    expect(badge).toBeTruthy();
  });

  it('renders medium size variant by default', () => {
    const { container } = render(<PlanBadge plan="Starter" />);

    // Medium size uses text-sm class
    const badge = container.querySelector('.text-sm');
    expect(badge).toBeTruthy();
  });

  it('renders large size variant', () => {
    const { container } = render(<PlanBadge plan="Starter" size="large" />);

    // Large size uses text-base class
    const badge = container.querySelector('.text-base');
    expect(badge).toBeTruthy();
  });

  it('is case-insensitive for plan name matching (renders correct icon)', () => {
    render(<PlanBadge plan="GROWTH" />);

    // Plan name is displayed as-is (preserves case)
    expect(screen.getByText('GROWTH')).toBeInTheDocument();
    // But icon matching is case-insensitive
    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });

  it('renders zap icon for Portuguese plan name Inicial', () => {
    render(<PlanBadge plan="Inicial" />);
    expect(screen.getByText('Inicial')).toBeInTheDocument();
    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
  });

  it('renders star icon for Portuguese plan name Crescimento', () => {
    render(<PlanBadge plan="Crescimento" />);
    expect(screen.getByText('Crescimento')).toBeInTheDocument();
    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
  });

  it('renders crown icon for Portuguese plan name Escala', () => {
    render(<PlanBadge plan="Escala" />);
    expect(screen.getByText('Escala')).toBeInTheDocument();
    expect(screen.getByTestId('icon-crown')).toBeInTheDocument();
  });
});
