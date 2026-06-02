import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DemoBanner from '../DemoBanner';

function renderBanner(daysLeft: number, token = 'test-token') {
  return render(
    <MemoryRouter>
      <DemoBanner daysLeft={daysLeft} token={token} />
    </MemoryRouter>,
  );
}

describe('DemoBanner', () => {
  it('renders neutral warm-white style when daysLeft > 2', () => {
    // Per DESIGN.md, burgundy is reserved for action (CTAs) — the demo banner's
    // non-urgent state must use a neutral background, not a burgundy tint.
    const { container } = renderBanner(5);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toMatch(/bg-warm-white/);
    expect(banner.className).not.toMatch(/bg-amber-50/);
    expect(banner.className).not.toMatch(/bg-red-50/);
  });

  it('renders amber style when daysLeft === 2', () => {
    const { container } = renderBanner(2);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toMatch(/bg-amber/);
  });

  it('renders amber style when daysLeft === 1', () => {
    const { container } = renderBanner(1);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toMatch(/bg-amber/);
  });

  it('renders red style when daysLeft <= 0', () => {
    const { container } = renderBanner(0);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toMatch(/bg-red/);
  });

  it('renders red style when daysLeft is negative', () => {
    const { container } = renderBanner(-3);
    const banner = container.firstChild as HTMLElement;
    expect(banner.className).toMatch(/bg-red/);
  });

  it('renders "N days left" text correctly', () => {
    renderBanner(5);
    expect(screen.getByText('Demo mode · 5 days left')).toBeInTheDocument();
  });

  it('renders singular "1 day left" text', () => {
    renderBanner(1);
    expect(screen.getByText('Demo mode · 1 day left')).toBeInTheDocument();
  });

  it('renders "Demo expired" when daysLeft <= 0', () => {
    renderBanner(0);
    expect(screen.getByText('Demo expired')).toBeInTheDocument();
  });

  it('upgrade CTA href includes ?from=demo&token=test-token', () => {
    renderBanner(5, 'test-token');
    const link = screen.getByRole('link', { name: /upgrade to keep your data/i });
    expect(link).toHaveAttribute('href', '/login?from=demo&token=test-token');
  });
});
